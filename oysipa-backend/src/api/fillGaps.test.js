// Story 11.17: Fill the gaps (synthetic data only).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const ChangeLog = require('../models/ChangeLog');
const { buildSaberReport, FIELDS } = require('../services/saberReport');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const ALL_FIELDS = FIELDS.map(([k]) => k);

let f;

beforeEach(async () => {
  await Promise.all([Investor.deleteMany({}), InvestmentProject.deleteMany({}), InteractionLog.deleteMany({})]);
  const staff = await User.create({ name: 'Gaps Officer', email: 'gaps.officer@example.com', password: 'password123', role: 'Staff', status: 'active' });
  const other = await User.create({ name: 'Other Officer', email: 'other.officer@example.com', password: 'password123', role: 'Staff', status: 'active' });
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });

  const inv = (fields) => Investor.create({ sector: 'Manufacturing', countryOfOrigin: 'Nigeria', ...fields });
  // Staff's investors.
  const alpha = await inv({
    investorName: 'Synthetic Alpha Foods', leadSource: 'Other', firstContactDate: day('2025-02-01'), keyContactPerson: 'Contact One', email: 'alpha@example.com', assignedTo: staff._id,
  });
  const beta = await inv({
    investorName: 'Synthetic Beta Works', leadSource: 'Unknown (pre-T11)', firstContactDate: day('2023-04-01'), keyContactPerson: 'Contact Two', phoneNumber: '+2340000002', email: 'beta@example.com', assignedTo: staff._id,
  });
  // Another officer's investor, and an unassigned one.
  const gamma = await inv({
    investorName: 'Synthetic Gamma Steel', leadSource: 'Other', firstContactDate: day('2025-03-01'), keyContactPerson: 'Contact Three', phoneNumber: '+2340000003', email: 'gamma@example.com', assignedTo: other._id,
  });
  const delta = await inv({ investorName: 'Synthetic Delta Energy', firstContactDate: day('2024-01-01') });
  // Intermediaries are out of scope.
  await inv({ investorName: 'Synthetic Chamber', organisationType: 'Intermediary', firstContactDate: day('2025-03-01') });

  const full = {
    description: 'Synthetic plant', sector: 'Agribusiness', estimatedValue: 1000, currency: 'NGN', estimatedNumberOfJobs: 10, location: 'Ibadan', lifecycleStatus: idea._id,
  };
  const proj = (title, investor, extra = {}) => InvestmentProject.create({
    projectTitle: title, investor: investor._id, ...full, ...extra,
  });
  const a1 = await proj('Alpha Plant', alpha, { estimatedValue: 0, estimatedNumberOfJobs: 0 });
  const a2 = await proj('Alpha Depot', alpha, { location: '' });
  const b1 = await proj('Beta Line', beta);
  const g1 = await proj('Gamma Mill', gamma);
  const d1 = await proj('Delta Solar', delta, { estimatedNumberOfJobs: 0 });

  const log = (fields) => InteractionLog.create({
    loggedBy: staff._id, category: 'Meeting', description: 'Synthetic meeting', ...fields,
  });
  const logs = {
    // Gamma is complete: a coded project log.
    gCoded: await log({ project: g1._id, interactionDate: day('2025-04-01'), serviceCodes: ['M1'] }),
    // Beta: in scope 2025 through this log; untagged, so T10 is missing.
    bOld: await log({ project: b1._id, interactionDate: day('2025-01-05'), description: 'Beta first' }),
    bNew: await log({ project: b1._id, interactionDate: day('2025-06-05'), description: 'Beta second' }),
    bInvestor: await log({ investor: beta._id, interactionDate: day('2025-03-05'), description: 'Beta investor level' }),
    // Not listed: dated after 2025, undated, coded, system.
    bLater: await log({ project: b1._id, interactionDate: day('2026-02-01'), description: 'Beta later' }),
    bUndated: await log({ project: b1._id, description: 'Beta undated' }),
    bSystem: await log({ project: b1._id, category: 'System Update', interactionDate: day('2025-07-01') }),
    // Delta: coded in 2024 (counts for 2025 T10), first contact 2024: in 2024 only.
    dCoded: await log({ project: d1._id, interactionDate: day('2024-05-05'), serviceCodes: ['A1'] }),
  };
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    logs[`bExtra${i}`] = await log({ project: b1._id, interactionDate: day(`2025-02-0${i + 1}`), description: `Beta extra ${i}` });
  }
  await ChangeLog.collection.deleteMany({});
  f = {
    staff, other, staffToken: sign(staff), otherToken: sign(other), alpha, beta, gamma, delta, a1, a2, b1, g1, d1, logs,
  };
});

