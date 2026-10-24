// Story 11.7: investor issues register (DLR 4.5) and Investor Directory search.
// Synthetic data and a fake storage provider only.
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestorIssue = require('../models/InvestorIssue');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const ChangeLog = require('../models/ChangeLog');
const documentStorage = require('../services/documentStorage');
const { normaliseSearch, searchPattern } = require('../services/investorSearch');
const { todayLagos } = require('../utils/happenedDate');

const MISSING_ID = '507f1f77bcf86cd799439011';
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;

let staff;
let staffToken;
let dgUser;
let assigned;
let other;
let project;
let fake;
let idea;

const makeFake = () => {
  let n = 0;
  return {
    name: 'fake',
    isConfigured: () => true,
    upload: jest.fn(async () => { n += 1; return { key: `iss-${n}`, resourceType: 'raw' }; }),
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
  // Every model's index builds finish first, so none is still running when the
  // database is dropped at the end (that left a request hanging).
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  await Promise.all([
    InvestorIssue.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({}), ChangeLog.collection.deleteMany({}),
  ]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  dgUser = await User.findOne({ email: 'dg@example.com' });
  staff = await User.create({ name: 'Issue Staff', email: 'issue.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  assigned = await Investor.create({ investorName: 'Issue Assigned', sector: 'Agro', countryOfOrigin: 'NG', assignedTo: staff._id });
  other = await Investor.create({ investorName: 'Issue Other', sector: 'Agro', countryOfOrigin: 'NG' });
  idea = await LifecycleStatus.findOne({ name: 'Idea' });
  project = await InvestmentProject.create({ projectTitle: 'Issue Plant', investor: assigned._id, lifecycleStatus: idea._id });
});

afterEach(() => {
  documentStorage.__setProviderForTests(null);
  jest.restoreAllMocks();
});

const create = (token, body) => request(app).post('/api/issues').set('Authorization', bearer(token)).send(body);
const update = (token, id, body) => request(app).put(`/api/issues/${id}`).set('Authorization', bearer(token)).send(body);
const valid = (extra = {}) => ({
  investor: assigned._id.toString(), category: 'land/title', description: 'C of O delayed', ...extra,
});
const mkIssue = (extra = {}) => InvestorIssue.create({
  investor: assigned._id, dateRegistered: new Date(), dateReported: new Date('2026-03-01T00:00:00.000Z'), category: 'other', description: 'Synthetic', ...extra,
});

describe('Register', () => {
  it('201: status Open, dateRegistered is the server time; client server fields are ignored', async () => {
    const before = Date.now();
    const res = await create(staffToken, valid({
      status: 'Resolved', dateRegistered: '2020-01-01', resolvedDate: '2020-01-01', createdAt: '2020-01-01', importRef: 'X', importBatchId: 'b', project: project._id.toString(), mdaResponsible: ['LANDS AND HOUSING', 'BIR', 'LANDS AND HOUSING'], reportedVia: 'visit',
    })).expect(201);
    expect(res.body.status).toBe('Open');
    expect(new Date(res.body.dateRegistered).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(res.body.resolvedDate).toBeUndefined();
    expect(res.body.importRef).toBeUndefined();
    expect(res.body.importBatchId).toBeUndefined();
    expect(res.body.dateReported.slice(0, 10)).toBe(todayLagos());
    expect(res.body.project.projectTitle).toBe('Issue Plant');
    expect(res.body.investor.investorName).toBe('Issue Assigned');
    expect(res.body.mdaResponsible).toEqual(['LANDS AND HOUSING', 'BIR']); // codes, de-duplicated
  });

  it.each([
    ['investor', { investor: undefined }],
    ['category', { category: undefined }],
    ['description', { description: '   ' }],
  ])('missing %s → 400, nothing saved', async (label, extra) => {
    await create(global.dgToken, valid(extra)).expect(400);
    expect(await InvestorIssue.countDocuments()).toBe(0);
  });

  it('bad category, MDA, reportedVia or a project of another investor → 400', async () => {
    const otherProject = await InvestmentProject.create({ projectTitle: 'Not theirs', investor: other._id, lifecycleStatus: idea._id });
    await create(global.dgToken, valid({ category: 'weather' })).expect(400);
    await create(global.dgToken, valid({ mdaResponsible: ['Ministry of Magic'] })).expect(400);
    // 11.7c: codes only; a name is refused and named in the message
    const named = await create(global.dgToken, valid({ mdaResponsible: ['TRADE', 'Ministry of Lands and Housing'] })).expect(400);
    expect(named.body.message).toContain('"Ministry of Lands and Housing"');
    await create(global.dgToken, valid({ reportedVia: 'pigeon' })).expect(400);
    await create(global.dgToken, valid({ project: otherProject._id.toString() })).expect(400);
    expect(await InvestorIssue.countDocuments()).toBe(0);
  });

  it('future dateReported → 400; a past one is kept', async () => {
    await create(global.dgToken, valid({ dateReported: tomorrow() })).expect(400);
    const res = await create(global.dgToken, valid({ dateReported: '2025-06-01' })).expect(201);
    expect(res.body.dateReported).toBe('2025-06-01T00:00:00.000Z');
  });

  it('Staff on an investor not assigned to them → 403, nothing saved', async () => {
    const res = await create(staffToken, valid({ investor: other._id.toString() }));
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ msg: 'Forbidden: You can only change investors assigned to you' });
    expect(await InvestorIssue.countDocuments()).toBe(0);
  });
});

describe('Status, resolve and actions', () => {
  it('resolve without a note → 400 and unchanged; with a note → resolvedDate set; reopen clears it', async () => {
    const issue = await mkIssue();
    const bad = await update(staffToken, issue._id, { status: 'Resolved', resolution: '  ' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.message).toMatch(/resolution/i);
    expect((await InvestorIssue.findById(issue._id)).status).toBe('Open');

    const ok = await update(staffToken, issue._id, { status: 'Resolved', resolution: 'C of O issued', resolvedDate: '2020-01-01' }).expect(200);
    expect(ok.body.status).toBe('Resolved');
    expect(new Date(ok.body.resolvedDate).getFullYear()).toBeGreaterThan(2020);

    const reopened = await update(staffToken, issue._id, { status: 'In progress' }).expect(200);
    expect(reopened.body.resolvedDate).toBeUndefined();
    expect((await InvestorIssue.findById(issue._id).lean()).resolvedDate).toBeUndefined();
  });

  it.each(['Resolved', 'Closed unresolved', 'Withdrawn'])('%s without a note → 400 and unchanged; with a note → saved', async (status) => {
    const issue = await mkIssue();
    for (const body of [{ status }, { status, resolution: '' }, { status, resolution: '   ' }]) {
      const bad = await update(staffToken, issue._id, body);
      expect(bad.statusCode).toBe(400);
      expect(bad.body.message).toBe('A resolution / reason note is required to set this status.');
    }
    const unchanged = await InvestorIssue.findById(issue._id).lean();
    expect(unchanged.status).toBe('Open');
    expect(unchanged.resolution).toBeUndefined();

    const ok = await update(staffToken, issue._id, { status, resolution: '  Synthetic closing note  ' }).expect(200);
    expect(ok.body.status).toBe(status);
    expect(ok.body.resolution).toBe('Synthetic closing note');
    const saved = await InvestorIssue.findById(issue._id).lean();
    expect(saved.status).toBe(status);
    expect(saved.resolution).toBe('Synthetic closing note');
    // resolvedDate behaviour unchanged: only Resolved sets it.
    if (status === 'Resolved') expect(saved.resolvedDate).toBeInstanceOf(Date);
    else expect(saved.resolvedDate).toBeUndefined();
  });

  it('a closed issue cannot have its note cleared; moving back to Open needs no note', async () => {
    const issue = await mkIssue();
    await update(staffToken, issue._id, { status: 'Withdrawn', resolution: 'Synthetic withdrawal' }).expect(200);
    const cleared = await update(staffToken, issue._id, { resolution: '' });
    expect(cleared.statusCode).toBe(400);
    expect((await InvestorIssue.findById(issue._id).lean()).resolution).toBe('Synthetic withdrawal');
    await update(staffToken, issue._id, { status: 'Open' }).expect(200);
  });

  it('dateRegistered never changes on update', async () => {
    const issue = await mkIssue();
    await update(global.dgToken, issue._id, { dateRegistered: '2020-01-01', description: 'Changed' }).expect(200);
    const after = await InvestorIssue.findById(issue._id).lean();
    expect(after.dateRegistered.getTime()).toBe(issue.dateRegistered.getTime());
    expect(after.description).toBe('Changed');
  });

  it('add action: appended with recordedBy/recordedAt; empty note → 400', async () => {
    const issue = await mkIssue();
    await request(app).post(`/api/issues/${issue._id}/actions`).set('Authorization', bearer(staffToken)).send({ note: ' ' }).expect(400);
    const res = await request(app).post(`/api/issues/${issue._id}/actions`).set('Authorization', bearer(staffToken))
      .send({ date: '2026-03-02', by: 'Lands desk', note: 'Letter to Lands', recordedBy: dgUser._id.toString(), recordedAt: '2020-01-01' })
      .expect(201);
    expect(res.body.actions).toHaveLength(1);
    const [a] = res.body.actions;
    expect(a).toMatchObject({ by: 'Lands desk', note: 'Letter to Lands', date: '2026-03-02T00:00:00.000Z' });
    expect(a.recordedBy.name).toBe('Issue Staff');
    expect(new Date(a.recordedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it('acceptance: register, two actions, resolve → detail shows who/when; the year share counts it', async () => {
    const created = await create(staffToken, valid({ dateReported: '2026-02-01' })).expect(201);
    const id = created.body._id;
    await request(app).post(`/api/issues/${id}/actions`).set('Authorization', bearer(staffToken)).send({ note: 'Called Lands' }).expect(201);
    await request(app).post(`/api/issues/${id}/actions`).set('Authorization', bearer(staffToken)).send({ note: 'Site visit' }).expect(201);
    await update(staffToken, id, { status: 'Resolved', resolution: 'Title issued' }).expect(200);
    const detail = await request(app).get(`/api/issues/${id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(detail.body.actions.map((a) => [a.note, a.recordedBy.name])).toEqual([['Called Lands', 'Issue Staff'], ['Site visit', 'Issue Staff']]);
    expect(detail.body.actions.every((a) => a.by === 'Issue Staff' && a.recordedAt)).toBe(true);
    const metric = await request(app).get('/api/admin/issues-metric?year=2026').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(metric.body).toMatchObject({ year: 2026, total: 1, resolved: 1, share: 1, band: 'stretch' });
  });

  it('list filters by status, year and investor; bad filter → 400', async () => {
    await mkIssue({ status: 'Resolved', resolution: 'ok' });
    await mkIssue({ dateReported: new Date('2025-05-01T00:00:00.000Z') });
    await mkIssue({ investor: other._id });
    const get = (qs) => request(app).get(`/api/issues${qs}`).set('Authorization', bearer(staffToken));
    expect((await get('').expect(200)).body).toHaveLength(3);
    expect((await get('?status=Resolved').expect(200)).body).toHaveLength(1);
    expect((await get('?year=2025').expect(200)).body).toHaveLength(1);
    expect((await get(`?investor=${other._id}`).expect(200)).body).toHaveLength(1);
    await get('?status=Lost').expect(400);
    await get('?year=20x6').expect(400);
  });

  it('unknown or malformed id → 404', async () => {
    await request(app).get(`/api/issues/${MISSING_ID}`).set('Authorization', bearer(staffToken)).expect(404);
    await update(global.dgToken, 'nope', { description: 'x' }).expect(404);
  });
});

describe('Resolved-share metric (DLR 4.5)', () => {
  it('2026: 4 issues, 1 Resolved, 1 Withdrawn → 1 of 3, below basic; counted by dateReported, not createdAt', async () => {
    const d = new Date('2026-04-01T00:00:00.000Z');
    await mkIssue({ dateReported: d, status: 'Resolved', resolution: 'done' });
    await mkIssue({ dateReported: d, status: 'Withdrawn' });
    await mkIssue({ dateReported: d });
    await mkIssue({ dateReported: d, status: 'Closed unresolved' });
    // Recorded in 2026 but reported in 2025: not in 2026.
    await mkIssue({ dateReported: new Date('2025-12-31T00:00:00.000Z'), status: 'Resolved', resolution: 'x' });
    const res = await request(app).get('/api/admin/issues-metric?year=2026').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body).toEqual({
      year: 2026, total: 3, resolved: 1, withdrawn: 1, share: 1 / 3, band: 'below basic',
    });
  });

  it('bands: 50% basic, 75% basic, above 75% stretch', async () => {
    const d = new Date('2024-04-01T00:00:00.000Z');
    await mkIssue({ dateReported: d, status: 'Resolved', resolution: 'x' });
    await mkIssue({ dateReported: d });
    let res = await request(app).get('/api/admin/issues-metric?year=2024').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body).toMatchObject({ share: 0.5, band: 'basic' });
    await mkIssue({ dateReported: d, status: 'Resolved', resolution: 'x' });
    await mkIssue({ dateReported: d, status: 'Resolved', resolution: 'x' });
    res = await request(app).get('/api/admin/issues-metric?year=2024').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body).toMatchObject({ share: 0.75, band: 'basic' });
    await mkIssue({ dateReported: d, status: 'Resolved', resolution: 'x' });
    res = await request(app).get('/api/admin/issues-metric?year=2024').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body).toMatchObject({ share: 0.8, band: 'stretch' });
  });

  it('no issues → total 0, share null, band null; bad year → 400; default is the current year', async () => {
    const res = await request(app).get('/api/admin/issues-metric?year=2023').set('Authorization', bearer(global.portalAdminToken)).expect(200);
    expect(res.body).toEqual({
      year: 2023, total: 0, resolved: 0, withdrawn: 0, share: null, band: null,
    });
    await request(app).get('/api/admin/issues-metric?year=abc').set('Authorization', bearer(global.dgToken)).expect(400);
    const def = await request(app).get('/api/admin/issues-metric').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(def.body.year).toBe(Number(todayLagos().slice(0, 4)));
  });
});

describe('Files', () => {
  const upload = (token, id, content, name = 'scan.pdf') => request(app).post(`/api/issues/${id}/files`).set('Authorization', bearer(token))
    .field('documentDate', '2026-03-01')
    .attach('file', Buffer.from(content), { filename: name, contentType: 'application/pdf' });

  it('upload: stored in investor-issues/<ref>, linked to the investor and the issue, audited (upload + link)', async () => {
    const issue = await mkIssue({ importRef: 'ISS-T1' });
    const res = await upload(staffToken, issue._id, '%PDF-issue').expect(201);
    expect(res.body).not.toHaveProperty('key');
    const file = await EvidenceFile.findById(res.body._id).populate('folder').lean();
    expect(file.folder.key).toBe('investor-issues/ISS-T1');
    const top = await EvidenceFolder.findOne({ key: 'investor-issues' }).lean();
    expect(top.name).toBe('Investor issues');
    expect(String(file.folder.parent)).toBe(String(top._id));
    expect(file.links).toHaveLength(1);
    expect(String(file.links[0].investor)).toBe(String(assigned._id));
    expect(String(file.links[0].issue)).toBe(String(issue._id));
    expect(await ChangeLog.countDocuments({ entity: 'EvidenceFile', action: 'upload' })).toBe(1);
    expect(await ChangeLog.countDocuments({ entity: 'EvidenceFile', action: 'link' })).toBe(1);
    // Not untagged.
    expect(await EvidenceFile.countDocuments(EvidenceFile.UNTAGGED)).toBe(0);

    const list = await request(app).get(`/api/issues/${issue._id}/files`).set('Authorization', bearer(staffToken)).expect(200);
    expect(list.body.map((f) => f.fileName)).toEqual(['scan.pdf']);
    const detail = await request(app).get(`/api/issues/${issue._id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(detail.body.files).toHaveLength(1);
    // Opened through the existing evidence link route.
    const link = await request(app).get(`/api/evidence/files/${res.body._id}/link`).set('Authorization', bearer(staffToken)).expect(200);
    expect(link.body.url).toMatch(/signed\.example\.test/);
  });

  it('same content on a second issue: linked, not stored again; same issue twice → 409', async () => {
    const a = await mkIssue();
    const b = await mkIssue();
    await upload(global.dgToken, a._id, '%PDF-shared').expect(201);
    const res = await upload(global.dgToken, b._id, '%PDF-shared').expect(200);
    expect(res.body.linkedExisting).toBe(true);
    expect(fake.upload).toHaveBeenCalledTimes(1);
    expect((await EvidenceFile.findOne({}).lean()).links).toHaveLength(2);
    await upload(global.dgToken, b._id, '%PDF-shared').expect(409);
    // Folder named after the id when there is no importRef.
    expect(await EvidenceFolder.exists({ key: `investor-issues/${a._id}` })).toBeTruthy();
  });

  it('an issue link does not block tagging the same file to the investor alone', async () => {
    const issue = await mkIssue();
    const up = await upload(global.dgToken, issue._id, '%PDF-tag').expect(201);
    await request(app).post(`/api/evidence/files/${up.body._id}/links`).set('Authorization', bearer(global.dgToken))
      .send({ investor: assigned._id.toString() }).expect(201);
  });

  it('audit failure on a new upload → 500, no file row, the stored copy is removed', async () => {
    const issue = await mkIssue();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    await upload(global.dgToken, issue._id, '%PDF-audit').expect(500);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('audit failure on a relink (same content, second issue) → 500, the existing links unchanged', async () => {
    const a = await mkIssue();
    const b = await mkIssue();
    const first = await upload(global.dgToken, a._id, '%PDF-relink').expect(201);
    const before = (await EvidenceFile.findById(first.body._id).lean()).links;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    await upload(global.dgToken, b._id, '%PDF-relink').expect(500);
    const after = (await EvidenceFile.findById(first.body._id).lean()).links;
    expect(after.map((l) => String(l._id))).toEqual(before.map((l) => String(l._id)));
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('Staff not assigned → 403 and nothing stored', async () => {
    const issue = await mkIssue({ investor: other._id });
    const res = await upload(staffToken, issue._id, '%PDF-no');
    expect(res.statusCode).toBe(403);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(fake.upload).not.toHaveBeenCalled();
  });
});

describe('Delete and cascades', () => {
  it('DELETE needs a reason (DG/Admin); it unlinks the files (audited, same batch); the files stay', async () => {
    const issue = await mkIssue();
    const up = await request(app).post(`/api/issues/${issue._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-del'), { filename: 'del.pdf', contentType: 'application/pdf' }).expect(201);
    await request(app).delete(`/api/issues/${issue._id}`).set('Authorization', bearer(global.dgToken)).send({}).expect(400);
    await request(app).delete(`/api/issues/${issue._id}`).set('Authorization', bearer(staffToken)).send({ reason: 'x' }).expect(403);
    const res = await request(app).delete(`/api/issues/${issue._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'Test record' }).expect(200);
    expect(res.body.deleted).toEqual({ issues: 1, evidenceLinks: 1 });
    expect(await InvestorIssue.exists({ _id: issue._id })).toBeNull();
    expect((await EvidenceFile.findById(up.body._id).lean()).links).toHaveLength(0);
    const del = await ChangeLog.findOne({ entity: 'InvestorIssue', action: 'delete' }).lean();
    expect(del.reason).toBe('Test record');
    expect(del.snapshot.description).toBe('Synthetic');
    const unlink = await ChangeLog.findOne({ action: 'unlink' }).lean();
    expect(unlink.batchId).toBe(del.batchId);
  });

  it('audit failure → 500 and nothing deleted', async () => {
    const issue = await mkIssue();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    await request(app).delete(`/api/issues/${issue._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' }).expect(500);
    expect(await InvestorIssue.exists({ _id: issue._id })).toBeTruthy();
  });

  it('deleting an investor deletes its issues in the same audit batch and unlinks their files', async () => {
    const issue = await mkIssue({ investor: other._id });
    const keep = await mkIssue();
    await request(app).post(`/api/issues/${issue._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-casc'), { filename: 'c.pdf', contentType: 'application/pdf' }).expect(201);
    const res = await request(app).delete(`/api/investors/${other._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'Cleanup' }).expect(200);
    expect(res.body.deleted.issues).toBe(1);
    expect(await InvestorIssue.exists({ _id: issue._id })).toBeNull();
    expect(await InvestorIssue.exists({ _id: keep._id })).toBeTruthy();
    const invRow = await ChangeLog.findOne({ entity: 'Investor', action: 'delete' }).lean();
    const issueRow = await ChangeLog.findOne({ entity: 'InvestorIssue', action: 'delete' }).lean();
    expect(issueRow.batchId).toBe(invRow.batchId);
    expect(await ChangeLog.countDocuments({ action: 'unlink', batchId: invRow.batchId })).toBe(1);
    expect((await EvidenceFile.findOne({}).lean()).links).toHaveLength(0);
  });

  it('a project moved to another investor: its issues keep their investor, project is unset', async () => {
    const issue = await mkIssue({ project: project._id });
    await request(app).put(`/api/projects/${project._id}`).set('Authorization', bearer(global.dgToken)).send({ investor: other._id.toString() }).expect(200);
    const after = await InvestorIssue.findById(issue._id).lean();
    expect(String(after.investor)).toBe(String(assigned._id));
    expect(after.project).toBeUndefined();
  });
});

describe('11.7b: reference (ISS-NN)', () => {
  const refOf = async (token = global.dgToken, extra = {}) => (await create(token, valid(extra)).expect(201)).body.reference;

  it('first app issue after the loaded ISS-01..08 is ISS-09; the client cannot set it on POST or PUT', async () => {
    for (let n = 1; n <= 8; n += 1) {
      const ref = `ISS-0${n}`;
      // eslint-disable-next-line no-await-in-loop
      await mkIssue({ importRef: ref, reference: ref });
    }
    const res = await create(staffToken, valid({ reference: 'ISS-77' })).expect(201);
    expect(res.body.reference).toBe('ISS-09');
    const put = await update(staffToken, res.body._id, { reference: 'ISS-55', description: 'Changed' }).expect(200);
    expect(put.body.reference).toBe('ISS-09');
    expect((await InvestorIssue.findById(res.body._id).lean()).reference).toBe('ISS-09');
    const list = await request(app).get('/api/issues').set('Authorization', bearer(staffToken)).expect(200);
    expect(list.body.find((i) => i._id === res.body._id).reference).toBe('ISS-09');
  });

  it('numbering: ISS-01 when none; padded to at least 2 digits (ISS-99 → ISS-100); a loaded ISS-NN importRef not yet backfilled counts', async () => {
    expect(await refOf()).toBe('ISS-01');
    await mkIssue({ reference: 'ISS-99' });
    expect(await refOf()).toBe('ISS-100');
    await InvestorIssue.deleteMany({});
    await mkIssue({ importRef: 'ISS-05' });
    await mkIssue({ importRef: 'ISS-S1' }); // not the format: ignored
    expect(await refOf()).toBe('ISS-06');
  });

  it('a duplicate number (another create took it) is recomputed and retried', async () => {
    const realCreate = InvestorIssue.create.bind(InvestorIssue);
    jest.spyOn(InvestorIssue, 'create').mockImplementationOnce(async (doc) => {
      await InvestorIssue.collection.insertOne({
        investor: assigned._id, dateRegistered: new Date(), dateReported: new Date(), category: 'other', description: 'Competitor', reference: doc.reference,
      });
      return realCreate(doc);
    });
    expect(await refOf()).toBe('ISS-02');
    expect(await InvestorIssue.countDocuments({ reference: 'ISS-01' })).toBe(1);
  });

  it('every retry hits a taken number → 409 "Could not assign an issue number; please try again."', async () => {
    jest.spyOn(InvestorIssue, 'create').mockImplementation(async () => {
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { reference: 1 }, keyValue: { reference: 'ISS-01' } });
    });
    const res = await create(global.dgToken, valid());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('Could not assign an issue number; please try again.');
    expect(InvestorIssue.create).toHaveBeenCalledTimes(5);
  });

  it('a duplicate on another index is not retried as a reference clash', async () => {
    const { isReferenceDuplicate } = require('../services/issueRegister');
    expect(isReferenceDuplicate({ code: 11000, keyPattern: { importRef: 1 }, message: 'reference in text' })).toBe(false);
    expect(isReferenceDuplicate({ code: 11000, keyValue: { reference: 'ISS-01' } })).toBe(true);
  });

  it('references are canonical: ISS-5 = ISS-05, ISS-0 is not a reference', () => {
    const { canonicalReference, referenceNumber } = require('../services/issueRegister');
    expect(canonicalReference('ISS-5')).toBe('ISS-05');
    expect(canonicalReference('ISS-005')).toBe('ISS-05');
    expect(canonicalReference('ISS-100')).toBe('ISS-100');
    expect(canonicalReference('ISS-0')).toBeNull();
    expect(canonicalReference('ISS-S1')).toBeNull();
    expect(referenceNumber('ISS-00')).toBe(0);
  });

  it('parallel creates get different references', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => create(global.dgToken, valid())));
    results.forEach((r) => expect(r.statusCode).toBe(201));
    const refs = results.map((r) => r.body.reference).sort();
    expect(refs).toEqual(['ISS-01', 'ISS-02', 'ISS-03', 'ISS-04']);
  });

  it('new app issue files go into investor-issues/<reference>, named "Issue <reference>"', async () => {
    const created = await create(global.dgToken, valid()).expect(201);
    await request(app).post(`/api/issues/${created.body._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-ref'), { filename: 'r.pdf', contentType: 'application/pdf' }).expect(201);
    const folder = await EvidenceFolder.findOne({ key: 'investor-issues/ISS-01' }).lean();
    expect(folder).toBeTruthy();
    expect(folder.name).toBe('Issue ISS-01');
  });

  it('an existing folder (made before the reference) is kept, not renamed or split', async () => {
    const issue = await mkIssue();
    const up = (c) => request(app).post(`/api/issues/${issue._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from(c), { filename: `${c}.pdf`, contentType: 'application/pdf' }).expect(201);
    await up('%PDF-before');
    await InvestorIssue.collection.updateOne({ _id: issue._id }, { $set: { reference: 'ISS-04' } });
    await up('%PDF-after');
    const folders = await EvidenceFolder.find({ key: /^investor-issues\// }).lean();
    expect(folders.map((f) => f.key)).toEqual([`investor-issues/${issue._id}`]);
    expect(await EvidenceFile.countDocuments({ folder: folders[0]._id })).toBe(2);
  });
});

describe('11.7b: edit details', () => {
  it('assigned Staff changes category and MDAs → saved and returned; unassigned Staff → 403; bad MDA → 400', async () => {
    const issue = await mkIssue({ mdaResponsible: ['BIR'] });
    const res = await update(staffToken, issue._id, { category: 'tax/levies', mdaResponsible: ['TRADE', 'LANDS AND HOUSING'] }).expect(200);
    expect(res.body).toMatchObject({ category: 'tax/levies', mdaResponsible: ['TRADE', 'LANDS AND HOUSING'] });
    const bad = await update(staffToken, issue._id, { mdaResponsible: ['Ministry of Magic'] });
    expect(bad.statusCode).toBe(400);
    const theirs = await mkIssue({ investor: other._id });
    const denied = await update(staffToken, theirs._id, { category: 'tax/levies' });
    expect(denied.statusCode).toBe(403);
    expect((await InvestorIssue.findById(theirs._id).lean()).category).toBe('other');
    expect((await InvestorIssue.findById(issue._id).lean()).mdaResponsible).toEqual(['TRADE', 'LANDS AND HOUSING']);
  });

  it.each([[''], [null]])('reportedVia, project and projectText %p → unset', async (clear) => {
    const issue = await mkIssue({ reportedVia: 'visit', project: project._id, projectText: 'Old text' });
    await update(staffToken, issue._id, { reportedVia: clear, project: clear, projectText: clear }).expect(200);
    const after = await InvestorIssue.findById(issue._id).lean();
    expect(after.reportedVia).toBeUndefined();
    expect(after.project).toBeUndefined();
    expect(after.projectText).toBeUndefined();
  });

  it('a PUT without mdaResponsible succeeds on an issue holding an unknown MDA code', async () => {
    const issue = await mkIssue();
    await InvestorIssue.collection.updateOne({ _id: issue._id }, { $set: { mdaResponsible: ['GONE'] } });
    const res = await update(staffToken, issue._id, { category: 'security' });
    expect(res.statusCode).toBe(200);
    const after = await InvestorIssue.collection.findOne({ _id: issue._id });
    expect(after.category).toBe('security');
    expect(after.mdaResponsible).toEqual(['GONE']);
  });

  it('a field not sent is kept', async () => {
    const issue = await mkIssue({ reportedVia: 'visit', projectText: 'Kept' });
    await update(staffToken, issue._id, { category: 'security' }).expect(200);
    const after = await InvestorIssue.findById(issue._id).lean();
    expect(after).toMatchObject({ reportedVia: 'visit', projectText: 'Kept', category: 'security' });
  });

  it('future dateReported → 400 and unchanged; a past one is saved', async () => {
    const issue = await mkIssue();
    await update(staffToken, issue._id, { dateReported: tomorrow(), category: 'security' }).expect(400);
    const after = await InvestorIssue.findById(issue._id).lean();
    expect(after.dateReported.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(after.category).toBe('other');
    const ok = await update(staffToken, issue._id, { dateReported: '2025-12-31' }).expect(200);
    expect(ok.body.dateReported).toBe('2025-12-31T00:00:00.000Z');
  });

  it('a project of another investor → 400; a project of the same investor is saved', async () => {
    const issue = await mkIssue();
    const otherProject = await InvestmentProject.create({ projectTitle: 'Not theirs', investor: other._id, lifecycleStatus: idea._id });
    await update(staffToken, issue._id, { project: otherProject._id.toString() }).expect(400);
    expect((await InvestorIssue.findById(issue._id).lean()).project).toBeUndefined();
    const ok = await update(staffToken, issue._id, { project: project._id.toString() }).expect(200);
    expect(ok.body.project.projectTitle).toBe('Issue Plant');
  });

  it('the investor never changes', async () => {
    const issue = await mkIssue();
    await update(global.dgToken, issue._id, { investor: other._id.toString(), category: 'security' }).expect(200);
    expect(String((await InvestorIssue.findById(issue._id).lean()).investor)).toBe(String(assigned._id));
  });
});

describe('Investor Directory search', () => {
  const names = async (qs, token = staffToken) => {
    const res = await request(app).get(`/api/investors${qs}`).set('Authorization', bearer(token)).expect(200);
    return res.body.map((i) => i.investorName).sort();
  };

  beforeEach(async () => {
    const lakeside = await Investor.create({
      investorName: 'Lakeside Marine & Tourism Ltd', sector: 'Tourism', countryOfOrigin: 'Nigeria', notes: 'secret cashew notes',
    });
    await InvestmentProject.create({ projectTitle: 'Resort', location: 'Lakeview, Ibadan', investor: lakeside._id, lifecycleStatus: idea._id });
    await Investor.create({
      investorName: 'Nutco Synthetic', sector: 'Agro (cashew processing)', countryOfOrigin: 'Nigeria', organisationType: 'Investor',
    });
    await Investor.create({
      investorName: 'Cashew Brokers', sector: 'Agro', countryOfOrigin: 'Nigeria', organisationType: 'Intermediary', keyContactPerson: 'A. Person',
    });
    await Investor.create({ investorName: 'A.B( Literal', sector: 'Tech', countryOfOrigin: 'NG' });
  });

  it('"Lakeside Marine and Tourism" finds the name with "&"', async () => {
    expect(await names(`?q=${encodeURIComponent('Lakeside Marine and Tourism')}`)).toEqual(['Lakeside Marine & Tourism Ltd']);
    expect(await names(`?q=${encodeURIComponent('lakeside marine & tourism')}`)).toEqual(['Lakeside Marine & Tourism Ltd']);
  });

  it('"lakeview" finds the investor through a project location; project titles too', async () => {
    expect(await names('?q=lakeview')).toEqual(['Lakeside Marine & Tourism Ltd']);
    expect(await names('?q=RESORT')).toEqual(['Lakeside Marine & Tourism Ltd']);
  });

  it('partial, case-insensitive on sector, contact; notes are not searched', async () => {
    expect(await names('?q=cashew')).toEqual(['Cashew Brokers', 'Nutco Synthetic']);
    expect(await names('?q=a%20person')).toEqual(['Cashew Brokers']);
    expect(await names('?q=secret')).toEqual([]);
  });

  it('regex characters are literal: "a.b(" → no 500', async () => {
    expect(await names(`?q=${encodeURIComponent('a.b(')}`)).toEqual(['A.B( Literal']);
    await names(`?q=${encodeURIComponent('.*')}`);
    await names(`?q=${encodeURIComponent('[(')}`);
  });

  it('search + organisationType → intersection; bad filter still 400', async () => {
    expect(await names('?q=cashew&organisationType=Intermediary')).toEqual(['Cashew Brokers']);
    expect(await names('?q=cashew&organisationType=Investor')).toEqual(['Nutco Synthetic']);
    await request(app).get('/api/investors?q=cashew&organisationType=Alien').set('Authorization', bearer(staffToken)).expect(400);
  });

  it('response stays an array; X-Total-Count is the unfiltered total', async () => {
    const res = await request(app).get('/api/investors?q=cashew').set('Authorization', bearer(staffToken)).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(Number(res.headers['x-total-count'])).toBe(await Investor.countDocuments());
  });

  it('a query with nothing searchable ("!!!") matches nothing, with the total header', async () => {
    const res = await request(app).get(`/api/investors?q=${encodeURIComponent('!!!')}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body).toEqual([]);
    expect(Number(res.headers['x-total-count'])).toBe(await Investor.countDocuments());
  });

  it('CORS exposes X-Total-Count to the allowed frontend origin', async () => {
    const res = await request(app).get('/api/investors?q=x').set('Origin', 'http://localhost:5173').set('Authorization', bearer(staffToken)).expect(200);
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Total-Count/);
  });

  it('normalises both sides', () => {
    expect(normaliseSearch('  Lakeside   Marine & Tourism!! ')).toBe('lakeside marine and tourism');
    expect(normaliseSearch('a.b(')).toBe('ab');
    expect(searchPattern('...')).toBeNull();
    expect(new RegExp(searchPattern('o neil'), 'i').test("O'Neil")).toBe(true);
  });
});
