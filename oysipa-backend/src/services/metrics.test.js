// Story 11.14: shared metrics service and the analytics routes. Synthetic data only.
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const EvidenceFolder = require('../models/EvidenceFolder');
const Setting = require('../models/Setting');
const {
  median, stats, valueStats, ngnEquivalent, change, yearSeries, servicesByCode, resolveYear, countryBreakdown, overview, mine,
} = require('./metrics');
const { todayLagos } = require('../utils/happenedDate');

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const daysAgo = (n) => new Date(Date.parse(`${todayLagos()}T00:00:00Z`) - n * 86400000);
const dayStr = (d) => d.toISOString().slice(0, 10);

describe('pure helpers', () => {
  it('median and average: 1, 2, 100 → median 2, average 34.3', () => {
    expect(median([100, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    const s = stats([1, 2, 100]);
    expect(s).toMatchObject({ sum: 103, count: 3, median: 2 });
    expect(s.average).toBeCloseTo(34.33, 2);
  });

  it('no values → null average and median, coverage 0', () => {
    expect(stats([])).toEqual({
      sum: 0, count: 0, average: null, median: null,
    });
    const v = valueStats([{ estimatedValue: 0, currency: 'NGN' }, { currency: 'USD' }]);
    expect(v.byCurrency).toEqual({});
    expect(v.coverage).toEqual({ with: 0, total: 2 });
  });

  it('values are per currency, never added together; missing currency counts as NGN (the default)', () => {
    const v = valueStats([
      { estimatedValue: 100, currency: 'NGN' }, { estimatedValue: 50 }, { estimatedValue: 10, currency: 'USD' }, { estimatedValue: 0, currency: 'USD' },
    ]);
    expect(v.byCurrency.NGN).toMatchObject({ sum: 150, count: 2 });
    expect(v.byCurrency.USD).toMatchObject({ sum: 10, count: 1 });
    expect(v.coverage).toEqual({ with: 3, total: 4 });
  });

  it('₦ equivalent: NGN + converted at the latest rate, with the rate date; a missing rate → null', () => {
    const by = { NGN: stats([1.26e12]), USD: stats([391e6]) };
    const fx = { latest: { USD: { rate: 1361.84, asOf: '2026-10-23', source: 'CBN', stale: false } } };
    const eq = ngnEquivalent(by, fx);
    expect(eq.value).toBeCloseTo(1.26e12 + 391e6 * 1361.84, 0);
    expect(eq.ratesUsed).toEqual([{
      currency: 'USD', rate: 1361.84, asOf: '2026-10-23', source: 'CBN', stale: false,
    }]);
    const withEur = ngnEquivalent({ ...by, EUR: stats([8e6]) }, fx);
    expect(withEur.value).toBeNull();
    expect(withEur.missing).toEqual(['EUR']);
  });

  it('currency Other is left out of the ₦ equivalent and listed in excluded (never a permanent null)', () => {
    const eq = ngnEquivalent({ NGN: stats([100]), Other: stats([5]) }, { latest: {} });
    expect(eq).toMatchObject({ value: 100, missing: [], excluded: ['Other'] });
  });

  it('yearSeries puts years before the first series year in earlier', () => {
    const s = yearSeries([day('2001-01-01'), day('2009-06-01'), day('2026-01-01')], 2026);
    expect(s.series[0].year).toBe(2011);
    expect(s.series).toHaveLength(16);
    expect(s.earlier).toBe(2);
  });

  it('countryBreakdown: top 8 named, then Others, then Not recorded', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const investors = names.flatMap((n, i) => Array.from({ length: 12 - i }, () => ({ countryOfOrigin: `Land ${n}` })));
    investors.push({ countryOfOrigin: 'Not stated' }, { countryOfOrigin: '' }, { countryOfOrigin: 'land a' });
    const b = countryBreakdown(investors);
    expect(b.items.map((i) => i.label)).toEqual(['Land A', 'Land B', 'Land C', 'Land D', 'Land E', 'Land F', 'Land G', 'Land H', 'Others', 'Not recorded']);
    expect(b.items[0].count).toBe(13);
    expect(b.items[8]).toMatchObject({ count: 3 + 4, countries: 2, to: null });
    expect(b.items[9]).toMatchObject({ count: 2, notRecorded: true });
    expect(b.items[0].to).toBe('/investors?country=Land+A&organisationType=Investor');
    expect(b.coverage).toEqual({ with: investors.length - 2, total: investors.length });
  });

  it('change: previous year 0 → "new"', () => {
    expect(change(5, 0)).toMatchObject({ isNew: true, pct: null, delta: 5 });
    expect(change(0, 0)).toMatchObject({ isNew: false, pct: null });
    expect(change(6, 3)).toMatchObject({ pct: 1, delta: 3, isNew: false });
  });

  it('yearSeries counts happened dates and keeps undated apart', () => {
    const s = yearSeries([day('2024-03-01'), day('2025-01-01'), day('2025-12-31'), null, undefined], 2026);
    expect(s.series.find((r) => r.year === 2025).count).toBe(2);
    expect(s.series.find((r) => r.year === 2026).count).toBe(0);
    expect(s.series[0].year).toBe(2023);
    expect(s.undated).toBe(2);
  });

  it('services by code count each code once per interaction', () => {
    const s = servicesByCode([{ serviceCodes: ['M4', 'M4', 'A1'] }, { serviceCodes: [] }, { serviceCodes: ['A1'], creditLinkage: true }]);
    expect(s.codes.find((c) => c.code === 'A1').count).toBe(2);
    expect(s.codes.find((c) => c.code === 'M4').count).toBe(1);
    expect(s).toMatchObject({ interactions: 3, tagged: 2, creditLinkage: 1, coverage: { with: 2, total: 3 } });
  });

  it('resolveYear: default current, "all" → null, bad → error', () => {
    expect(resolveYear(undefined, '2026-10-26')).toEqual({ year: 2026, current: 2026 });
    expect(resolveYear('all', '2026-10-26')).toEqual({ year: null, current: 2026 });
    expect(resolveYear('2025', '2026-10-26')).toEqual({ year: 2025, current: 2026 });
    expect(resolveYear('20x5').error).toBeDefined();
    expect(resolveYear(['2025']).error).toBeDefined();
    expect(resolveYear('1999', '2026-10-26').error).toMatch(/2000 to 2026/);
    expect(resolveYear('2027', '2026-10-26').error).toBeDefined();
    expect(resolveYear('2000', '2026-10-26')).toEqual({ year: 2000, current: 2026 });
  });
});

describe('overview and mine (database)', () => {
  let staff;
  let staffToken;
  let otherStaff;
  let st;
  let mineInv;
  let otherInv;

  beforeAll(async () => {
    await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
  });

  beforeEach(async () => {
    await Promise.all([
      Setting.collection.deleteMany({}), InvestorIssue.collection.deleteMany({}), InvestmentAnnouncement.collection.deleteMany({}),
      EvidenceFile.collection.deleteMany({}), EvidenceFolder.collection.deleteMany({}),
      Investor.deleteMany({}), InvestmentProject.deleteMany({}), InteractionLog.deleteMany({}), LifecycleStatus.deleteMany({}),
    ]);
    staff = await User.create({ name: 'Metrics Staff', email: 'metrics.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
    otherStaff = await User.create({ name: 'Other Metrics', email: 'other.metrics@example.com', password: 'password123', role: 'Staff', status: 'active' });
    staffToken = sign(staff);
    const names = ['Initial Lead', 'Lead', 'Commitment', 'Existing investor', 'Planning'];
    st = {};
    for (const [i, name] of names.entries()) {
      // eslint-disable-next-line no-await-in-loop
      st[name] = await LifecycleStatus.create({ name, order: i + 1 });
    }

    mineInv = await Investor.create({
      investorName: 'Mine Agro', sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Business event or conference', firstContactDate: day('2025-02-01'), assignedTo: staff._id,
    });
    const mineGap = await Investor.create({
      investorName: 'Mine Gap', sector: 'Not known', countryOfOrigin: 'Not stated', leadSource: 'Unknown (pre-T11)', assignedTo: staff._id,
    });
    otherInv = await Investor.create({
      investorName: 'Other Tour', sector: 'Culture and tourism', countryOfOrigin: 'France', leadSource: 'Other', firstContactDate: day('2024-06-01'), assignedTo: otherStaff._id,
    });
    const broker = await Investor.create({
      investorName: 'Broker', sector: 'Financial services', countryOfOrigin: 'Nigeria', organisationType: 'Intermediary', firstContactDate: day('2025-03-01'),
    });

    // Projects: dateRegistered/createdAt in 2026 must never drive year on year.
    const p1 = await InvestmentProject.create({
      projectTitle: 'Mill', investor: mineInv._id, lifecycleStatus: st.Commitment._id, estimatedValue: 1, currency: 'NGN', estimatedNumberOfJobs: 10, dateRegistered: day('2026-01-05'),
    });
    await InvestmentProject.create({
      projectTitle: 'Silo', investor: mineInv._id, lifecycleStatus: st['Existing investor']._id, estimatedValue: 2, currency: 'NGN', dateRegistered: day('2026-01-05'),
    });
    await InvestmentProject.create({
      projectTitle: 'Hotel', investor: otherInv._id, lifecycleStatus: st.Lead._id, estimatedValue: 100, currency: 'NGN', estimatedNumberOfJobs: 5,
    });
    await InvestmentProject.create({
      projectTitle: 'Resort', investor: otherInv._id, lifecycleStatus: st.Lead._id, estimatedValue: 10, currency: 'USD',
    });
    await InvestmentProject.create({ projectTitle: 'Gap plan', investor: mineGap._id, lifecycleStatus: st['Initial Lead']._id });
    // An intermediary's project: outside the headline scope (type Investor only).
    await InvestmentProject.create({
      projectTitle: 'Broker desk', investor: broker._id, lifecycleStatus: st.Lead._id, estimatedValue: 999, currency: 'NGN', estimatedNumberOfJobs: 50,
    });

    // Announcements: 2024 one named, 2025 two (one named).
    await InvestmentAnnouncement.create([
      { project: p1._id, announcementDate: day('2024-05-01'), outlet: 'Paper A', oysipaNamed: true, oysipaRoleText: 'facilitated' },
      { project: p1._id, announcementDate: day('2025-05-01'), outlet: 'Paper B', oysipaNamed: true, oysipaRoleText: 'facilitated' },
      { project: p1._id, announcementDate: day('2025-07-01'), outlet: 'Paper C', oysipaNamed: false },
    ]);

    // Interactions: happened dates; one undated; System Update logs not counted.
    await InteractionLog.create([
      { investor: mineInv._id, loggedBy: staff._id, description: 'Visit', category: 'Meeting', interactionDate: day('2025-04-01'), serviceCodes: ['A1', 'M4'] },
      { investor: mineInv._id, loggedBy: staff._id, description: 'Call', category: 'Call', interactionDate: daysAgo(1), serviceCodes: [] },
      { investor: otherInv._id, loggedBy: otherStaff._id, description: 'Tour', category: 'Meeting', interactionDate: day('2024-04-01'), serviceCodes: ['A1'] },
      { investor: otherInv._id, loggedBy: otherStaff._id, description: 'Old note', category: 'Meeting' },
      { project: p1._id, loggedBy: staff._id, description: 'Lifecycle status changed', category: 'System Update', interactionDate: day('2025-04-02') },
    ]);

    // Issues on my investors: one stale (last action 20 days ago), one fresh, one resolved.
    await InvestorIssue.create([
      {
        investor: mineInv._id, dateRegistered: daysAgo(30), dateReported: daysAgo(30), category: 'other', description: 'Stale', status: 'Open', actions: [{ date: daysAgo(20), note: 'chased', recordedBy: staff._id, recordedAt: new Date() }],
      },
      {
        investor: mineInv._id, dateRegistered: daysAgo(3), dateReported: daysAgo(3), category: 'other', description: 'Fresh', status: 'In progress',
      },
      {
        investor: otherInv._id, dateRegistered: daysAgo(30), dateReported: daysAgo(30), category: 'other', description: 'Theirs', status: 'Open',
      },
    ]);

    const folder = await EvidenceFolder.create({ key: 'metrics', name: 'Metrics' });
    await EvidenceFile.create({
      folder: folder._id, fileName: 'a.pdf', mimeType: 'application/pdf', size: 1, sha256: 'x1', provider: 'fake', key: 'k1', uploadedBy: staff._id, uploadedAt: new Date(),
    });
  });

  it('Staff → GET /api/analytics/overview is 403; DG/PA → 200', async () => {
    const res = await request(app).get('/api/analytics/overview').set('Authorization', bearer(staffToken)).expect(403);
    expect(res.body).toHaveProperty('msg');
    await request(app).get('/api/analytics/overview?year=2025').set('Authorization', bearer(global.dgToken)).expect(200);
    await request(app).get('/api/analytics/overview?year=all').set('Authorization', bearer(global.portalAdminToken)).expect(200);
    await request(app).get('/api/analytics/overview?year=abc').set('Authorization', bearer(global.dgToken)).expect(400);
  });

  it('headline: investor counts leave out intermediaries; values per currency with coverage; jobs', async () => {
    const o = await overview({ year: 2025 });
    expect(o.headline.investors).toMatchObject({ total: 3, records: 4 });
    expect(o.headline.investors.byType).toMatchObject({ Investor: 3, Intermediary: 1 });
    expect(o.headline.projects).toMatchObject({ total: 5, all: 6, scope: expect.stringMatching(/organisation type Investor/) });
    expect(o.headline.projects.byStageGroup).toMatchObject({ 'Early pipeline': 3, 'Commitment or execution': 1, Operating: 1 });
    expect(o.headline.values.byCurrency.NGN).toMatchObject({ sum: 103, count: 3, median: 2 });
    expect(o.headline.values.byCurrency.NGN.average).toBeCloseTo(34.33, 2);
    expect(o.headline.values.coverage).toEqual({ with: 4, total: 5 });
    expect(o.headline.jobs).toMatchObject({ sum: 15, count: 2, coverage: { with: 2, total: 5 } });
    // No USD rate yet: the ₦ equivalent is null with a "set rates" note.
    expect(o.headline.values.ngnEquivalent).toMatchObject({ value: null, missing: ['USD'] });
  });

  it('₦ equivalent uses the latest rate and its date; a stale rate is flagged', async () => {
    const asOf = dayStr(daysAgo(40));
    await Setting.create({ key: 'fxRates', value: [{ currency: 'USD', rate: 1000, asOf, source: 'test' }] });
    const o = await overview({ year: 2025 });
    expect(o.headline.values.ngnEquivalent).toMatchObject({ value: 103 + 10 * 1000, missing: [], stale: true });
    expect(o.headline.values.ngnEquivalent.ratesUsed[0]).toMatchObject({ currency: 'USD', asOf });
    expect(o.fx.stale).toEqual(['USD']);
  });

  it('year on year uses happened dates only; change vs the previous year; "new" when it was 0', async () => {
    const o = await overview({ year: 2025 });
    const y = (series, year) => series.find((s) => s.year === year);
    expect(y(o.yearOnYear.announcements.series, 2025)).toEqual({ year: 2025, count: 2, oysipaNamed: 1 });
    expect(y(o.yearOnYear.announcements.series, 2024)).toEqual({ year: 2024, count: 1, oysipaNamed: 1 });
    // New investors by first-contact year (intermediary left out); one undated.
    expect(y(o.yearOnYear.newInvestors.series, 2025).count).toBe(1);
    expect(y(o.yearOnYear.newInvestors.series, 2024).count).toBe(1);
    expect(o.yearOnYear.newInvestors.undated).toBe(1);
    // Interactions by happened year; the System Update log is not counted; one undated.
    expect(y(o.yearOnYear.interactions.series, 2025).count).toBe(1);
    expect(o.yearOnYear.interactions.undated).toBe(1);
    // Nothing is counted in 2026 from project dateRegistered / createdAt.
    expect(y(o.yearOnYear.newInvestors.series, Number(todayLagos().slice(0, 4))).count).toBe(0);
    expect(o.yearOnYear.change).toMatchObject({
      year: 2025, previousYear: 2024, announcements: { current: 2, previous: 1, delta: 1 }, newInvestors: { current: 1, previous: 1 },
    });
    expect(o.yearOnYear.services.codes.find((c) => c.code === 'M4').count).toBe(1);
    const o2024 = await overview({ year: 2024 });
    expect(o2024.yearOnYear.change.announcements).toMatchObject({ current: 1, previous: 0, isNew: true });
  });

  it('breakdowns: stage in status order, sector with priority flag and Not recorded, country, lead source; links', async () => {
    const o = await overview({ year: 2025 });
    expect(o.breakdowns.stage.items.map((i) => [i.label, i.count])).toEqual([
      ['Initial Lead', 1], ['Lead', 2], ['Commitment', 1], ['Existing investor', 1], ['Planning', 0],
    ]);
    const agri = o.breakdowns.sector.items.find((i) => i.label === 'Agribusiness');
    expect(agri).toMatchObject({ count: 1, priority: true, to: '/investors?sector=Agribusiness&organisationType=Investor' });
    expect(o.breakdowns.sector.items.find((i) => i.label === 'Not recorded')).toMatchObject({ count: 1, notRecorded: true });
    expect(o.breakdowns.sector.coverage).toEqual({ with: 2, total: 3 });
    expect(o.breakdowns.country.items.map((i) => [i.label, i.count])).toEqual([['France', 1], ['Nigeria', 1], ['Not recorded', 1]]);
    const unknown = o.breakdowns.leadSource.items.find((i) => i.unknown);
    expect(unknown.count).toBe(1);
    expect(o.breakdowns.leadSource.coverage).toEqual({ with: 2, total: 3 });
    expect(o.saber.evidence).toMatchObject({ files: 1, untagged: 1 });
    expect(o.saber.announcements).toMatchObject({ year: 2025, counted: 1 });
  });

  it('All years: services across every year, no change block', async () => {
    const o = await overview({ year: null });
    expect(o.year).toBeNull();
    expect(o.yearOnYear.change).toBeNull();
    expect(o.yearOnYear.services.codes.find((c) => c.code === 'A1').count).toBe(2);
  });

  it('click-through: the Agribusiness link lists exactly the counted investors', async () => {
    const o = await overview({ year: 2025 });
    const agri = o.breakdowns.sector.items.find((i) => i.label === 'Agribusiness');
    const res = await request(app).get(`/api${agri.to}`).set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body.map((i) => i.investorName)).toEqual(['Mine Agro']);
    expect(res.body).toHaveLength(agri.count);
  });

  it('mine: Staff see their assigned investors only', async () => {
    const res = await request(app).get('/api/analytics/mine').set('Authorization', bearer(staffToken)).expect(200);
    const m = res.body;
    expect(m.scope).toBe('assigned');
    expect(m.investors.total).toBe(2);
    expect(m.projects.total).toBe(3);
    expect(m.values.byCurrency.NGN).toMatchObject({ sum: 3, count: 2 });
    expect(m.openIssues).toBe(2);
    expect(m.interactionsLogged.thisMonth + m.interactionsLogged.lastMonth).toBeGreaterThanOrEqual(1);
    expect(m.attention.noContact.count).toBe(1); // Mine Gap: never contacted
    expect(m.attention.missingFields.count).toBe(1); // Mine Gap
    expect(m.attention.missingFields.reasons).toMatchObject({
      sector: 1, country: 1, leadSource: 1, firstContactDate: 1, projectValue: 1,
    });
    expect(m.attention.staleIssues.count).toBe(1);
    expect(m.attention.untaggedInteractions.count).toBe(1);
    expect(m.attention.untaggedFiles.count).toBe(1);
    expect(m.recent.length).toBeLessThanOrEqual(5);
    expect(m.recent.map((r) => r.category)).not.toContain('System Update');
    expect(m.recent[0].description).toBe('Call'); // newest happened date first
    expect(m.attention.untaggedFiles.scope).toBe('library');
    expect(m.recent.every((r) => ['Mine Agro', 'Mine Gap'].includes(r.investor.investorName))).toBe(true);
    expect(m.stages.items.find((i) => i.label === 'Commitment').count).toBe(1);
    expect(m.glance).toMatchObject({ investors: 3, projects: 5 });
  });

  it('mine: Staff with 0 assigned → zeros', async () => {
    const lonely = await User.create({ name: 'Lonely Staff', email: 'lonely@example.com', password: 'password123', role: 'Staff', status: 'active' });
    const m = await mine({ user: lonely });
    expect(m).toMatchObject({
      scope: 'assigned', investors: { total: 0 }, projects: { total: 0 }, openIssues: 0, interactionsLogged: { thisMonth: 0, lastMonth: 0 },
    });
    expect(m.values.byCurrency).toEqual({});
    expect(m.attention.noContact.count).toBe(0);
    expect(m.recent).toEqual([]);
  });

  it('mine: DG/PA see every investor', async () => {
    const res = await request(app).get('/api/analytics/mine').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body.scope).toBe('all');
    expect(res.body.investors.total).toBe(4);
  });
});
