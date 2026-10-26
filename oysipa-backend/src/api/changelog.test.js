// Story 11.10: minimal audit trail. Every create / update the API makes on the
// audited models leaves a ChangeLog row (who, server time, old/new values), and
// DG / Portal-Admin can read the log. Synthetic data and a fake storage provider.
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const Setting = require('../models/Setting');
const ChangeLog = require('../models/ChangeLog');
const documentStorage = require('../services/documentStorage');
const auditPlugin = require('../utils/auditPlugin');
const { runAs } = require('../utils/auditContext');
const { recordChanges } = require('../utils/recordDeletion');

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;
const MISSING_ID = '507f1f77bcf86cd799439011';

let dg;
let staff;
let staffToken;
let investor; // assigned to staff
let other;
let idea;
let review;
let project;
let fake;

const makeFake = () => {
  let n = 0;
  return {
    name: 'fake',
    isConfigured: () => true,
    upload: jest.fn(async () => { n += 1; return { key: `cl-key-${n}`, resourceType: 'raw' }; }),
    signedUrl: jest.fn(async (doc) => `https://signed.example.test/${doc.key}`),
    remove: jest.fn(async () => {}),
  };
};

// Rows written by the API in this test (the seed rows are cleared below).
const rows = (filter = {}) => ChangeLog.find(filter).sort({ createdAt: 1, _id: 1 }).lean();
const ids = (list) => list.map((d) => String(d._id || d));
const fieldsOf = (row) => row.changes.map((c) => c.field).sort();
const change = (row, field) => row.changes.find((c) => c.field === field);

const api = (method, url, token = global.dgToken) => request(app)[method](url).set('Authorization', bearer(token));

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  await Promise.all([
    InvestorIssue.collection.deleteMany({}), InvestmentAnnouncement.collection.deleteMany({}), Setting.collection.deleteMany({}),
  ]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  dg = await User.findOne({ email: 'dg@example.com' });
  staff = await User.create({ name: 'Audit Officer', email: 'audit.officer@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  idea = await LifecycleStatus.findOne({ name: 'Idea' });
  review = await LifecycleStatus.create({ name: 'Review', order: 2 });
  investor = await Investor.create({
    investorName: 'Audit Agro', sector: 'Agro', countryOfOrigin: 'NG', phoneNumber: '0800 000 0001', email: 'audit@example.test', assignedTo: staff._id, leadSource: 'Other',
  });
  other = await Investor.create({ investorName: 'Audit Other', sector: 'Agro', countryOfOrigin: 'NG', leadSource: 'Other' });
  project = await InvestmentProject.create({ projectTitle: 'Audit Mill', investor: investor._id, lifecycleStatus: idea._id });
  // Start every test with an empty log (seed rows above are system rows).
  await ChangeLog.collection.deleteMany({});
  auditPlugin.resetAuditHealth();
});

afterEach(() => {
  documentStorage.__setProviderForTests(null);
  jest.restoreAllMocks();
});

describe('Investors', () => {
  it('phone edit → 1 update row: phoneNumber old → new, by the editor, server time (acceptance)', async () => {
    const before = Date.now();
    await api('put', `/api/investors/${investor._id}`, staffToken).send({ phoneNumber: '0800 000 0002' }).expect(200);
    const list = await rows();
    expect(list).toHaveLength(1);
    const [row] = list;
    expect(row).toMatchObject({
      entity: 'Investor', action: 'update', byName: 'Audit Officer', role: 'Staff', reason: null,
    });
    expect(String(row.by)).toBe(String(staff._id));
    expect(String(row.entityId)).toBe(String(investor._id));
    expect(row.changes).toEqual([{ field: 'phoneNumber', old: '0800 000 0001', new: '0800 000 0002' }]);
    expect(row.snapshot.phoneNumber).toBe('0800 000 0001');
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.batchId).toBeTruthy();

    // The DG sees it as the newest Investor row in the viewer.
    const res = await api('get', '/api/changelog?entity=Investor').expect(200);
    expect(res.body.rows[0]).toMatchObject({
      entity: 'Investor', action: 'update', byName: 'Audit Officer', role: 'Staff', entityId: String(investor._id),
      changes: [{ field: 'phoneNumber', old: '0800 000 0001', new: '0800 000 0002' }],
    });
    expect(res.body.rows[0].createdAt).toBe(row.createdAt.toISOString());
  });

  it('same values → no row', async () => {
    await api('put', `/api/investors/${investor._id}`).send({ phoneNumber: '0800 000 0001', sector: 'Agro', email: 'audit@example.test' }).expect(200);
    expect(await rows()).toHaveLength(0);
  });

  it('blank email ($unset) → update row email old → null', async () => {
    await api('put', `/api/investors/${investor._id}`).send({ email: '' }).expect(200);
    const [row] = await rows();
    expect(row.changes).toEqual([{ field: 'email', old: 'audit@example.test', new: null }]);
    expect(row.byName).toBe('DG User');
  });

  it('create (POST) → 1 create row with the new document', async () => {
    const res = await api('post', '/api/investors').send({
      investorName: 'Audit New Co', sector: 'Agribusiness', countryOfOrigin: 'NG', leadSource: 'Other',
    }).expect(201);
    const list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ entity: 'Investor', action: 'create', byName: 'DG User', role: 'Director-General' });
    expect(String(list[0].entityId)).toBe(res.body._id);
    expect(list[0].snapshot.investorName).toBe('Audit New Co');
    expect(list[0].changes).toBeUndefined();
  });

  it('a refused write (Staff, not assigned) writes no row', async () => {
    await api('put', `/api/investors/${other._id}`, staffToken).send({ phoneNumber: '1' }).expect(403);
    expect(await rows()).toHaveLength(0);
  });

  it('investor delete: the cascade $pull from another investor\'s announcement gets an update row next to the delete rows', async () => {
    const log = await InteractionLog.create({ investor: investor._id, loggedBy: dg._id, description: 'Visit', category: 'Meeting' });
    const otherProject = await InvestmentProject.create({ projectTitle: 'Other Plant', investor: other._id, lifecycleStatus: idea._id });
    const ann = await InvestmentAnnouncement.create({
      project: otherProject._id, announcementDate: new Date('2026-03-01'), outlet: 'Paper', supportingInteractions: [log._id],
    });
    await ChangeLog.collection.deleteMany({});
    await api('delete', `/api/investors/${investor._id}`).send({ reason: 'Duplicate' }).expect(200);
    const update = await rows({ action: 'update' });
    expect(update).toHaveLength(1);
    expect(update[0]).toMatchObject({ entity: 'InvestmentAnnouncement', byName: 'DG User' });
    expect(String(update[0].entityId)).toBe(String(ann._id));
    expect(change(update[0], 'supportingInteractions')).toEqual({ field: 'supportingInteractions', old: [log._id], new: [] });
    expect(await ChangeLog.countDocuments({ action: 'delete' })).toBe(3); // investor, project, log
    // One request, one batchId: the delete rows and the plugin's update row share it.
    expect(new Set((await rows()).map((r) => r.batchId)).size).toBe(1);
  });
});