const get = (qs, token = global.dgToken) => request(app).get(`/api/fill-gaps${qs}`).set('Authorization', bearer(token));
// Project rows with their investor group.
const flat = (body) => body.groups.flatMap((g) => g.projects.map((p) => ({ ...p, group: g })));
const titles = (body) => flat(body).map((r) => r.title);
const rowOf = (body, title) => flat(body).find((r) => r.title === title);

// The report's completeness figures, optionally for some projects only.
const reportSummary = (report, projectIds = null) => {
  const rows = projectIds ? report.completeness.rows.filter((r) => projectIds.includes(r.id)) : report.completeness.rows;
  const complete = rows.filter((r) => r.missing.length === 0).length;
  return {
    checked: rows.length,
    complete,
    missing: Object.fromEntries(ALL_FIELDS.map((k) => [k, rows.filter((r) => !r.checks[k]).length])),
  };
};

describe('GET /api/fill-gaps: matching the SABER report', () => {
  it.each([2024, 2025, 2026, 'all'])('summary = buildSaberReport summary for year %p', async (y) => {
    const year = y === 'all' ? null : y;
    const [res, report] = await Promise.all([get(`?year=${y}`), buildSaberReport({ year })]);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.checked).toBe(report.summary.projectsChecked);
    expect(s.complete).toBe(report.summary.projectsComplete);
    expect(s.completeShare).toBe(report.summary.completeShare);
    expect(s.fieldsFilledShare).toBe(report.summary.fieldsFilledShare);
    expect(s.missing).toEqual(report.completeness.totals);
    // Rows = the report's incomplete rows, same missing fields.
    const incomplete = report.completeness.rows.filter((r) => r.missing.length > 0);
    expect(flat(res.body).map((r) => [r.id, r.missing])).toEqual(incomplete.map((r) => [r.id, r.missing]));
  });

  it('2025: the expected scope', async () => {
    const res = await get('?year=2025');
    expect(res.body.summary.checked).toBe(4); // Alpha Plant, Alpha Depot, Beta Line, Gamma Mill
    expect(res.body.summary.complete).toBe(1); // Gamma Mill
    expect(titles(res.body)).toEqual(['Alpha Depot', 'Alpha Plant', 'Beta Line']);
  });

  it.each([2025, 'all'])('officer=me: summary = the report restricted to the officer\'s investors (%p)', async (y) => {
    const year = y === 'all' ? null : y;
    const mine = (await InvestmentProject.find({ investor: { $in: [f.alpha._id, f.beta._id] } }).distinct('_id')).map(String);
    const [res, report] = await Promise.all([get(`?year=${y}&officer=me`, f.staffToken), buildSaberReport({ year })]);
    const expected = reportSummary(report, mine);
    expect(res.body.officer).toBe('me');
    expect({ checked: res.body.summary.checked, complete: res.body.summary.complete, missing: res.body.summary.missing }).toEqual(expected);
    const incomplete = report.completeness.rows.filter((r) => mine.includes(r.id) && r.missing.length > 0);
    expect(flat(res.body).map((r) => r.id)).toEqual(incomplete.map((r) => r.id));
  });
});

