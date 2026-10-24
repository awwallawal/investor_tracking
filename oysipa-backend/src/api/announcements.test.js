// Story 11.8: announcements register (DLR 4.4). Synthetic data and a fake
// storage provider only.
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const ChangeLog = require('../models/ChangeLog');
const documentStorage = require('../services/documentStorage');
const { todayLagos } = require('../utils/happenedDate');
const { announcementBand } = require('../constants/announcementFields');

const MISSING_ID = '507f1f77bcf86cd799439011';
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;

let staff;
let staffToken;
let assigned;
let other;
let project;
let otherProject;
let idea;
let fake;

const makeFake = () => {
  let n = 0;
  return {
    name: 'fake',
    isConfigured: () => true,
    upload: jest.fn(async () => { n += 1; return { key: `ann-${n}`, resourceType: 'raw' }; }),
    signedUrl: jest.fn(async (doc) => `https://signed.example.test/${doc.key}`),
    remove: jest.fn(async () => {}),
  };
};

const tomorrow = () => {
  const d = new Date(`${todayLagos()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  await Promise.all([
    InvestmentAnnouncement.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({}), ChangeLog.collection.deleteMany({}),
  ]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  staff = await User.create({ name: 'Ann Staff', email: 'ann.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  assigned = await Investor.create({ investorName: 'Ann Assigned', sector: 'Agro', countryOfOrigin: 'NG', assignedTo: staff._id });
  other = await Investor.create({ investorName: 'Ann Other', sector: 'Agro', countryOfOrigin: 'NG' });
  idea = await LifecycleStatus.findOne({ name: 'Idea' });
  project = await InvestmentProject.create({ projectTitle: 'Ann Plant', investor: assigned._id, lifecycleStatus: idea._id });
  otherProject = await InvestmentProject.create({ projectTitle: 'Ann Other Plant', investor: other._id, lifecycleStatus: idea._id });
});

afterEach(() => {
  documentStorage.__setProviderForTests(null);
  jest.restoreAllMocks();
});

const create = (token, body) => request(app).post('/api/announcements').set('Authorization', bearer(token)).send(body);
const update = (token, id, body) => request(app).put(`/api/announcements/${id}`).set('Authorization', bearer(token)).send(body);
const link = (token, id, interactions) => request(app).post(`/api/announcements/${id}/interactions`).set('Authorization', bearer(token)).send({ interactions });
const valid = (extra = {}) => ({
  project: project._id.toString(), announcementDate: '2026-04-23', outlet: 'State website', oysipaNamed: true, oysipaRoleText: 'Facilitated land allocation', ...extra,
});
const mkAnn = (extra = {}) => InvestmentAnnouncement.create({
  project: project._id, announcementDate: new Date('2026-04-23T00:00:00.000Z'), outlet: 'Synthetic Daily', oysipaNamed: false, ...extra,
});
const mkLog = (extra) => InteractionLog.create({
  loggedBy: staff._id, description: 'Synthetic meeting', category: 'Meeting', interactionDate: new Date('2026-03-01T00:00:00.000Z'), ...extra,
});

describe('Register', () => {
  it('201 with project, date, outlet, OYSIPA named + role text; server fields are ignored', async () => {
    const res = await create(staffToken, valid({
      url: 'https://news.example.test/a', archivedCopyUrl: 'http://archive.example.test/a', createdBy: MISSING_ID, importRef: 'X', importBatchId: 'b', createdAt: '2020-01-01',
    })).expect(201);
    expect(res.body.announcementDate).toBe('2026-04-23T00:00:00.000Z');
    expect(res.body.outlet).toBe('State website');
    expect(res.body.oysipaNamed).toBe(true);
    expect(res.body.url).toBe('https://news.example.test/a');
    expect(res.body.archivedCopyUrl).toBe('http://archive.example.test/a');
    expect(res.body.project.projectTitle).toBe('Ann Plant');
    expect(res.body.project.investor.investorName).toBe('Ann Assigned');
    expect(res.body.createdBy.name).toBe('Ann Staff');
    expect(res.body.importRef).toBeUndefined();
    expect(res.body.importBatchId).toBeUndefined();
    expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThan(2020);
    expect(res.body.files).toEqual([]);
  });

  it('oysipaNamed defaults to false; no role text needed then', async () => {
    const res = await create(global.dgToken, valid({ oysipaNamed: undefined, oysipaRoleText: undefined })).expect(201);
    expect(res.body.oysipaNamed).toBe(false);
  });

  it.each([
    ['project', { project: undefined }],
    ['project (unknown)', { project: MISSING_ID }],
    ['outlet', { outlet: '  ' }],
    ['date', { announcementDate: undefined }],
  ])('missing %s → 400, nothing saved', async (label, extra) => {
    await create(global.dgToken, valid(extra)).expect(400);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });

  it('OYSIPA named without role text → 400', async () => {
    await create(global.dgToken, valid({ oysipaRoleText: '  ' })).expect(400);
    await create(global.dgToken, valid({ oysipaRoleText: undefined })).expect(400);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });

  it.each([
    ['url', 'javascript:x'],
    ['url', 'ftp://example.test/x'],
    ['url', 'not a link'],
    ['archivedCopyUrl', 'javascript:alert(1)'],
  ])('bad %s %s → 400', async (field, value) => {
    await create(global.dgToken, valid({ [field]: value })).expect(400);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });

  it('oysipaNamed must be a boolean', async () => {
    await create(global.dgToken, valid({ oysipaNamed: 'yes' })).expect(400);
  });

  it('future date → 400', async () => {
    await create(global.dgToken, valid({ announcementDate: tomorrow() })).expect(400);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });

  it('Staff on a project of an unassigned investor → 403, nothing saved', async () => {
    const res = await create(staffToken, valid({ project: otherProject._id.toString() }));
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ msg: 'Forbidden: You can only change investors assigned to you' });
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });
});

describe('Edit', () => {
  it('assigned Staff edits fields; clearing a link; named needs role text; future date → 400', async () => {
    const ann = await mkAnn({ url: 'https://a.example.test' });
    const res = await update(staffToken, ann._id, { outlet: 'New outlet', url: '' }).expect(200);
    expect(res.body.outlet).toBe('New outlet');
    expect(res.body.url).toBeUndefined();
    await update(staffToken, ann._id, { oysipaNamed: true }).expect(400);
    await update(staffToken, ann._id, { oysipaNamed: true, oysipaRoleText: 'Aftercare' }).expect(200);
    await update(staffToken, ann._id, { oysipaRoleText: '' }).expect(400);
    await update(staffToken, ann._id, { oysipaRoleText: null }).expect(400);
    await update(staffToken, ann._id, { announcementDate: tomorrow() }).expect(400);
    await update(staffToken, ann._id, { url: 'javascript:x' }).expect(400);
    await update(staffToken, ann._id, { outlet: '' }).expect(400);
    const stored = await InvestmentAnnouncement.findById(ann._id).lean();
    expect(stored.oysipaNamed).toBe(true);
    expect(stored.oysipaRoleText).toBe('Aftercare');
    // null clears it once OYSIPA is no longer named.
    const cleared = await update(staffToken, ann._id, { oysipaNamed: false, oysipaRoleText: null }).expect(200);
    expect(cleared.body.oysipaRoleText).toBeUndefined();
  });

  it('project: another project of the same investor is fine; another investor\'s → 400', async () => {
    const ann = await mkAnn();
    const sibling = await InvestmentProject.create({ projectTitle: 'Ann Sibling', investor: assigned._id, lifecycleStatus: idea._id });
    await update(global.dgToken, ann._id, { project: otherProject._id.toString() }).expect(400);
    const res = await update(global.dgToken, ann._id, { project: sibling._id.toString() }).expect(200);
    expect(res.body.project.projectTitle).toBe('Ann Sibling');
  });

  it('Staff unassigned → 403 and unchanged; unknown id → 404', async () => {
    const ann = await mkAnn({ project: otherProject._id });
    const res = await update(staffToken, ann._id, { outlet: 'X' });
    expect(res.statusCode).toBe(403);
    expect((await InvestmentAnnouncement.findById(ann._id).lean()).outlet).toBe('Synthetic Daily');
    await update(global.dgToken, MISSING_ID, { outlet: 'X' }).expect(404);
    await request(app).get(`/api/announcements/${MISSING_ID}`).set('Authorization', bearer(staffToken)).expect(404);
    await request(app).get('/api/announcements/not-an-id').set('Authorization', bearer(staffToken)).expect(404);
  });
});

describe('Supporting interactions', () => {
  it('interaction of another investor → 400, nothing linked', async () => {
    const ann = await mkAnn();
    const foreign = await mkLog({ investor: other._id });
    const foreignProjectLog = await mkLog({ project: otherProject._id });
    await link(global.dgToken, ann._id, [foreign._id.toString()]).expect(400);
    await link(global.dgToken, ann._id, [foreignProjectLog._id.toString()]).expect(400);
    await link(global.dgToken, ann._id, [MISSING_ID]).expect(400);
    await link(global.dgToken, ann._id, []).expect(400);
    expect((await InvestmentAnnouncement.findById(ann._id).lean()).supportingInteractions).toEqual([]);
  });

  it('interactions of the project or its investor are linked once (repeat = no duplicate)', async () => {
    const ann = await mkAnn();
    const projLog = await mkLog({ project: project._id });
    const invLog = await mkLog({ investor: assigned._id, description: 'Investor-level call', interactionDate: new Date('2026-02-01T00:00:00.000Z') });
    const res = await link(staffToken, ann._id, [projLog._id.toString(), invLog._id.toString(), projLog._id.toString()]).expect(200);
    expect(res.body.supportingInteractions.map((l) => l._id)).toEqual([invLog._id.toString(), projLog._id.toString()]);
    expect(res.body.supportingInteractions[0].description).toBe('Investor-level call');
    expect(res.body.supportingInteractions[0].interactionDate).toBe('2026-02-01T00:00:00.000Z');
    expect(res.body.supportingInteractions[1].project.projectTitle).toBe('Ann Plant');
    await link(staffToken, ann._id, [projLog._id.toString()]).expect(200);
    expect((await InvestmentAnnouncement.findById(ann._id).lean()).supportingInteractions).toHaveLength(2);
  });

  it('create with supportingInteractions follows the same rule', async () => {
    const foreign = await mkLog({ investor: other._id });
    await create(global.dgToken, valid({ supportingInteractions: [foreign._id.toString()] })).expect(400);
    const own = await mkLog({ project: project._id });
    const res = await create(global.dgToken, valid({ supportingInteractions: [own._id.toString(), own._id.toString()] })).expect(201);
    expect(res.body.supportingInteractions).toHaveLength(1);
  });

  it('unlink removes it; not linked → 404; Staff unassigned → 403', async () => {
    const ann = await mkAnn();
    const projLog = await mkLog({ project: project._id });
    await link(global.dgToken, ann._id, [projLog._id.toString()]).expect(200);
    await request(app).delete(`/api/announcements/${ann._id}/interactions/${projLog._id}`).set('Authorization', bearer(staffToken)).expect(200);
    await request(app).delete(`/api/announcements/${ann._id}/interactions/${projLog._id}`).set('Authorization', bearer(staffToken)).expect(404);
    const foreignAnn = await mkAnn({ project: otherProject._id });
    await link(staffToken, foreignAnn._id, [projLog._id.toString()]).expect(403);
  });

  it('deleting an interaction pulls it from announcements', async () => {
    const ann = await mkAnn();
    const projLog = await mkLog({ project: project._id });
    await link(global.dgToken, ann._id, [projLog._id.toString()]).expect(200);
    await request(app).delete(`/api/interactions/${projLog._id}`).set('Authorization', bearer(global.dgToken)).expect(200);
    expect((await InvestmentAnnouncement.findById(ann._id).lean()).supportingInteractions).toEqual([]);
  });
});

describe('List', () => {
  it('filters by year, OYSIPA named and project; bad filter → 400', async () => {
    await mkAnn({ oysipaNamed: true, oysipaRoleText: 'x' });
    await mkAnn({ announcementDate: new Date('2025-05-01T00:00:00.000Z') });
    await mkAnn({ project: otherProject._id });
    const get = (q) => request(app).get(`/api/announcements${q}`).set('Authorization', bearer(staffToken));
    expect((await get('').expect(200)).body).toHaveLength(3);
    expect((await get('?year=2026').expect(200)).body).toHaveLength(2);
    expect((await get('?oysipaNamed=true').expect(200)).body).toHaveLength(1);
    expect((await get('?oysipaNamed=false&year=2026').expect(200)).body).toHaveLength(1);
    const byProject = (await get(`?project=${otherProject._id}`).expect(200)).body;
    expect(byProject).toHaveLength(1);
    expect(byProject[0].project.investor.investorName).toBe('Ann Other');
    await get('?year=26').expect(400);
    await get('?oysipaNamed=maybe').expect(400);
    await get('?project=nope').expect(400);
  });
});

describe('Announcements metric (DLR 4.4)', () => {
  const metric = (q = '') => request(app).get(`/api/admin/announcements-metric${q}`).set('Authorization', bearer(global.dgToken));

  it('2026: 1 named, 1 not named, 1 named on an Intermediary\'s project → counted 1, basic; by announcementDate, not createdAt', async () => {
    const intermediary = await Investor.create({ investorName: 'Ann Intermediary', sector: 'Finance', countryOfOrigin: 'NG', organisationType: 'Intermediary' });
    const agent = await Investor.create({ investorName: 'Ann Agent', sector: 'Finance', countryOfOrigin: 'NG', organisationType: 'Promotion agent' });
    const intProject = await InvestmentProject.create({ projectTitle: 'Ann Int Project', investor: intermediary._id, lifecycleStatus: idea._id });
    const agentProject = await InvestmentProject.create({ projectTitle: 'Ann Agent Project', investor: agent._id, lifecycleStatus: idea._id });
    await mkAnn({ oysipaNamed: true, oysipaRoleText: 'x' });
    await mkAnn({ oysipaNamed: false });
    await mkAnn({ project: intProject._id, oysipaNamed: true, oysipaRoleText: 'x' });
    await mkAnn({ project: agentProject._id, oysipaNamed: true, oysipaRoleText: 'x' });
    // Recorded in 2026 but announced in 2025: not counted for 2026.
    await mkAnn({ announcementDate: new Date('2025-12-31T00:00:00.000Z'), oysipaNamed: true, oysipaRoleText: 'x' });
    const res = await metric('?year=2026').expect(200);
    expect(res.body).toEqual({ year: 2026, counted: 1, band: 'basic' });
    expect((await metric('?year=2025').expect(200)).body).toEqual({ year: 2025, counted: 1, band: 'basic' });
  });

  it('bands: 0 none yet, 1-4 basic, 5+ stretch', () => {
    expect(announcementBand(0)).toBe('none yet');
    expect(announcementBand(1)).toBe('basic');
    expect(announcementBand(4)).toBe('basic');
    expect(announcementBand(5)).toBe('stretch');
    expect(announcementBand(9)).toBe('stretch');
  });

  it('no year → current Lagos year; bad year → 400; Staff → 403', async () => {
    const res = await metric().expect(200);
    expect(res.body).toEqual({ year: Number(todayLagos().slice(0, 4)), counted: 0, band: 'none yet' });
    await metric('?year=abc').expect(400);
    await request(app).get('/api/admin/announcements-metric').set('Authorization', bearer(staffToken)).expect(403);
  });
});

describe('Files', () => {
  const upload = (token, id, buffer = Buffer.from('%PDF-ann-1'), name = 'copy.pdf') => request(app)
    .post(`/api/announcements/${id}/files`).set('Authorization', bearer(token))
    .attach('file', buffer, { filename: name, contentType: 'application/pdf' });

  it('upload: stored in announcements/<id>, linked to the investor and the announcement, audited (upload + link)', async () => {
    const ann = await mkAnn();
    const res = await upload(staffToken, ann._id).expect(201);
    expect(res.body.key).toBeUndefined();
    const file = await EvidenceFile.findById(res.body._id).lean();
    expect(file.links).toHaveLength(1);
    expect(String(file.links[0].investor)).toBe(String(assigned._id));
    expect(String(file.links[0].announcement)).toBe(String(ann._id));
    const folder = await EvidenceFolder.findById(file.folder).lean();
    expect(folder.key).toBe(`announcements/${ann._id}`);
    const top = await EvidenceFolder.findById(folder.parent).lean();
    expect(top.key).toBe('announcements');
    expect(top.name).toBe('Announcements');
    const rows = await ChangeLog.find({}).lean();
    expect(rows.map((r) => r.action).sort()).toEqual(['link', 'upload']);
    const detail = await request(app).get(`/api/announcements/${ann._id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(detail.body.files.map((f) => f._id)).toEqual([res.body._id]);
    const files = await request(app).get(`/api/announcements/${ann._id}/files`).set('Authorization', bearer(staffToken)).expect(200);
    expect(files.body).toHaveLength(1);
  });

  it('same content (sha256): linked, not stored again; same announcement twice → 409', async () => {
    const a = await mkAnn();
    const b = await mkAnn({ outlet: 'Second' });
    await upload(global.dgToken, a._id).expect(201);
    const second = await upload(global.dgToken, b._id).expect(200);
    expect(second.body.linkedExisting).toBe(true);
    expect(fake.upload).toHaveBeenCalledTimes(1);
    await upload(global.dgToken, b._id).expect(409);
    expect(await EvidenceFile.countDocuments()).toBe(1);
  });

  it('bad type → 400; Staff unassigned → 403 and nothing stored', async () => {
    const ann = await mkAnn();
    await request(app).post(`/api/announcements/${ann._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/octet-stream' }).expect(400);
    const foreign = await mkAnn({ project: otherProject._id });
    await upload(staffToken, foreign._id).expect(403);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it('audit failure on a new upload → 500, no file row, the stored copy is removed', async () => {
    const ann = await mkAnn();
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    await upload(global.dgToken, ann._id).expect(500);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('an announcement link does not block tagging the same file to the investor alone', async () => {
    const ann = await mkAnn();
    const res = await upload(global.dgToken, ann._id).expect(201);
    await request(app).post(`/api/evidence/files/${res.body._id}/links`).set('Authorization', bearer(global.dgToken))
      .send({ investor: assigned._id.toString() }).expect(201);
  });
});

describe('Delete and cascades', () => {
  it('DELETE: Staff → 403; no reason → 400; DG with reason → removed, files unlinked (audited, one batch), files stay', async () => {
    const ann = await mkAnn();
    const up = await request(app).post(`/api/announcements/${ann._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-del'), { filename: 'del.pdf', contentType: 'application/pdf' }).expect(201);
    const del = (token, body) => request(app).delete(`/api/announcements/${ann._id}`).set('Authorization', bearer(token)).send(body);
    await del(staffToken, { reason: 'x' }).expect(403);
    await del(global.dgToken, { reason: '  ' }).expect(400);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(1);
    const res = await del(global.dgToken, { reason: 'Duplicate entry' }).expect(200);
    expect(res.body.deleted).toEqual({ announcements: 1, evidenceLinks: 1 });
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
    const file = await EvidenceFile.findById(up.body._id).lean();
    expect(file).not.toBeNull();
    expect(file.links).toHaveLength(0);
    const rows = await ChangeLog.find({ action: { $in: ['delete', 'unlink'] } }).lean();
    expect(rows.map((r) => `${r.action}:${r.entity}`).sort()).toEqual(['delete:InvestmentAnnouncement', 'unlink:EvidenceFile']);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
    expect(rows.every((r) => r.reason === 'Duplicate entry')).toBe(true);
  });

  it('audit failure → 500 and nothing deleted', async () => {
    const ann = await mkAnn();
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    await request(app).delete(`/api/announcements/${ann._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' }).expect(500);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(1);
  });

  it('deleting an investor deletes its projects\' announcements in the same audit batch and unlinks their files', async () => {
    const ann = await mkAnn();
    const keep = await mkAnn({ project: otherProject._id });
    await request(app).post(`/api/announcements/${ann._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-cascade'), { filename: 'c.pdf', contentType: 'application/pdf' }).expect(201);
    const res = await request(app).delete(`/api/investors/${assigned._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'Test cleanup' }).expect(200);
    expect(res.body.deleted.announcements).toBe(1);
    expect(await InvestmentAnnouncement.exists({ _id: ann._id })).toBeNull();
    expect(await InvestmentAnnouncement.exists({ _id: keep._id })).not.toBeNull();
    const rows = await ChangeLog.find({ action: { $in: ['delete', 'unlink'] } }).lean();
    expect(rows.some((r) => r.entity === 'InvestmentAnnouncement' && String(r.entityId) === String(ann._id))).toBe(true);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
    expect((await EvidenceFile.findOne({}).lean()).links).toHaveLength(0);
  });

  it('a moved project drops supporting interactions of the old investor; those of the project stay', async () => {
    const ann = await mkAnn();
    const sibling = await InvestmentProject.create({ projectTitle: 'Ann Sibling', investor: assigned._id, lifecycleStatus: idea._id });
    const projLog = await mkLog({ project: project._id });
    const invLog = await mkLog({ investor: assigned._id });
    const siblingLog = await mkLog({ project: sibling._id });
    await link(global.dgToken, ann._id, [projLog._id.toString(), invLog._id.toString(), siblingLog._id.toString()]).expect(200);
    await request(app).put(`/api/projects/${project._id}`).set('Authorization', bearer(global.dgToken)).send({ investor: other._id.toString() }).expect(200);
    expect((await InvestmentAnnouncement.findById(ann._id).lean()).supportingInteractions.map(String)).toEqual([String(projLog._id)]);
  });

  it("deleting an investor pulls its deleted interactions from surviving announcements", async () => {
    const ann = await mkAnn();
    const invLog = await mkLog({ investor: assigned._id });
    await link(global.dgToken, ann._id, [invLog._id.toString()]).expect(200);
    await request(app).put(`/api/projects/${project._id}`).set('Authorization', bearer(global.dgToken)).send({ investor: other._id.toString() }).expect(200);
    // An announcement of another investor still citing A's log (e.g. older data).
    const legacy = await mkAnn({ project: otherProject._id, supportingInteractions: [invLog._id] });
    await request(app).delete(`/api/investors/${assigned._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' }).expect(200);
    expect((await InvestmentAnnouncement.findById(ann._id).lean()).supportingInteractions).toEqual([]);
    expect((await InvestmentAnnouncement.findById(legacy._id).lean()).supportingInteractions).toEqual([]);
  });

  it('a project moved to another investor keeps its announcements; their file links follow', async () => {
    const ann = await mkAnn();
    await request(app).post(`/api/announcements/${ann._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-move'), { filename: 'm.pdf', contentType: 'application/pdf' }).expect(201);
    await request(app).put(`/api/projects/${project._id}`).set('Authorization', bearer(global.dgToken)).send({ investor: other._id.toString() }).expect(200);
    expect(String((await InvestmentAnnouncement.findById(ann._id).lean()).project)).toBe(String(project._id));
    const file = await EvidenceFile.findOne({}).lean();
    expect(String(file.links[0].investor)).toBe(String(other._id));
    // Deleting the old investor no longer touches the moved project's announcement.
    await request(app).delete(`/api/investors/${assigned._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' }).expect(200);
    expect(await InvestmentAnnouncement.exists({ _id: ann._id })).not.toBeNull();
    expect((await EvidenceFile.findOne({}).lean()).links).toHaveLength(1);
  });
});