describe('Projects', () => {
  it('create (POST) → create row', async () => {
    await api('post', `/api/projects/investors/${investor._id}/projects`).send({ projectTitle: 'Audit Kiln', lifecycleStatus: idea._id }).expect(201);
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['create:InvestmentProject']);
  });

  it('PUT status change → update row for the project + create row for the System Update log', async () => {
    await api('put', `/api/projects/${project._id}`).send({ lifecycleStatus: review._id }).expect(200);
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['update:InvestmentProject', 'create:InteractionLog']);
    expect(list[0].changes).toEqual([{ field: 'lifecycleStatus', old: idea._id, new: review._id }]);
    expect(list[1].snapshot.category).toBe('System Update');
    list.forEach((r) => expect(r.byName).toBe('DG User'));
    expect(list[0].batchId).toBe(list[1].batchId);
  });

  it('PUT /:id/status (save) → update row + System Update create row', async () => {
    await api('put', `/api/projects/${project._id}/status`, staffToken).send({ lifecycleStatus: String(review._id) }).expect(200);
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['update:InvestmentProject', 'create:InteractionLog']);
    expect(fieldsOf(list[0])).toEqual(['lifecycleStatus']);
    expect(list[0].byName).toBe('Audit Officer');
  });

  it('project moved → rows for the project and each moved log, issue and announcement', async () => {
    const projectLog = await InteractionLog.create({ project: project._id, loggedBy: dg._id, description: 'Site visit', category: 'Meeting' });
    const investorLog = await InteractionLog.create({ investor: investor._id, loggedBy: dg._id, description: 'Call', category: 'Call' });
    const issue = await InvestorIssue.create({
      investor: investor._id, project: project._id, dateRegistered: new Date(), dateReported: new Date('2026-03-01'), category: 'other', description: 'Synthetic',
    });
    const ann = await InvestmentAnnouncement.create({
      project: project._id, announcementDate: new Date('2026-03-01'), outlet: 'Paper', supportingInteractions: [projectLog._id, investorLog._id],
    });
    await ChangeLog.collection.deleteMany({});

    await api('put', `/api/projects/${project._id}`).send({ investor: String(other._id) }).expect(200);
    const list = await rows();
    const byEntity = (e) => list.filter((r) => r.entity === e);
    expect(byEntity('InvestmentProject')).toHaveLength(1);
    expect(change(byEntity('InvestmentProject')[0], 'investor')).toEqual({ field: 'investor', old: investor._id, new: other._id });
    expect(byEntity('InteractionLog')).toHaveLength(1);
    expect(String(byEntity('InteractionLog')[0].entityId)).toBe(String(projectLog._id));
    expect(byEntity('InteractionLog')[0].changes).toEqual([{ field: 'investor', old: investor._id, new: other._id }]);
    expect(byEntity('InvestorIssue')).toHaveLength(1);
    expect(String(byEntity('InvestorIssue')[0].entityId)).toBe(String(issue._id));
    expect(byEntity('InvestorIssue')[0].changes).toEqual([{ field: 'project', old: project._id, new: null }]);
    expect(byEntity('InvestmentAnnouncement')).toHaveLength(1);
    expect(String(byEntity('InvestmentAnnouncement')[0].entityId)).toBe(String(ann._id));
    expect(byEntity('InvestmentAnnouncement')[0].changes).toEqual([
      { field: 'supportingInteractions', old: [projectLog._id, investorLog._id], new: [projectLog._id] },
    ]);
    list.forEach((r) => expect(r.byName).toBe('DG User'));
  });
});