describe('GET /api/fill-gaps: rows', () => {
  it('Staff Mine: own incomplete projects grouped by investor; editable; lead source locked', async () => {
    const res = await get('?year=2025&officer=me', f.staffToken);
    expect(res.body.groups.map((g) => [g.investor.name, g.projects.map((p) => p.title)])).toEqual([
      ['Synthetic Alpha Foods', ['Alpha Depot', 'Alpha Plant']],
      ['Synthetic Beta Works', ['Beta Line']],
    ]);
    res.body.groups.forEach((g) => {
      expect(g.canEdit).toBe(true);
      expect(g.canEditLeadSource).toBe(false);
      expect(g.officer).toEqual({ id: String(f.staff._id), name: 'Gaps Officer' });
    });
    const plant = rowOf(res.body, 'Alpha Plant');
    expect(plant.missing).toEqual(['T5', 'T7', 'T8b', 'T10']);
    expect(plant).toMatchObject({
      estimatedValue: 0, estimatedNumberOfJobs: 0, currency: 'NGN', location: 'Ibadan', fixable: true,
    });
    // Investor fields once per investor.
    const alpha = res.body.groups[0];
    expect(alpha.missing).toEqual(['T8b']);
    expect(alpha.investor).toMatchObject({
      name: 'Synthetic Alpha Foods', phoneNumber: '', firstContactDate: '2025-02-01', leadSource: 'Other', t11: { leadSource: false, firstContact: false },
    });
    const beta = res.body.groups[1];
    expect(beta.missing).toEqual(['T11']);
    expect(beta.investor.t11).toEqual({ leadSource: true, firstContact: false });
    expect(rowOf(res.body, 'Beta Line').missing).toEqual(['T10', 'T11']);
  });

  it('Staff All: another officer\'s project is read-only and names the officer', async () => {
    await InvestmentProject.updateOne({ _id: f.g1._id }, { $set: { location: '' } });
    const res = await get('?year=2025&officer=all', f.staffToken);
    const gamma = rowOf(res.body, 'Gamma Mill');
    expect(gamma.group.canEdit).toBe(false);
    expect(gamma.fixable).toBe(false);
    expect(gamma.group.officer).toEqual({ id: String(f.other._id), name: 'Other Officer' });
    // ... and the existing route refuses the write.
    await request(app).put(`/api/projects/${f.g1._id}`).set('Authorization', bearer(f.staffToken)).send({ location: 'Oyo' }).expect(403);
  });

  it('DG: every row editable, lead source too; unassigned investors have no officer', async () => {
    const res = await get('?year=2024');
    const delta = rowOf(res.body, 'Delta Solar');
    expect(delta.group).toMatchObject({ canEdit: true, canEditLeadSource: true, officer: null });
  });

  it('missing=T7 → only rows missing T7; unknown values ignored; case-insensitive', async () => {
    expect(titles((await get('?year=2025&missing=T7')).body)).toEqual(['Alpha Plant']);
    expect(titles((await get('?year=2025&missing=t7')).body)).toEqual(['Alpha Plant']);
    expect(titles((await get('?year=2025&missing=T6,T11')).body)).toEqual(['Alpha Depot', 'Beta Line']);
    const unknown = await get('?year=2025&missing=XX');
    expect(unknown.body.missing).toEqual([]);
    expect(titles(unknown.body)).toEqual(['Alpha Depot', 'Alpha Plant', 'Beta Line']);
    // The summary is the scope's, not the filtered rows'.
    expect((await get('?year=2025&missing=T7')).body.summary.checked).toBe(4);
  });

  it('q searches project title, investor name and location', async () => {
    expect(titles((await get('?year=2025&q=depot')).body)).toEqual(['Alpha Depot']);
    expect(titles((await get('?year=2025&q=beta works')).body)).toEqual(['Beta Line']);
    expect(titles((await get('?year=2025&q=%21%21')).body)).toEqual([]);
  });

  it('untagged interactions: dated up to year end, uncoded, officer logs, newest first, at most 5; investor-level once on the investor', async () => {
    const res = await get('?year=2025');
    const beta = rowOf(res.body, 'Beta Line');
    expect(beta.untagged.map((l) => l.description)).toEqual(['Beta second', 'Beta extra 3', 'Beta extra 2', 'Beta extra 1', 'Beta extra 0']);
    expect(beta.untagged[0]).toMatchObject({ id: String(f.logs.bNew._id), date: '2025-06-05', category: 'Meeting', serviceCodes: [] });
    expect(beta.group.untagged.map((l) => l.description)).toEqual(['Beta investor level']);
    // A row not missing T10 lists none.
    await InteractionLog.create({ project: f.a2._id, loggedBy: f.staff._id, category: 'Meeting', description: 'x', interactionDate: day('2025-05-01'), serviceCodes: ['M2'] });
    await InteractionLog.create({ project: f.a2._id, loggedBy: f.staff._id, category: 'Meeting', description: 'y', interactionDate: day('2025-05-02') });
    expect(rowOf((await get('?year=2025')).body, 'Alpha Depot').untagged).toEqual([]);
  });

  it('count=1 → the count only (badge)', async () => {
    const mine = await get('?count=1&officer=me&year=2025', f.staffToken);
    expect(mine.body).toEqual({ year: 2025, officer: 'me', count: 3, currentYear: expect.any(Number) });
    expect((await get('?count=1&officer=me&year=2025', f.otherToken)).body.count).toBe(0);
    expect((await get('?count=1&year=2025')).body.count).toBe(3);
  });

  it('count and fixable: a Staff row with only the lead source missing is not theirs to fix', async () => {
    await InteractionLog.updateOne({ _id: f.logs.bNew._id }, { $set: { serviceCodes: ['M1'] } });
    const staff = (await get('?year=2025&officer=me', f.staffToken)).body;
    expect(rowOf(staff, 'Beta Line')).toMatchObject({ missing: ['T11'], fixable: false });
    expect(staff.groups[1].fixable).toBe(false);
    expect((await get('?count=1&officer=me&year=2025', f.staffToken)).body.count).toBe(2);
    const dg = (await get('?year=2025')).body;
    expect(rowOf(dg, 'Beta Line').fixable).toBe(true);
    expect((await get('?count=1&year=2025')).body.count).toBe(3);
  });

  it('badge default year = the current year full count', async () => {
    const current = (await get('?count=1&officer=me', f.staffToken)).body;
    const explicit = (await get(`?count=1&officer=me&year=${current.currentYear}`, f.staffToken)).body;
    const list = (await get(`?officer=me&year=${current.currentYear}`, f.staffToken)).body;
    expect(current.count).toBe(explicit.count);
    expect(current.count).toBe(flat(list).filter((r) => r.fixable).length);
  });

  it('2025 totals per field (fixed)', async () => {
    expect((await get('?year=2025')).body.summary.missing).toEqual({
      T1: 0, T2: 0, T3: 0, T4: 0, T5: 1, T6: 1, T7: 1, T8a: 0, T8b: 2, T8c: 0, T9: 0, T10: 3, T11: 1,
    });
  });

  it('officer filters: unassigned, a user id, a bad id → nothing', async () => {
    expect(titles((await get('?year=all&officer=unassigned')).body)).toEqual(['Delta Solar']);
    await InvestmentProject.updateOne({ _id: f.g1._id }, { $set: { location: '' } });
    expect(titles((await get(`?year=2025&officer=${f.other._id}`)).body)).toEqual(['Gamma Mill']);
    const bad = (await get('?year=2025&officer=nonsense')).body;
    expect(bad.groups).toEqual([]);
    expect(bad.summary.checked).toBe(0);
  });

  it('q matches the contact name too; the summary ignores q', async () => {
    const res = (await get('?year=2025&q=contact two')).body;
    expect(titles(res)).toEqual(['Beta Line']);
    expect(res.summary.checked).toBe(4);
  });

  it.each([['Staff', () => f.staffToken], ['Portal-Admin', () => global.portalAdminToken]])('%s: canEdit equals the write routes answer on every row', async (role, token) => {
    const body = (await get('?year=all&officer=all', token())).body;
    expect(body.groups.length).toBeGreaterThan(2);
    for (const g of body.groups) {
      // eslint-disable-next-line no-await-in-loop
      const inv = await request(app).put(`/api/investors/${g.investor.id}`).set('Authorization', bearer(token())).send({});
      expect([g.investor.name, inv.status === 200]).toEqual([g.investor.name, g.canEdit]);
      for (const p of g.projects) {
        // eslint-disable-next-line no-await-in-loop
        const pr = await request(app).put(`/api/projects/${p.id}`).set('Authorization', bearer(token())).send({});
        expect([p.title, pr.status === 200]).toEqual([p.title, g.canEdit]);
      }
    }
  });

  it('bad year → 400; no token → 401', async () => {
    expect((await get('?year=1999')).status).toBe(400);
    expect((await get('?year=abc')).status).toBe(400);
    expect((await request(app).get('/api/fill-gaps')).status).toBe(401);
  });
});

