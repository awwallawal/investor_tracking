// Story 11.15 review #1: every dashboard and "My work" figure equals the length
// of the list it opens, for the same user (synthetic data only). The data
// includes the awkward cases: a project-only interaction (no investor stored),
// an issue and a project whose investor no longer exists, an Intermediary with
// valued projects, a record with no organisation type, a log with no happened
// date and a System Update row.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const { todayLagos } = require('../utils/happenedDate');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const today = todayLagos();
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const dayAgo = (n) => new Date(Date.parse(`${today}T00:00:00.000Z`) - n * 24 * 60 * 60 * 1000);
const year = Number(today.slice(0, 4));
// A day in the previous calendar month.
const lastMonthDay = () => {
  const d = new Date(Date.UTC(year, Number(today.slice(5, 7)) - 2, 15));
  return d;
};

let staffToken;

beforeEach(async () => {
  await Promise.all([InvestorIssue.deleteMany({}), InvestmentAnnouncement.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({})]);
  const staff = await User.create({ name: 'Card Staff', email: 'card.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  const lead = await LifecycleStatus.create({ name: 'Lead, warm', order: 2 });

  const mine1 = await Investor.create({
    investorName: 'Card Mine One', sector: 'Agribusiness', countryOfOrigin: 'Korea, Republic of', leadSource: 'Other', assignedTo: staff._id, firstContactDate: day(`${year - 1}-04-01`),
  });
  const mine2 = await Investor.create({
    investorName: 'Card Mine Two', sector: 'Manufacturing', countryOfOrigin: 'Nigeria', leadSource: 'Other', assignedTo: staff._id,
  });
  const broker = await Investor.create({
    investorName: 'Card Broker', sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other', organisationType: 'Intermediary', firstContactDate: day(`${year}-01-10`),
  });
  const untyped = await Investor.create({
    investorName: 'Card Untyped', sector: 'Agribusiness', countryOfOrigin: 'Ghana', leadSource: 'Other', firstContactDate: day(`${year}-02-10`),
  });
  await Investor.updateOne({ _id: untyped._id }, { $unset: { organisationType: 1 } });

  const p1 = await InvestmentProject.create({
    projectTitle: 'Card Mill', investor: mine1._id, lifecycleStatus: lead._id, estimatedValue: 100, currency: 'USD', estimatedNumberOfJobs: 5, sector: 'Agribusiness',
  });
  const p2 = await InvestmentProject.create({ projectTitle: 'Card Plant', investor: mine2._id, lifecycleStatus: idea._id, sector: 'Manufacturing' });
  await InvestmentProject.create({
    projectTitle: 'Broker Fund', investor: broker._id, lifecycleStatus: lead._id, estimatedValue: 900, estimatedNumberOfJobs: 9, sector: 'Agribusiness',
  });
  await InvestmentProject.create({
    projectTitle: 'Untyped Farm', investor: untyped._id, lifecycleStatus: idea._id, estimatedValue: 50, sector: 'Agribusiness',
  });
  // Orphan: its investor is gone.
  await InvestmentProject.create({
    projectTitle: 'Orphan Works', investor: new mongoose.Types.ObjectId(), lifecycleStatus: idea._id, estimatedValue: 10, estimatedNumberOfJobs: 1,
  });

  // Logs: a project-only log without a stored investor and with no code;
  // a log with no happened date; a System Update; one last month.
  const projectOnly = await InteractionLog.create({ project: p2._id, loggedBy: staff._id, description: 'Plant walk', category: 'Meeting', interactionDate: dayAgo(0) });
  await InteractionLog.updateOne({ _id: projectOnly._id }, { $unset: { investor: 1 } });
  const undated = await InteractionLog.create({ investor: mine1._id, loggedBy: staff._id, description: 'Undated call', category: 'Phone', serviceCodes: ['M4'] });
  await InteractionLog.updateOne({ _id: undated._id }, { $unset: { interactionDate: 1 } });
  await InteractionLog.create({ project: p1._id, loggedBy: staff._id, description: 'Lifecycle status changed', category: 'System Update', interactionDate: dayAgo(0) });
  await InteractionLog.create({ investor: mine1._id, loggedBy: staff._id, description: 'Last month visit', category: 'Meeting', interactionDate: lastMonthDay() });
  await InteractionLog.create({ investor: broker._id, loggedBy: staff._id, description: 'Broker email', category: 'Email', interactionDate: day(`${year}-01-12`) });

  const mkIssue = (doc) => InvestorIssue.create({
    dateRegistered: new Date(), category: 'other', description: 'Card issue', dateReported: dayAgo(40), ...doc,
  });
  await mkIssue({ investor: mine1._id, status: 'Open' });
  await mkIssue({ investor: new mongoose.Types.ObjectId(), status: 'In progress' }); // orphan
  await mkIssue({ investor: broker._id, status: 'Resolved', resolution: 'ok', dateReported: day(`${year}-02-01`) });
  await mkIssue({ investor: untyped._id, status: 'Withdrawn', resolution: 'gone', dateReported: day(`${year}-02-02`) });

  await InvestmentAnnouncement.create({ project: p1._id, announcementDate: day(`${year}-03-01`), outlet: 'Card Daily', oysipaNamed: true, oysipaRoleText: 'x' });
  const brokerProject = await InvestmentProject.findOne({ projectTitle: 'Broker Fund' });
  await InvestmentAnnouncement.create({ project: brokerProject._id, announcementDate: day(`${year}-03-02`), outlet: 'Broker Wire', oysipaNamed: true, oysipaRoleText: 'x' });

  const folder = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes' });
  await EvidenceFile.create({
    folder: folder._id, fileName: 'card.pdf', mimeType: 'application/pdf', size: 4, sha256: 'card1', provider: 'fake', key: 'card-k', uploadedBy: staff._id, uploadedAt: new Date(),
  });
});

const get = (path, token) => request(app).get(path).set('Authorization', bearer(token));
// Length of the list a dashboard link opens (as the frontend calls its API).
const listLength = async (to, token) => {
  const path = to.startsWith('/evidence?') ? to.replace('/evidence?', '/api/evidence/files?') : `/api${to}`;
  const res = await get(path, token).expect(200);
  return res.body.length;
};
const expectLink = async (count, to, token, label) => {
  expect({ label, count: await listLength(to, token) }).toEqual({ label, count });
};

describe('"My work" figures = their lists', () => {
  const checkMine = async (token) => {
    const m = (await get('/api/analytics/mine', token).expect(200)).body;
    await expectLink(m.investors.total, m.investors.to, token, 'investors');
    await expectLink(m.projects.total, m.projects.to, token, 'projects');
    await expectLink(m.values.coverage.with, m.values.to, token, 'values');
    await expectLink(m.openIssues, m.openIssuesTo, token, 'open issues');
    await expectLink(m.interactionsLogged.thisMonth, m.interactionsLogged.to, token, 'logged this month');
    await expectLink(m.interactionsLogged.lastMonth, m.interactionsLogged.lastMonthTo, token, 'logged last month');
    for (const k of ['noContact', 'missingFields', 'staleIssues', 'untaggedInteractions', 'untaggedFiles']) {
      // eslint-disable-next-line no-await-in-loop
      await expectLink(m.attention[k].count, m.attention[k].to, token, k);
    }
    for (const item of m.stages.items.filter((i) => i.to)) {
      // eslint-disable-next-line no-await-in-loop
      await expectLink(item.count, item.to, token, `stage ${item.label}`);
    }
    await expectLink(m.glance.investors, m.glance.to.investors, token, 'glance investors');
    await expectLink(m.glance.projects, m.glance.to.projects, token, 'glance projects');
    await expectLink(m.glance.values.coverage.with, m.glance.to.values, token, 'glance values');
    await expectLink(m.glance.jobs.count, m.glance.to.jobs, token, 'glance jobs');
    return m;
  };

  it('Staff (their investors, officer=me)', async () => {
    const m = await checkMine(staffToken);
    expect(m.attention.untaggedInteractions.to).toBe('/interactions?noCode=1&officer=me');
    // The project-only log (no stored investor) counts: it is on the Staff's investor.
    expect(m.attention.untaggedInteractions.count).toBe(2);
    expect(m.interactionsLogged.thisMonth).toBeGreaterThanOrEqual(1);
  });

  it('DG and Portal-Admin (every record, orphans included)', async () => {
    const m = await checkMine(global.dgToken);
    // No contact (DG): card = /investors?noContactDays=60; Card Mine Two's only
    // contact is a project-only log (no stored investor), which counts.
    expect(m.attention.noContact.to).toBe('/investors?noContactDays=60');
    const noContact = (await get('/api/investors?noContactDays=60', global.dgToken).expect(200)).body.map((i) => i.investorName);
    expect(noContact).toHaveLength(m.attention.noContact.count);
    expect(noContact).not.toContain('Card Mine Two');
    expect(noContact).toContain('Card Untyped');
    expect(m.openIssues).toBe(2); // the orphan issue counts
    expect(m.attention.staleIssues.count).toBe(2);
    await checkMine(global.portalAdminToken);
  });
});

describe('DG dashboard figures = their lists', () => {
  it('headline, stages, breakdowns, year bars and SABER links', async () => {
    const token = global.dgToken;
    const o = (await get(`/api/analytics/overview?year=${year}`, token).expect(200)).body;
    const h = o.headline;
    expect(h.projects.to).toBe('/projects?organisationType=Investor');
    await expectLink(h.investors.total, h.investors.to, token, 'investors');
    await expectLink(h.projects.total, h.projects.to, token, 'projects');
    await expectLink(h.values.coverage.with, h.values.to, token, 'values');
    await expectLink(h.jobs.count, h.jobs.to, token, 'jobs');
    for (const item of o.breakdowns.stage.items.filter((i) => i.to)) {
      // eslint-disable-next-line no-await-in-loop
      await expectLink(item.count, item.to, token, `stage ${item.label}`);
    }
    for (const key of ['sector', 'projectSector', 'country', 'leadSource', 'organisationType']) {
      for (const item of o.breakdowns[key].items.filter((i) => i.to)) {
        // eslint-disable-next-line no-await-in-loop
        await expectLink(item.count, item.to, token, `${key} ${item.label}`);
      }
    }
    // New investors by first-contact year (organisation type Investor), and undated.
    for (const s of o.yearOnYear.newInvestors.series.filter((x) => x.count > 0)) {
      // eslint-disable-next-line no-await-in-loop
      await expectLink(s.count, `/investors?firstContactYear=${s.year}&organisationType=Investor`, token, `new investors ${s.year}`);
    }
    await expectLink(o.yearOnYear.newInvestors.undated, '/investors?firstContactYear=none&organisationType=Investor', token, 'undated investors');
    for (const s of o.yearOnYear.announcements.series.filter((x) => x.count > 0)) {
      // eslint-disable-next-line no-await-in-loop
      await expectLink(s.count, `/announcements?year=${s.year}`, token, `announcements ${s.year}`);
    }
    await expectLink(o.yearOnYear.interactions.total, o.yearOnYear.interactions.to, token, 'interactions');
    await expectLink(o.saber.issues.total, o.saber.issues.to, token, 'issues share');
    await expectLink(o.saber.announcements.counted, o.saber.announcements.to, token, 'counted announcements');
    expect(o.saber.announcements.counted).toBe(1); // the Intermediary's project is left out
    await expectLink(o.saber.evidence.untagged, '/evidence?untagged=1', token, 'untagged files');
    // A comma inside a stored value is kept whole (Korea, Republic of).
    const korea = o.breakdowns.country.items.find((i) => i.label === 'Korea, Republic of');
    expect(korea.count).toBe(1);
    const lead = o.breakdowns.stage.items.find((i) => i.label === 'Lead, warm');
    expect(lead.count).toBe(1);
  });
});