describe('Interactions', () => {
  it('project interaction (POST) → create row', async () => {
    await api('post', `/api/projects/${project._id}/interactions`, staffToken).send({ description: 'Meeting', category: 'Meeting' }).expect(201);
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}:${r.byName}`)).toEqual(['create:InteractionLog:Audit Officer']);
  });

  it('investor-level interaction (POST) → create row', async () => {
    await api('post', `/api/interactions/investors/${investor._id}`).send({ description: 'Call', category: 'Call', serviceCodes: ['M4'] }).expect(201);
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['create:InteractionLog']);
    expect(list[0].snapshot.serviceCodes).toEqual(['M4']);
  });

  it('Tag services (PATCH) → update row serviceCodes / creditLinkage', async () => {
    const log = await InteractionLog.create({ investor: investor._id, loggedBy: dg._id, description: 'Call', category: 'Call' });
    await ChangeLog.collection.deleteMany({});
    await api('patch', `/api/interactions/${log._id}`, staffToken).send({ serviceCodes: ['I1', 'A2'], creditLinkage: true }).expect(200);
    const [row] = await rows();
    expect(row).toMatchObject({ entity: 'InteractionLog', action: 'update', byName: 'Audit Officer' });
    expect(row.changes).toEqual([
      { field: 'serviceCodes', old: [], new: ['I1', 'A2'] },
      { field: 'creditLinkage', old: false, new: true },
    ]);
  });

  it('document upload ($push) and removal ($pull) → update rows; the viewer never shows the storage key', async () => {
    const log = await InteractionLog.create({ investor: investor._id, loggedBy: dg._id, description: 'Call', category: 'Call' });
    await ChangeLog.collection.deleteMany({});
    const up = await api('post', `/api/interactions/${log._id}/documents`, staffToken)
      .attach('file', Buffer.alloc(1024, 1), { filename: 'scan.pdf', contentType: 'application/pdf' })
      .expect(201);
    let list = await rows();
    expect(list).toHaveLength(1);
    // The actor survives the multipart parser (multer's callback).
    expect(list[0]).toMatchObject({ byName: 'Audit Officer', role: 'Staff' });
    expect(String(list[0].by)).toBe(String(staff._id));
    expect(fieldsOf(list[0])).toEqual(['documents']);
    expect(change(list[0], 'documents').old).toBeNull();
    expect(change(list[0], 'documents').new[0].fileName).toBe('scan.pdf');

    const view = await api('get', `/api/changelog?entityId=${log._id}`).expect(200);
    expect(view.body.rows).toHaveLength(1);
    expect(JSON.stringify(view.body)).not.toContain('cl-key-1');
    expect(view.body.rows[0].changes[0].new[0]).not.toHaveProperty('provider');
    expect(view.body.rows[0]).not.toHaveProperty('snapshot');

    await api('delete', `/api/interactions/${log._id}/documents/${up.body._id}`).send({ reason: 'Wrong file' }).expect(200);
    list = await rows({ action: 'update' });
    expect(list).toHaveLength(2);
    expect(change(list[1], 'documents').new).toEqual([]);
    expect(await ChangeLog.countDocuments({ action: 'delete' })).toBe(1); // the explicit document delete row stays
  });

  it('interaction delete: the cascade $pull from an announcement gets an update row', async () => {
    const log = await InteractionLog.create({ project: project._id, loggedBy: dg._id, description: 'Visit', category: 'Meeting' });
    const ann = await InvestmentAnnouncement.create({
      project: project._id, announcementDate: new Date('2026-03-01'), outlet: 'Paper', supportingInteractions: [log._id],
    });
    await ChangeLog.collection.deleteMany({});
    await api('delete', `/api/interactions/${log._id}`).expect(200);
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['delete:InteractionLog', 'update:InvestmentAnnouncement']);
    expect(String(list[1].entityId)).toBe(String(ann._id));
  });
});

describe('Issues', () => {
  const register = (token, extra = {}) => api('post', '/api/issues', token).send({
    investor: String(investor._id), category: 'land/title', description: 'C of O delayed', ...extra,
  });

  it('register → create row', async () => {
    const res = await register(staffToken).expect(201);
    const list = await rows({ entity: 'InvestorIssue' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ action: 'create', byName: 'Audit Officer' });
    expect(String(list[0].entityId)).toBe(res.body._id);
    expect(list[0].snapshot.reference).toBe(res.body.reference);
  });

  it('resolved with a note → 1 update row: status, resolution, resolvedDate (acceptance)', async () => {
    const created = await register(staffToken).expect(201);
    await ChangeLog.collection.deleteMany({});
    await api('put', `/api/issues/${created.body._id}`, staffToken).send({ status: 'Resolved', resolution: 'C of O issued' }).expect(200);
    const list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ entity: 'InvestorIssue', action: 'update', byName: 'Audit Officer', role: 'Staff' });
    expect(fieldsOf(list[0])).toEqual(['resolution', 'resolvedDate', 'status']);
    expect(change(list[0], 'status')).toEqual({ field: 'status', old: 'Open', new: 'Resolved' });
    expect(change(list[0], 'resolution')).toEqual({ field: 'resolution', old: null, new: 'C of O issued' });
    expect(change(list[0], 'resolvedDate').old).toBeNull();
    expect(change(list[0], 'resolvedDate').new).toBeInstanceOf(Date);
    // The viewer shows who, when and the change.
    const res = await api('get', '/api/changelog?entity=InvestorIssue&action=update').expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0]).toMatchObject({ byName: 'Audit Officer', role: 'Staff' });
    expect(res.body.rows[0].changes.find((c) => c.field === 'status')).toEqual({ field: 'status', old: 'Open', new: 'Resolved' });
  });

  it('PUT with the same values → no row', async () => {
    const created = await register(global.dgToken).expect(201);
    await ChangeLog.collection.deleteMany({});
    await api('put', `/api/issues/${created.body._id}`).send({ category: 'land/title', description: 'C of O delayed' }).expect(200);
    expect(await rows()).toHaveLength(0);
  });

  it('action (updateOne $push) → update row for actions', async () => {
    const created = await register(global.dgToken).expect(201);
    await ChangeLog.collection.deleteMany({});
    await api('post', `/api/issues/${created.body._id}/actions`, staffToken).send({ note: 'Called the ministry' }).expect(201);
    const [row] = await rows();
    expect(row).toMatchObject({ entity: 'InvestorIssue', action: 'update', byName: 'Audit Officer' });
    expect(fieldsOf(row)).toEqual(['actions']);
    expect(change(row, 'actions').old).toEqual([]);
    expect(change(row, 'actions').new[0].note).toBe('Called the ministry');
  });
});

describe('Announcements', () => {
  const valid = (extra = {}) => ({
    project: String(project._id), announcementDate: '2026-04-23', outlet: 'State website', oysipaNamed: false, ...extra,
  });

  it('register → create row; edit (save) → update row oysipaNamed / oysipaRoleText', async () => {
    const created = await api('post', '/api/announcements', staffToken).send(valid()).expect(201);
    let list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['create:InvestmentAnnouncement']);
    await ChangeLog.collection.deleteMany({});
    await api('put', `/api/announcements/${created.body._id}`, staffToken).send({ oysipaNamed: true, oysipaRoleText: 'Facilitated land' }).expect(200);
    list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0].changes).toEqual([
      { field: 'oysipaNamed', old: false, new: true },
      { field: 'oysipaRoleText', old: null, new: 'Facilitated land' },
    ]);
  });

  it('link (updateOne) → update row supportingInteractions old → new; unlink → update row', async () => {
    const ann = await InvestmentAnnouncement.create({ project: project._id, announcementDate: new Date('2026-03-01'), outlet: 'Paper' });
    const log = await InteractionLog.create({ project: project._id, loggedBy: dg._id, description: 'Visit', category: 'Meeting' });
    await ChangeLog.collection.deleteMany({});
    await api('post', `/api/announcements/${ann._id}/interactions`, staffToken).send({ interactions: [String(log._id)] }).expect(200);
    let list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0].changes).toEqual([{ field: 'supportingInteractions', old: [], new: [log._id] }]);
    await api('delete', `/api/announcements/${ann._id}/interactions/${log._id}`, staffToken).expect(200);
    list = await rows();
    expect(list).toHaveLength(2);
    expect(list[1].changes).toEqual([{ field: 'supportingInteractions', old: [log._id], new: [] }]);
  });
});

describe('MoU MDAs setting', () => {
  it('first PUT → create row for Setting mouMdas; the next → update row old → new', async () => {
    await api('put', '/api/mdas/mou').send({ codes: ['BIR', 'TRADE'] }).expect(200);
    let list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ entity: 'Setting', action: 'create', byName: 'DG User' });
    expect(list[0].snapshot).toMatchObject({ key: 'mouMdas', value: ['BIR', 'TRADE'] });
    await api('put', '/api/mdas/mou').set('Authorization', bearer(global.portalAdminToken)).send({ codes: ['BIR'] }).expect(200);
    list = await rows();
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ entity: 'Setting', action: 'update', byName: 'Portal Admin User', role: 'Portal-Admin' });
    expect(change(list[1], 'value')).toEqual({ field: 'value', old: ['BIR', 'TRADE'], new: ['BIR'] });
  });
});

describe('Audit plugin edge cases', () => {
  it('audit write fails → the data is saved, the error is logged and the health count goes up', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit store down'));
    await api('put', `/api/investors/${investor._id}`).send({ phoneNumber: '0800 000 0009' }).expect(200);
    expect((await Investor.findById(investor._id).lean()).phoneNumber).toBe('0800 000 0009');
    expect(errSpy).toHaveBeenCalledWith('[audit] ChangeLog write failed', expect.objectContaining({
      entity: 'Investor', action: 'update', entityId: investor._id, error: expect.any(Error),
    }));
    expect(await rows()).toHaveLength(0);
    const health = await api('get', '/api/changelog/health').expect(200);
    expect(health.body).toMatchObject({ ok: false, failedWrites: 1 });
    expect(health.body.lastFailureAt).toBeTruthy();
  });

  it('no user in context → row with by null and "system (no user context)", and a server warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    auditPlugin.options.warnNoActor = true;
    try {
      const created = await Investor.create({ investorName: 'Audit Script Co', sector: 'Agro', countryOfOrigin: 'NG' });
      const [row] = await rows();
      expect(row).toMatchObject({ action: 'create', by: null, byName: 'system (no user context)', role: null });
      expect(String(row.entityId)).toBe(String(created._id));
      expect(warn).toHaveBeenCalledWith('[audit] write with no user context', expect.objectContaining({ entity: 'Investor', action: 'create' }));
    } finally {
      auditPlugin.options.warnNoActor = false;
    }
  });

  it('a user row needs `by`: only system rows may have a null by', async () => {
    await expect(ChangeLog.create({
      entity: 'Investor', entityId: investor._id, action: 'update', byName: 'Someone', snapshot: {}, batchId: 'b',
    })).rejects.toThrow(/by is required/);
  });

  it('runAs sets the actor, batchId and reason; suppress skips the listed actions', async () => {
    await runAs(dg, async () => {
      await Investor.create({ investorName: 'Audit Run Co', sector: 'Agro', countryOfOrigin: 'NG' });
      await Investor.updateOne({ _id: investor._id }, { $set: { notes: 'Scripted' } }).exec();
    }, { batchId: 'batch-x', reason: 'script: test' });
    await runAs(dg, async () => {
      await Investor.create({ investorName: 'Audit Quiet Co', sector: 'Agro', countryOfOrigin: 'NG' });
    }, { suppress: ['create'] });
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.batchId}:${r.reason}:${r.byName}`)).toEqual([
      'create:batch-x:script: test:DG User',
      'update:batch-x:script: test:DG User',
    ]);
  });

  it('insertMany → a create row per document; updateMany → one row per changed document', async () => {
    await runAs(dg, () => InvestmentProject.insertMany([
      { projectTitle: 'Bulk A', investor: other._id, lifecycleStatus: idea._id },
      { projectTitle: 'Bulk B', investor: other._id, lifecycleStatus: idea._id },
    ]));
    expect((await rows()).map((r) => `${r.action}:${r.entity}`)).toEqual(['create:InvestmentProject', 'create:InvestmentProject']);
    await ChangeLog.collection.deleteMany({});
    await runAs(dg, () => InvestmentProject.updateMany({ investor: other._id }, { $set: { location: 'Ibadan' } }).exec());
    const list = await rows();
    expect(list).toHaveLength(2);
    list.forEach((r) => expect(r.changes).toEqual([{ field: 'location', old: null, new: 'Ibadan' }]));
    // Re-running the same update changes nothing → no rows.
    await ChangeLog.collection.deleteMany({});
    await runAs(dg, () => InvestmentProject.updateMany({ investor: other._id }, { $set: { location: 'Ibadan' } }).exec());
    expect(await rows()).toHaveLength(0);
  });
});

