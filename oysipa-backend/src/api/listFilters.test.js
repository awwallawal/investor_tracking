// Story 11.15: server-side filters and sorts on every list (synthetic data only).
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
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const { todayLagos } = require('../utils/happenedDate');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
// A happened date n days before today (the Lagos day at 00:00Z).
const dayAgo = (n) => new Date(Date.parse(`${todayLagos()}T00:00:00.000Z`) - n * 24 * 60 * 60 * 1000);
const iso = (d) => d.toISOString().slice(0, 10);

let staff;
let staffToken;
let other;
let f;

beforeEach(async () => {
  await Promise.all([InvestorIssue.deleteMany({}), InvestmentAnnouncement.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({})]);
  staff = await User.create({ name: 'Filter Staff', email: 'filter.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  other = await User.create({ name: 'Other Staff', email: 'other.filter@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  const lead = await LifecycleStatus.create({ name: 'Lead', order: 2 });

  const alpha = await Investor.create({
    investorName: 'Alpha Agro Synthetic', sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other', assignedTo: staff._id, firstContactDate: new Date('2025-03-01T00:00:00.000Z'), keyContactPerson: 'A. Person', email: 'alpha@example.com',
  });
  const beta = await Investor.create({
    investorName: 'Beta Works Synthetic', sector: 'Manufacturing', countryOfOrigin: 'China', leadSource: 'Media campaign or advertising', assignedTo: staff._id, firstContactDate: new Date('2026-02-01T00:00:00.000Z'),
  });
  const gamma = await Investor.create({
    investorName: 'Gamma Broker Synthetic', sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other', organisationType: 'Intermediary',
  });
  const delta = await Investor.create({
    investorName: 'Delta Other Synthetic', sector: 'Agribusiness', countryOfOrigin: 'Ghana', leadSource: 'Other', assignedTo: other._id, firstContactDate: new Date('2025-06-01T00:00:00.000Z'),
  });
  const alphaProject = await InvestmentProject.create({
    projectTitle: 'Alpha Mill', investor: alpha._id, lifecycleStatus: lead._id, estimatedValue: 1000, currency: 'USD', estimatedNumberOfJobs: 10, sector: 'Agribusiness', location: 'Ibadan',
  });
  const betaProject = await InvestmentProject.create({
    projectTitle: 'Beta Plant', investor: beta._id, lifecycleStatus: idea._id, sector: 'Manufacturing',
  });
  await InvestmentProject.create({
    projectTitle: 'Delta Farm', investor: delta._id, lifecycleStatus: idea._id, estimatedValue: 5000, estimatedNumberOfJobs: 3, sector: 'Agribusiness',
  });

  const alphaLog = await InteractionLog.create({
    investor: alpha._id, loggedBy: staff._id, description: 'Site visit to the mill', category: 'Meeting', interactionDate: dayAgo(10), serviceCodes: ['M4'],
  });
  const betaLog = await InteractionLog.create({
    investor: beta._id, loggedBy: staff._id, description: 'Phone call about land', category: 'Phone', interactionDate: dayAgo(100),
  });
  // System Update rows never count as contact or as "no code".
  await InteractionLog.create({
    project: betaProject._id, loggedBy: staff._id, description: 'Lifecycle status changed', category: 'System Update', interactionDate: dayAgo(1),
  });
  await InteractionLog.create({
    investor: delta._id, loggedBy: other._id, description: 'Email to the delta team', category: 'Email', interactionDate: dayAgo(5), serviceCodes: ['I2'],
  });

  const mkIssue = (doc) => InvestorIssue.create({
    dateRegistered: new Date(), category: 'other', description: 'Synthetic issue', ...doc,
  });
  const staleIssue = await mkIssue({ investor: alpha._id, reference: 'ISS-05', dateReported: dayAgo(30), status: 'Open', mdaResponsible: ['TRADE'] });
  const freshIssue = await mkIssue({
    investor: beta._id, reference: 'ISS-06', dateReported: dayAgo(30), status: 'In progress', actions: [{ date: dayAgo(2), note: 'Called', recordedBy: staff._id, recordedAt: new Date() }],
  });
  const resolvedIssue = await mkIssue({
    investor: delta._id, reference: 'ISS-07', dateReported: new Date('2025-05-01T00:00:00.000Z'), status: 'Resolved', resolution: 'Done', category: 'land/title',
  });

  const annNamed = await InvestmentAnnouncement.create({
    project: alphaProject._id, announcementDate: new Date('2026-04-10T00:00:00.000Z'), outlet: 'Synthetic Daily', oysipaNamed: true, oysipaRoleText: 'Facilitated',
  });
  const annOther = await InvestmentAnnouncement.create({
    project: betaProject._id, announcementDate: new Date('2025-09-01T00:00:00.000Z'), outlet: 'Example Wire', oysipaNamed: false,
  });

  const folder = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes and events' });
  const mkFile = (doc) => EvidenceFile.create({
    folder: folder._id, size: 4, provider: 'fake', resourceType: 'raw', uploadedBy: staff._id, uploadedAt: new Date('2026-05-01T10:00:00.000Z'), ...doc,
  });
  const pdf = await mkFile({
    fileName: 'forum-report.pdf', mimeType: 'application/pdf', sha256: 'f1', key: 'k1', documentDate: new Date('2026-03-01T00:00:00.000Z'),
    links: [{ investor: alpha._id, linkedBy: staff._id, linkedAt: new Date() }],
  });
  const photo = await mkFile({ fileName: 'Attendance photo.jpg', mimeType: 'image/jpeg', sha256: 'f2', key: 'k2', what: 'Forum attendance' });
  const sheet = await mkFile({
    fileName: 'budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: 'f3', key: 'k3', documentDate: new Date('2025-01-15T00:00:00.000Z'),
  });

  f = {
    idea, lead, alpha, beta, gamma, delta, alphaProject, betaProject, alphaLog, betaLog, staleIssue, freshIssue, resolvedIssue, annNamed, annOther, folder, pdf, photo, sheet,
  };
});

const get = (path, token = staffToken) => request(app).get(path).set('Authorization', bearer(token));
const names = async (qs, token) => (await get(`/api/investors${qs}`, token).expect(200)).body.map((i) => i.investorName).sort();
const titles = async (qs, token) => (await get(`/api/projects${qs}`, token).expect(200)).body.map((p) => p.projectTitle).sort();
const ALL_INVESTORS = ['Alpha Agro Synthetic', 'Beta Works Synthetic', 'Delta Other Synthetic', 'Gamma Broker Synthetic', 'Test Investor'];

describe('Investors', () => {
  it('multi-select: either sector; an unknown value is ignored; only unknown values → no filter', async () => {
    expect(await names('?sector=Agribusiness,Manufacturing')).toEqual(['Alpha Agro Synthetic', 'Beta Works Synthetic', 'Delta Other Synthetic', 'Gamma Broker Synthetic']);
    expect(await names('?sector=Manufacturing,Alien')).toEqual(['Beta Works Synthetic']);
    expect(await names('?sector=Alien')).toEqual(ALL_INVESTORS);
    expect(await names('?country=China,Ghana')).toEqual(['Beta Works Synthetic', 'Delta Other Synthetic']);
    expect(await names('?organisationType=Intermediary,Promotion%20agent')).toEqual(['Gamma Broker Synthetic']);
  });

  it('officer: me, unassigned, a user id; firstContactYear incl. none; a bad year is ignored', async () => {
    expect(await names('?officer=me')).toEqual(['Alpha Agro Synthetic', 'Beta Works Synthetic']);
    expect(await names('?officer=unassigned')).toEqual(['Gamma Broker Synthetic', 'Test Investor']);
    expect(await names(`?officer=${other._id},unassigned`)).toEqual(['Delta Other Synthetic', 'Gamma Broker Synthetic', 'Test Investor']);
    expect(await names('?firstContactYear=none')).toEqual(['Gamma Broker Synthetic', 'Test Investor']);
    expect(await names('?firstContactYear=2025')).toEqual(['Alpha Agro Synthetic', 'Delta Other Synthetic']);
    expect(await names('?firstContactYear=2026,none')).toEqual(['Beta Works Synthetic', 'Gamma Broker Synthetic', 'Test Investor']);
    expect(await names('?firstContactYear=20x5')).toEqual(ALL_INVESTORS);
  });

  it('stage (any project in a status) and hasValue', async () => {
    expect(await names('?stage=Lead')).toEqual(['Alpha Agro Synthetic']);
    expect(await names('?stage=Lead,Idea')).toEqual(['Alpha Agro Synthetic', 'Beta Works Synthetic', 'Delta Other Synthetic', 'Test Investor']);
    expect(await names('?hasValue=1')).toEqual(['Alpha Agro Synthetic', 'Delta Other Synthetic']);
  });

  it('No contact: noContactDays=60&officer=me (Staff) = their investors with no officer log in 60+ days, equal to "My work"', async () => {
    expect(await names('?noContactDays=60&officer=me')).toEqual(['Beta Works Synthetic']);
    const mine = (await get('/api/analytics/mine').expect(200)).body;
    expect(mine.attention.noContact.count).toBe(1);
    expect(mine.attention.noContact.to).toBe('/investors?noContactDays=60&officer=me');
    expect((await get(`/api${mine.attention.noContact.to}`).expect(200)).body).toHaveLength(mine.attention.noContact.count);
    // Another N: 5 days → both of the Staff's investors.
    expect(await names('?noContactDays=5&officer=me')).toEqual(['Alpha Agro Synthetic', 'Beta Works Synthetic']);
  });

  it('Incomplete: incomplete=1 = the 11.14 "Records missing T1–T11" set (Staff and DG)', async () => {
    const staffMine = (await get('/api/analytics/mine').expect(200)).body;
    expect(staffMine.attention.missingFields.to).toBe('/investors?incomplete=1&officer=me');
    const staffList = (await get(`/api${staffMine.attention.missingFields.to}`).expect(200)).body;
    expect(staffList).toHaveLength(staffMine.attention.missingFields.count);
    // Beta has a project without a value.
    expect(staffList.map((i) => i.investorName)).toEqual(['Beta Works Synthetic']);

    const dgMine = (await get('/api/analytics/mine', global.dgToken).expect(200)).body;
    expect(dgMine.attention.missingFields.to).toBe('/investors?incomplete=1');
    const dgList = await names('?incomplete=1', global.dgToken);
    expect(dgList).toHaveLength(dgMine.attention.missingFields.count);
    expect(dgList).toEqual(['Beta Works Synthetic', 'Gamma Broker Synthetic', 'Test Investor']);
    expect(dgMine.attention.noContact.to).toBe('/investors?noContactDays=60');
    expect(dgMine.attention.staleIssues.to).toBe('/issues?stale=1');
    expect(dgMine.attention.untaggedInteractions.to).toBe('/interactions?noCode=1');
    expect(dgMine.attention.untaggedFiles.to).toBe('/evidence?untagged=1');
    expect(staffMine.attention.staleIssues.to).toBe('/issues?stale=1&officer=me');
    expect(staffMine.attention.untaggedInteractions.to).toBe('/interactions?noCode=1&officer=me');
  });

  it('sort by name, country, first contact; X-Total-Count is the unfiltered total', async () => {
    const byName = await get('/api/investors?sort=-name').expect(200);
    expect(byName.body.map((i) => i.investorName)).toEqual([...ALL_INVESTORS].reverse());
    expect(byName.headers['x-total-count']).toBe('5');
    const filtered = await get('/api/investors?sector=Manufacturing&sort=name').expect(200);
    expect(filtered.headers['x-total-count']).toBe('5');
    const byFirst = (await get('/api/investors?sort=firstContact&officer=me').expect(200)).body.map((i) => i.investorName);
    expect(byFirst).toEqual(['Alpha Agro Synthetic', 'Beta Works Synthetic']);
    // An unknown sort key is ignored.
    expect((await get('/api/investors?sort=secret').expect(200)).body).toHaveLength(5);
  });

  it('q combines with filters (backward compatible single values)', async () => {
    expect(await names('?q=synthetic&organisationType=Investor')).toEqual(['Alpha Agro Synthetic', 'Beta Works Synthetic', 'Delta Other Synthetic']);
    expect(await names('?q=mill')).toEqual(['Alpha Agro Synthetic']); // project title
  });
});

describe('Projects', () => {
  it('q (title, location, investor), hasValue, hasJobs, currency, lifecycleStatus, investor, officer, organisationType', async () => {
    expect(await titles('?q=alpha')).toEqual(['Alpha Mill']);
    expect(await titles('?q=ibadan')).toEqual(['Alpha Mill']);
    expect(await titles('?q=beta%20works')).toEqual(['Beta Plant']);
    expect(await titles('?hasValue=1')).toEqual(['Alpha Mill', 'Delta Farm']);
    expect(await titles('?hasJobs=1')).toEqual(['Alpha Mill', 'Delta Farm']);
    expect(await titles('?currency=USD')).toEqual(['Alpha Mill']);
    expect(await titles('?currency=NGN')).toEqual(['Beta Plant', 'Delta Farm', 'Test Project']);
    expect(await titles('?lifecycleStatus=Lead')).toEqual(['Alpha Mill']);
    // A status that matches none → no projects (as before 11.15); a known one among them still counts.
    expect(await titles('?lifecycleStatus=Nowhere')).toEqual([]);
    expect(await titles('?lifecycleStatus=Nowhere&lifecycleStatus=Lead')).toEqual(['Alpha Mill']);
    expect(await names('?stage=Nowhere')).toEqual([]);
    expect(await titles(`?investor=${f.beta._id},${f.delta._id}`)).toEqual(['Beta Plant', 'Delta Farm']);
    expect(await titles('?officer=me')).toEqual(['Alpha Mill', 'Beta Plant']);
    expect(await titles('?sector=Manufacturing')).toEqual(['Beta Plant']);
    expect(await titles('?organisationType=Investor&hasJobs=1')).toEqual(['Alpha Mill', 'Delta Farm']);
  });

  it('sort by value, jobs, title, stage', async () => {
    const order = async (s) => (await get(`/api/projects?sort=${s}`).expect(200)).body.map((p) => p.projectTitle);
    expect((await order('-value')).slice(0, 2)).toEqual(['Delta Farm', 'Alpha Mill']);
    expect((await order('-jobs')).slice(0, 2)).toEqual(['Alpha Mill', 'Delta Farm']);
    expect(await order('title')).toEqual(['Alpha Mill', 'Beta Plant', 'Delta Farm', 'Test Project']);
    expect((await order('-stage'))[0]).toBe('Alpha Mill');
    const res = await get('/api/projects?hasValue=1').expect(200);
    expect(res.headers['x-total-count']).toBe('4');
  });

  it('click-through: dashboard values coverage, jobs and project sector equal the project lists', async () => {
    const overview = (await get('/api/analytics/overview', global.dgToken).expect(200)).body;
    const valueList = (await get('/api/projects?hasValue=1&organisationType=Investor').expect(200)).body;
    expect(valueList).toHaveLength(overview.headline.values.coverage.with);
    const jobsList = (await get('/api/projects?hasJobs=1&organisationType=Investor').expect(200)).body;
    expect(jobsList).toHaveLength(overview.headline.jobs.count);
    const agri = overview.breakdowns.projectSector.items.find((i) => i.label === 'Agribusiness');
    expect(agri.to).toBe('/projects?sector=Agribusiness&organisationType=Investor');
    expect((await get(`/api${agri.to}`).expect(200)).body).toHaveLength(agri.count);
    expect(agri.count).toBe(2);
  });
});

describe('Interactions', () => {
  const descs = async (qs, token) => (await get(`/api/interactions${qs}`, token).expect(200)).body.map((l) => l.description);

  it('noCode=1: officer logs with no SABER code (no System Update)', async () => {
    expect(await descs('?noCode=1')).toEqual(['Phone call about land']);
    expect(await descs('?noCode=1&loggedBy=me')).toEqual(['Phone call about land']);
    expect(await descs('?noCode=1', global.dgToken)).toEqual(['Phone call about land']);
  });

  it('q, category, serviceCode, investor, loggedBy, from/to, year; default newest first; sort=date oldest first', async () => {
    expect(await descs('?q=mill')).toEqual(['Site visit to the mill']);
    expect(await descs('?category=Meeting,Email')).toEqual(['Email to the delta team', 'Site visit to the mill']);
    expect(await descs('?serviceCode=M4,I2,ZZ')).toEqual(['Email to the delta team', 'Site visit to the mill']);
    // Investor: its own logs and logs of its projects.
    expect(await descs(`?investor=${f.beta._id}`)).toEqual(['Lifecycle status changed', 'Phone call about land']);
    expect(await descs(`?loggedBy=${other._id}`)).toEqual(['Email to the delta team']);
    expect(await descs(`?from=${iso(dayAgo(11))}&to=${iso(dayAgo(5))}`)).toEqual(['Email to the delta team', 'Site visit to the mill']);
    expect(await descs(`?to=${iso(dayAgo(50))}`)).toEqual(['Phone call about land']);
    expect(await descs('?from=2026-13-40')).toHaveLength(4); // bad date ignored
    const year = iso(dayAgo(10)).slice(0, 4);
    expect((await descs(`?year=${year}`)).length).toBeGreaterThanOrEqual(3);
    expect(await descs('')).toEqual(['Lifecycle status changed', 'Email to the delta team', 'Site visit to the mill', 'Phone call about land']);
    expect(await descs('?sort=date')).toEqual(['Phone call about land', 'Site visit to the mill', 'Email to the delta team', 'Lifecycle status changed']);
    const res = await get('/api/interactions?noCode=1').expect(200);
    expect(res.headers['x-total-count']).toBe('4');
    expect(res.body[0]).toHaveProperty('evidenceFiles');
  });
});

describe('Issues', () => {
  const refs = async (qs) => (await get(`/api/issues${qs}`).expect(200)).body.map((i) => i.reference);

  it('stale=1&officer=me, status multi, category, mda, year, q by reference / description; default newest first', async () => {
    expect(await refs('?stale=1')).toEqual(['ISS-05']);
    expect(await refs('?stale=1&officer=me')).toEqual(['ISS-05']);
    const mine = (await get('/api/analytics/mine').expect(200)).body;
    expect(mine.attention.staleIssues.count).toBe(1);
    expect((await refs('?status=Open,In%20progress')).sort()).toEqual(['ISS-05', 'ISS-06']);
    expect(await refs('?category=land%2Ftitle')).toEqual(['ISS-07']);
    expect(await refs('?mda=TRADE')).toEqual(['ISS-05']);
    expect(await refs('?year=2025')).toEqual(['ISS-07']);
    expect(await refs('?q=ISS-05')).toEqual(['ISS-05']);
    expect(await refs('?q=iss%2005')).toEqual(['ISS-05']);
    expect(await refs(`?officer=${other._id}`)).toEqual(['ISS-07']);
    expect((await refs('?sort=date'))[0]).toBe('ISS-07');
    expect((await refs(''))[2]).toBe('ISS-07');
  });
});

describe('Announcements', () => {
  const outlets = async (qs) => (await get(`/api/announcements${qs}`).expect(200)).body.map((a) => a.outlet);

  it('q (outlet, project, investor), year, oysipaNamed, project, from/to, sort', async () => {
    expect(await outlets('?q=daily')).toEqual(['Synthetic Daily']);
    expect(await outlets('?q=beta%20plant')).toEqual(['Example Wire']);
    expect(await outlets('?q=alpha%20agro')).toEqual(['Synthetic Daily']);
    expect(await outlets('?year=2025,2026')).toEqual(['Synthetic Daily', 'Example Wire']);
    expect(await outlets('?oysipaNamed=true')).toEqual(['Synthetic Daily']);
    expect(await outlets(`?project=${f.betaProject._id}`)).toEqual(['Example Wire']);
    expect(await outlets('?from=2026-01-01&to=2026-04-10')).toEqual(['Synthetic Daily']);
    expect(await outlets('?from=2026-04-11')).toEqual([]);
    expect(await outlets('?sort=date')).toEqual(['Example Wire', 'Synthetic Daily']);
  });
});

describe('Evidence files', () => {
  const files = async (qs) => (await get(`/api/evidence/folders/${f.folder._id}/files${qs}`).expect(200)).body.files.map((x) => x.fileName);

  it('folder files: q (name / what), untagged, type, from/to, sort; shape kept', async () => {
    const res = await get(`/api/evidence/folders/${f.folder._id}/files`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['files', 'folder', 'subfolders']);
    expect(res.headers['x-total-count']).toBe('3');
    expect(await files('?q=forum')).toEqual(['forum-report.pdf', 'Attendance photo.jpg']);
    expect(await files('?untagged=1')).toEqual(['budget.xlsx', 'Attendance photo.jpg']);
    expect(await files('?type=pdf,image')).toEqual(['forum-report.pdf', 'Attendance photo.jpg']);
    expect(await files('?type=spreadsheet')).toEqual(['budget.xlsx']);
    expect(await files('?from=2026-01-01')).toEqual(['forum-report.pdf', 'Attendance photo.jpg']);
    expect(await files('?sort=name')).toEqual(['Attendance photo.jpg', 'budget.xlsx', 'forum-report.pdf']);
    expect(await files('?sort=-date')).toEqual(['Attendance photo.jpg', 'forum-report.pdf', 'budget.xlsx']);
  });

  it('GET /api/evidence/files: library-wide, same filters, folder name; no storage internals', async () => {
    const res = await get('/api/evidence/files?untagged=1').expect(200);
    expect(res.body.map((x) => x.fileName)).toEqual(['budget.xlsx', 'Attendance photo.jpg']);
    expect(res.body[0].folder).toMatchObject({ name: 'Programmes and events' });
    expect(res.body[0]).not.toHaveProperty('key');
    expect(res.headers['x-total-count']).toBe('3');
  });
});

describe('Parameters (review #2, #5, #9, #10)', () => {
  it('repeated params are taken whole; a comma inside a known value is kept; old comma links still split', async () => {
    await Investor.create({ investorName: 'Korea Synthetic', sector: 'Agribusiness', countryOfOrigin: 'Korea, Republic of' });
    expect(await names(`?country=${encodeURIComponent('Korea, Republic of')}`)).toEqual(['Korea Synthetic']);
    expect(await names(`?country=${encodeURIComponent('Korea, Republic of')}&country=China`)).toEqual(['Beta Works Synthetic', 'Korea Synthetic']);
    expect(await names('?country=China,Ghana')).toEqual(['Beta Works Synthetic', 'Delta Other Synthetic']);
    expect(await names('?sector=Manufacturing&sector=Agribusiness')).toHaveLength(5);

    const comma = await LifecycleStatus.create({ name: 'Due diligence, phase 1', order: 5 });
    await InvestmentProject.updateOne({ _id: f.betaProject._id }, { $set: { lifecycleStatus: comma._id } });
    expect(await titles(`?lifecycleStatus=${encodeURIComponent('Due diligence, phase 1')}`)).toEqual(['Beta Plant']);
    expect(await titles(`?lifecycleStatus=${encodeURIComponent('Due diligence, phase 1')}&lifecycleStatus=Lead`)).toEqual(['Alpha Mill', 'Beta Plant']);
    expect(await names(`?stage=${encodeURIComponent('Due diligence, phase 1')}`)).toEqual(['Beta Works Synthetic']);
    // Issues: repeated status values.
    const refs = (await get('/api/issues?status=Open&status=In%20progress').expect(200)).body.map((i) => i.reference).sort();
    expect(refs).toEqual(['ISS-05', 'ISS-06']);
  });

  it('flags accept 1 and true; other spellings are ignored', async () => {
    expect(await titles('?hasValue=true')).toEqual(await titles('?hasValue=1'));
    expect(await titles('?hasValue=yes')).toHaveLength(4);
    expect(await names('?incomplete=true')).toEqual(await names('?incomplete=1'));
    const a = (await get('/api/announcements?oysipaNamed=1').expect(200)).body.map((x) => x.outlet);
    expect(a).toEqual(['Synthetic Daily']);
  });

  it('at most 50 values per parameter; q is cut to 200 characters; an array q uses its first value', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `Nowhere ${i}`);
    const qs = [...many, 'China'].map((c) => `country=${encodeURIComponent(c)}`).join('&');
    // "China" is the 61st value: dropped, so nothing matches.
    expect(await names(`?${qs}`)).toEqual([]);
    expect(await names(`?q=${'alpha'.padEnd(250, 'z')}`)).toEqual([]);
    expect(await names('?q=alpha&q=beta')).toEqual(['Alpha Agro Synthetic']);
  });

  it('from / to on a recorded-time fallback use the Lagos day; from after to is ignored', async () => {
    // 23:30 UTC on 31 Mar is 1 Apr in Lagos.
    const log = await InteractionLog.create({ investor: f.alpha._id, loggedBy: staff._id, description: 'Late night note', category: 'Note' });
    await InteractionLog.updateOne({ _id: log._id }, { $unset: { interactionDate: 1 } });
    await InteractionLog.collection.updateOne({ _id: log._id }, { $set: { createdAt: new Date('2026-03-31T23:30:00.000Z') } });
    const descs = async (qs) => (await get(`/api/interactions${qs}`).expect(200)).body.map((l) => l.description);
    expect(await descs('?from=2026-04-01&to=2026-04-01')).toEqual(['Late night note']);
    expect(await descs('?from=2026-03-31&to=2026-03-31')).toEqual([]);
    expect(await descs('?from=2026-05-01&to=2026-04-01')).toHaveLength(5);
  });

  it('sorts per list', async () => {
    const order = async (path, key) => (await get(path).expect(200)).body.map(key);
    expect(await order('/api/investors?sort=country&officer=me', (i) => i.countryOfOrigin)).toEqual(['China', 'Nigeria']);
    expect(await order('/api/investors?sort=-sector&officer=me', (i) => i.sector)).toEqual(['Manufacturing', 'Agribusiness']);
    expect(await order('/api/issues?sort=-date', (i) => i.reference)).toHaveLength(3);
    expect((await order('/api/issues?sort=date', (i) => i.reference))[0]).toBe('ISS-07');
    expect(await order('/api/announcements?sort=-date', (a) => a.outlet)).toEqual(['Synthetic Daily', 'Example Wire']);
    expect((await order('/api/interactions?sort=-date', (l) => l.description))[0]).toBe('Lifecycle status changed');
    const files = (await get(`/api/evidence/folders/${f.folder._id}/files?sort=-name`).expect(200)).body.files.map((x) => x.fileName);
    expect(files).toEqual(['forum-report.pdf', 'budget.xlsx', 'Attendance photo.jpg']);
  });
});