describe('Fixing through the existing routes', () => {
  it('Staff enters value and jobs → row re-checks; change log under their name (acceptance)', async () => {
    const before = (await get('?year=2025&officer=me', f.staffToken)).body;
    await request(app).put(`/api/projects/${f.a1._id}`).set('Authorization', bearer(f.staffToken))
      .send({ estimatedValue: 2000000, currency: 'NGN', estimatedNumberOfJobs: 25 })
      .expect(200);
    const after = (await get('?year=2025&officer=me', f.staffToken)).body;
    expect(rowOf(after, 'Alpha Plant').missing).toEqual(['T8b', 'T10']);
    expect(after.summary.missing.T5).toBe(before.summary.missing.T5 - 1);
    expect(after.summary.missing.T7).toBe(before.summary.missing.T7 - 1);
    const rows = await ChangeLog.find({ entity: 'InvestmentProject', entityId: f.a1._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'update', byName: 'Gaps Officer', role: 'Staff' });
  });

  it('phone on the investor → T8b fixed on every project of that investor', async () => {
    await request(app).put(`/api/investors/${f.alpha._id}`).set('Authorization', bearer(f.staffToken)).send({ phoneNumber: '0800 000 0001' })
      .expect(200);
    const res = (await get('?year=2025')).body;
    expect(rowOf(res, 'Alpha Plant').missing).not.toContain('T8b');
    expect(rowOf(res, 'Alpha Depot').missing).not.toContain('T8b');
  });

  it('lead source: Staff cannot set it (lock); the DG can → T11 ✓', async () => {
    await request(app).put(`/api/investors/${f.beta._id}`).set('Authorization', bearer(f.staffToken)).send({ leadSource: 'Business event or conference' })
      .expect(200);
    expect(rowOf((await get('?year=2025')).body, 'Beta Line').missing).toContain('T11');
    await request(app).put(`/api/investors/${f.beta._id}`).set('Authorization', bearer(global.dgToken)).send({ leadSource: 'Business event or conference' })
      .expect(200);
    expect(rowOf((await get('?year=2025')).body, 'Beta Line').missing).toEqual(['T10']);
  });

  it('tagging an untagged log with M2 → T10 ✓; the complete row leaves the list', async () => {
    await request(app).put(`/api/investors/${f.beta._id}`).set('Authorization', bearer(global.dgToken)).send({ leadSource: 'Business event or conference' })
      .expect(200);
    const before = (await get('?year=2025')).body;
    await request(app).patch(`/api/interactions/${f.logs.bNew._id}`).set('Authorization', bearer(f.staffToken)).send({ serviceCodes: ['M2'] })
      .expect(200);
    const after = (await get('?year=2025')).body;
    expect(titles(after)).not.toContain('Beta Line');
    expect(after.summary.complete).toBe(before.summary.complete + 1);
  });
});