describe('GET /api/changelog (viewer)', () => {
  const insertRows = async (n, extra = {}) => {
    const docs = Array.from({ length: n }, (_, i) => ({
      entity: 'Investor', entityId: investor._id, action: 'update', by: dg._id, byName: 'DG User', role: 'Director-General', snapshot: {}, batchId: `b${i}`, changes: [{ field: 'notes', old: null, new: `n${i}` }], ...extra,
    }));
    for (const d of docs) {
      // eslint-disable-next-line no-await-in-loop
      await ChangeLog.create(d);
    }
  };

  it('Staff → 403 (list and health); no token → 401', async () => {
    await api('get', '/api/changelog', staffToken).expect(403);
    await api('get', '/api/changelog/health', staffToken).expect(403);
    await request(app).get('/api/changelog').expect(401);
  });

  it('Portal-Admin can read it; health is ok with no failures', async () => {
    const res = await api('get', '/api/changelog', global.portalAdminToken).expect(200);
    expect(res.body).toEqual({
      rows: [], total: 0, page: 1, pageSize: 50,
    });
    const health = await api('get', '/api/changelog/health', global.portalAdminToken).expect(200);
    expect(health.body).toEqual({
      ok: true, failedWrites: 0, lastFailureAt: null, lastError: null, sinceRestart: 0,
    });
  });

  it('newest first, 50 per page, with total and page', async () => {
    await insertRows(55);
    const p1 = await api('get', '/api/changelog').expect(200);
    expect(p1.body).toMatchObject({ total: 55, page: 1 });
    expect(p1.body.rows).toHaveLength(50);
    expect(p1.body.rows[0].batchId).toBe('b54');
    const p2 = await api('get', '/api/changelog?page=2').expect(200);
    expect(p2.body.rows).toHaveLength(5);
    expect(p2.body.rows[4].batchId).toBe('b0');
    const p3 = await api('get', '/api/changelog?page=3').expect(200);
    expect(p3.body.rows).toEqual([]);
  });

  it('filters by entity, action, record id and date range (from–to, Lagos days, inclusive)', async () => {
    await insertRows(2);
    await ChangeLog.create({
      entity: 'InvestorIssue', entityId: other._id, action: 'create', by: dg._id, byName: 'DG User', snapshot: {}, batchId: 'iss',
    });
    await ChangeLog.collection.insertOne({
      entity: 'Investor', entityId: other._id, action: 'delete', byName: 'DG User', snapshot: {}, batchId: 'old', createdAt: new Date('2026-01-10T12:00:00.000Z'), updatedAt: new Date('2026-01-10T12:00:00.000Z'),
    });
    expect((await api('get', '/api/changelog?entity=InvestorIssue').expect(200)).body.total).toBe(1);
    expect((await api('get', '/api/changelog?action=update').expect(200)).body.total).toBe(2);
    expect((await api('get', `/api/changelog?entityId=${other._id}`).expect(200)).body.total).toBe(2);
    expect((await api('get', '/api/changelog?entity=Investor&action=delete').expect(200)).body.rows.map((r) => r.batchId)).toEqual(['old']);
    const jan = await api('get', '/api/changelog?from=2026-01-10&to=2026-01-10').expect(200);
    expect(jan.body.rows.map((r) => r.batchId)).toEqual(['old']);
    expect((await api('get', '/api/changelog?from=2026-01-11').expect(200)).body.total).toBe(3);
    expect((await api('get', '/api/changelog?to=2026-01-09').expect(200)).body.total).toBe(0);
  });

  it('bad filters → 400', async () => {
    await api('get', '/api/changelog?entity=User').expect(400);
    await api('get', '/api/changelog?action=edit').expect(400);
    await api('get', '/api/changelog?entityId=nope').expect(400);
    await api('get', '/api/changelog?from=10-01-2026').expect(400);
    await api('get', '/api/changelog?to=2026-02-30').expect(400);
    await api('get', '/api/changelog?from=2026-02-02&to=2026-02-01').expect(400);
    await api('get', '/api/changelog?page=0').expect(400);
    await api('get', '/api/changelog?page=x').expect(400);
  });

  it('no route edits or deletes a row (404)', async () => {
    await insertRows(1);
    const row = await ChangeLog.findOne({}).lean();
    await api('put', `/api/changelog/${row._id}`).send({ reason: 'x' }).expect(404);
    await api('delete', `/api/changelog/${row._id}`).expect(404);
    await api('patch', `/api/changelog/${MISSING_ID}`).send({}).expect(404);
    await api('post', '/api/changelog').send({}).expect(404);
    expect(await ChangeLog.countDocuments()).toBe(1);
  });
});

describe('Review follow-ups (11.10)', () => {
  const storedFailures = async () => {
    const doc = await Setting.collection.findOne({ key: 'auditFailures' });
    return doc && doc.value;
  };

  it.each([
    ['replaceOne', () => Investor.replaceOne({ _id: investor._id }, { investorName: 'X', sector: 'Agro', countryOfOrigin: 'NG' })],
    ['findOneAndReplace', () => Investor.findOneAndReplace({ _id: investor._id }, { investorName: 'X', sector: 'Agro', countryOfOrigin: 'NG' })],
    ['bulkWrite', () => Investor.bulkWrite([{ updateOne: { filter: { _id: investor._id }, update: { $set: { notes: 'x' } } } }])],
    ['bulkSave', async () => { const d = await Investor.findById(investor._id); d.notes = 'x'; return Investor.bulkSave([d]); }],
  ])('%s on an audited model is refused with a clear error; nothing changes', async (_op, op) => {
    await expect(op()).rejects.toThrow(/not audited: use save\/updateOne\/updateMany\/findOneAndUpdate/);
    const after = await Investor.findById(investor._id).lean();
    expect(after.investorName).toBe('Audit Agro');
    expect(after.notes).toBeUndefined();
  });

  it('a failed audit write is recorded with the real action and record id, and stored in Setting auditFailures', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit store down'));
    const res = await api('post', '/api/investors').send({
      investorName: 'Audit Fail Co', sector: 'Agribusiness', countryOfOrigin: 'NG', leadSource: 'Other',
    }).expect(201);
    expect(errSpy).toHaveBeenCalledWith('[audit] ChangeLog write failed', expect.objectContaining({
      entity: 'Investor', action: 'create', entityId: new mongoose.Types.ObjectId(res.body._id),
    }));
    expect(await storedFailures()).toMatchObject({ count: 1, lastError: 'audit store down' });
    // The stored count survives a restart (memory reset).
    auditPlugin.resetAuditHealth();
    const health = await api('get', '/api/changelog/health').expect(200);
    expect(health.body).toMatchObject({
      ok: false, failedWrites: 1, sinceRestart: 0, lastError: 'audit store down',
    });
  });

  it('pre-save re-read returning nothing: the save stands and it is recorded as a failure (action update, record id)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const doc = await Investor.findById(investor._id);
    jest.spyOn(Investor, 'findById').mockReturnValueOnce({ lean: async () => null });
    doc.notes = 'Saved anyway';
    await runAs(dg, () => doc.save());
    expect((await Investor.collection.findOne({ _id: investor._id })).notes).toBe('Saved anyway');
    expect(errSpy).toHaveBeenCalledWith('[audit] ChangeLog write failed', expect.objectContaining({
      entity: 'Investor', action: 'update', entityId: investor._id,
    }));
    expect(await rows()).toHaveLength(0);
    expect((await storedFailures()).count).toBe(1);
  });

  it('a failing query hook is recorded with action update and the query filter', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Investor, 'findById').mockImplementationOnce(() => { throw new Error('re-read failed'); });
    await runAs(dg, () => Investor.findByIdAndUpdate(investor._id, { $set: { notes: 'Q' } }).exec());
    expect((await Investor.collection.findOne({ _id: investor._id })).notes).toBe('Q');
    expect(errSpy).toHaveBeenCalledWith('[audit] ChangeLog write failed', expect.objectContaining({
      entity: 'Investor', action: 'update', entityId: { _id: investor._id },
    }));
  });

  it('updateMany reads only _id and the paths the update touches (snapshot = those paths)', async () => {
    await runAs(dg, () => InvestmentProject.updateMany({ investor: investor._id }, { $set: { location: 'Oyo' } }).exec());
    const [row] = await rows();
    expect(row.changes).toEqual([{ field: 'location', old: null, new: 'Oyo' }]);
    expect(row.snapshot.projectTitle).toBeUndefined();
    // (updatedAt / createdAt come from the timestamps Mongoose adds to the update.)
    expect(Object.keys(row.snapshot).filter((k) => !['updatedAt', 'createdAt'].includes(k)).sort()).toEqual(['_id']);
  });

  it('updateOne applies the query sort when reading the old values', async () => {
    // The test mongod (< 8.0) refuses `sort` on updateOne itself, so this checks
    // the audit pre-read: it must use the same sort (and limit 1).
    const realFind = InvestmentProject.find.bind(InvestmentProject);
    const reads = [];
    jest.spyOn(InvestmentProject, 'find').mockImplementation((...args) => {
      const q = realFind(...args);
      reads.push(q);
      return q;
    });
    await runAs(dg, () => InvestmentProject.updateOne(
      { investor: investor._id }, { $set: { location: 'Sorted' } }, { sort: { projectTitle: -1 } },
    ).exec()).catch(() => {});
    expect(reads.length).toBeGreaterThan(0);
    expect(reads[0].getOptions()).toMatchObject({ sort: { projectTitle: -1 }, limit: 1 });
  });

  it('findOneAndUpdate upsert with new:false still writes a create row', async () => {
    const res = await runAs(dg, () => Setting.findOneAndUpdate(
      { key: 'auditTestKey' }, { $set: { value: [1] } }, { upsert: true, new: false },
    ).exec());
    expect(res).toBeNull();
    const list = await rows();
    expect(list.map((r) => `${r.action}:${r.entity}`)).toEqual(['create:Setting']);
    expect(list[0].snapshot.key).toBe('auditTestKey');
  });

  it('key order in subdocuments is not a change (no row)', async () => {
    expect(auditPlugin.diffDocs({ a: { x: 1, y: [{ p: 1, q: 2 }] } }, { a: { y: [{ q: 2, p: 1 }], x: 1 } })).toEqual([]);
    await Setting.collection.insertOne({ key: 'orderTest', value: { a: 1, b: { c: 2, d: 3 } } });
    await runAs(dg, () => Setting.findOneAndUpdate({ key: 'orderTest' }, { $set: { value: { b: { d: 3, c: 2 }, a: 1 } } }).exec());
    expect(await rows({ entity: 'Setting' })).toHaveLength(0);
  });

  it('recordChanges defaults to the context batchId', async () => {
    const [row] = await runAs(dg, () => recordChanges(dg, 'import', [['Investor', [{ _id: investor._id }]]]), { batchId: 'ctx-batch' });
    expect(row.batchId).toBe('ctx-batch');
  });

  it('viewer: by and batchId filters; record id must be 24 hex', async () => {
    await api('put', `/api/investors/${investor._id}`, staffToken).send({ phoneNumber: '1' }).expect(200);
    await api('put', `/api/investors/${investor._id}`).send({ phoneNumber: '2' }).expect(200);
    const staffRows = await api('get', `/api/changelog?by=${staff._id}`).expect(200);
    expect(staffRows.body.rows.map((r) => r.byName)).toEqual(['Audit Officer']);
    const { batchId } = staffRows.body.rows[0];
    const byBatch = await api('get', `/api/changelog?batchId=${batchId}`).expect(200);
    expect(byBatch.body.total).toBe(1);
    await api('get', '/api/changelog?entityId=abcdefghijkl').expect(400);
    await api('get', '/api/changelog?by=abcdefghijkl').expect(400);
    await api('get', `/api/changelog?batchId=${'x'.repeat(101)}`).expect(400);
  });

  it('viewer: from/to are Lagos days (23:30Z on 9 Jan is 10 Jan in Lagos)', async () => {
    const at = (iso, batchId) => ChangeLog.collection.insertOne({
      entity: 'Investor', entityId: investor._id, action: 'update', byName: 'DG User', snapshot: {}, batchId, createdAt: new Date(iso), updatedAt: new Date(iso),
    });
    await at('2026-01-09T23:30:00.000Z', 'jan10-lagos');
    await at('2026-01-10T23:30:00.000Z', 'jan11-lagos');
    const day = await api('get', '/api/changelog?from=2026-01-10&to=2026-01-10').expect(200);
    expect(day.body.rows.map((r) => r.batchId)).toEqual(['jan10-lagos']);
    const next = await api('get', '/api/changelog?from=2026-01-11&to=2026-01-11').expect(200);
    expect(next.body.rows.map((r) => r.batchId)).toEqual(['jan11-lagos']);
    const before = await api('get', '/api/changelog?to=2026-01-09').expect(200);
    expect(before.body.total).toBe(0);
  });

  it('viewer strips storage internals only inside InteractionLog documents[]', async () => {
    await ChangeLog.create({
      entity: 'Setting', entityId: investor._id, action: 'update', by: dg._id, byName: 'DG User', snapshot: {}, batchId: 'b',
      changes: [{ field: 'value', old: { key: 'k1', provider: 'p' }, new: null }],
    });
    await ChangeLog.create({
      entity: 'InteractionLog', entityId: investor._id, action: 'update', by: dg._id, byName: 'DG User', snapshot: {}, batchId: 'b',
      changes: [{ field: 'documents', old: [], new: [{ fileName: 'a.pdf', key: 'secret', provider: 'fake', resourceType: 'raw' }] }],
    });
    const res = await api('get', '/api/changelog').expect(200);
    const setting = res.body.rows.find((x) => x.entity === 'Setting');
    expect(setting.changes[0].old).toEqual({ key: 'k1', provider: 'p' });
    const log = res.body.rows.find((x) => x.entity === 'InteractionLog');
    expect(log.changes[0].new).toEqual([{ fileName: 'a.pdf' }]);
  });
});