describe('Write-route fixes found by the 11.17 review', () => {
  it('updateProject on a project with no lifecycle status → 200 (no crash)', async () => {
    await InvestmentProject.collection.updateOne({ _id: f.a1._id }, { $unset: { lifecycleStatus: 1 } });
    const res = await request(app).put(`/api/projects/${f.a1._id}`).set('Authorization', bearer(global.dgToken)).send({ location: 'Oyo' });
    expect(res.status).toBe(200);
    const idea = await LifecycleStatus.findOne({ name: 'Idea' });
    const set = await request(app).put(`/api/projects/${f.a1._id}`).set('Authorization', bearer(global.dgToken)).send({ lifecycleStatus: String(idea._id) });
    expect(set.status).toBe(200);
    expect(await InteractionLog.findOne({ project: f.a1._id, category: 'System Update' }).lean()).toMatchObject({ description: 'Lifecycle status changed from "none" to "Idea"' });
  });

  it.each([
    [{ estimatedValue: -1 }, /value/],
    [{ estimatedValue: 'abc' }, /value/],
    [{ estimatedNumberOfJobs: 2.5 }, /jobs/],
    [{ estimatedNumberOfJobs: -3 }, /jobs/],
  ])('updateProject refuses %p → 400', async (body, message) => {
    const res = await request(app).put(`/api/projects/${f.a1._id}`).set('Authorization', bearer(global.dgToken)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it('updateProject accepts 0 and whole numbers (and "" as before)', async () => {
    await request(app).put(`/api/projects/${f.a1._id}`).set('Authorization', bearer(global.dgToken)).send({ estimatedValue: 0, estimatedNumberOfJobs: 12 }).expect(200);
    await request(app).put(`/api/projects/${f.a1._id}`).set('Authorization', bearer(global.dgToken)).send({ estimatedValue: '' }).expect(200);
  });

  it('a phone-only investor PUT keeps referredBy; a lead-source change still clears it', async () => {
    const chamber = await Investor.findOne({ investorName: 'Synthetic Chamber' });
    await Investor.collection.updateOne({ _id: f.alpha._id }, { $set: { referredBy: chamber._id } });
    await request(app).put(`/api/investors/${f.alpha._id}`).set('Authorization', bearer(f.staffToken)).send({ phoneNumber: '0800 000 0009' }).expect(200);
    expect(String((await Investor.findById(f.alpha._id).lean()).referredBy)).toBe(String(chamber._id));
    await request(app).put(`/api/investors/${f.alpha._id}`).set('Authorization', bearer(global.dgToken)).send({ leadSource: 'Business event or conference' }).expect(200);
    expect((await Investor.findById(f.alpha._id).lean()).referredBy).toBeNull();
  });
});
