// Delete investors (cascade) and interactions, DG/Admin only, with ChangeLog rows.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const ChangeLog = require('../models/ChangeLog');

const MISSING_ID = '507f1f77bcf86cd799439011';
const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

let staffToken;
let staff;
let target; // investor to delete
let projects;
let projectLogs;
let investorLog;

const counts = async () => ({
  investors: await Investor.countDocuments(),
  projects: await InvestmentProject.countDocuments(),
  logs: await InteractionLog.countDocuments(),
  changeLog: await ChangeLog.countDocuments(),
});

beforeEach(async () => {
  // jest.setup.js (which already checked the DB is a disposable test DB) does not
  // clear ChangeLog, and the model refuses deleteMany, so clear it via the driver.
  await ChangeLog.collection.deleteMany({});
  staff = await User.create({ name: 'Desk Officer', email: 'desk.del@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });

  target = await Investor.create({ investorName: 'Duplicate Co', sector: 'Agro', countryOfOrigin: 'NG', assignedTo: staff._id });
  projects = [
    await InvestmentProject.create({ projectTitle: 'Dup A', investor: target._id, lifecycleStatus: idea._id }),
    await InvestmentProject.create({ projectTitle: 'Dup B', investor: target._id, lifecycleStatus: idea._id }),
  ];
  const mkLog = (fields) => InteractionLog.create({ loggedBy: staff._id, description: 'Meeting', category: 'Meeting', ...fields });
  projectLogs = [
    await mkLog({ project: projects[0]._id }),
    await mkLog({ project: projects[0]._id }),
    await mkLog({ project: projects[1]._id }),
  ];
  // An old project log without `investor` (pre-migration) is still found via its project.
  await InteractionLog.collection.updateOne({ _id: projectLogs[2]._id }, { $unset: { investor: '' } });
  investorLog = await mkLog({ investor: target._id, serviceCodes: ['M4'] });

  // A bystander log on the global seed project; it must survive.
  await mkLog({ project: global.mockProjectId });
});

describe('DELETE /api/investors/:id', () => {
  it('DG deletes investor, 2 projects, 4 interactions; 7 ChangeLog rows with one batchId', async () => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/investors/${target._id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ reason: '  Duplicate record ' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: { investors: 1, projects: 2, interactions: 4 } });

    expect(await Investor.exists({ _id: target._id })).toBeNull();
    expect(await InvestmentProject.countDocuments({ investor: target._id })).toBe(0);
    const goneLogIds = [...projectLogs, investorLog].map((l) => l._id);
    expect(await InteractionLog.countDocuments({ _id: { $in: goneLogIds } })).toBe(0);

    const after = await counts();
    expect(after.investors).toBe(before.investors - 1);
    expect(after.projects).toBe(before.projects - 2);
    expect(after.logs).toBe(before.logs - 4);
    // The bystander's investor, project and log are untouched.
    expect(await Investor.exists({ _id: global.investorId })).not.toBeNull();
    expect(await InvestmentProject.exists({ _id: global.mockProjectId })).not.toBeNull();
    expect(await InteractionLog.countDocuments({ project: global.mockProjectId })).toBe(1);

    const rows = await ChangeLog.find({}).lean();
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
    const dg = await User.findOne({ role: 'Director-General' });
    rows.forEach((r) => {
      expect(r.action).toBe('delete');
      expect(r.reason).toBe('Duplicate record');
      expect(r.role).toBe('Director-General');
      expect(r.byName).toBe('DG User');
      expect(String(r.by)).toBe(String(dg._id));
      expect(r.createdAt).toBeInstanceOf(Date);
      expect(String(r.snapshot._id)).toBe(String(r.entityId));
    });
    const byEntity = (e) => rows.filter((r) => r.entity === e);
    expect(byEntity('Investor')).toHaveLength(1);
    expect(byEntity('Investor')[0].snapshot.investorName).toBe('Duplicate Co');
    expect(byEntity('InvestmentProject')).toHaveLength(2);
    expect(byEntity('InteractionLog')).toHaveLength(4);
    const m4 = byEntity('InteractionLog').find((r) => String(r.entityId) === String(investorLog._id));
    expect(m4.snapshot.serviceCodes).toEqual(['M4']);
  });

  it('Portal-Admin can delete too', async () => {
    const res = await request(app)
      .delete(`/api/investors/${target._id}`)
      .set('Authorization', bearer(global.portalAdminToken))
      .send({ reason: 'Test record' });
    expect(res.statusCode).toBe(200);
    const rows = await ChangeLog.find({}).lean();
    expect(rows.length).toBe(7);
    expect(rows.every((r) => r.role === 'Portal-Admin' && r.byName === 'Portal Admin User')).toBe(true);
  });

  it.each([
    ['no body', undefined],
    ['empty body', {}],
    ['blank reason', { reason: '   ' }],
    ['non-string reason', { reason: 42 }],
  ])('reason missing (%s) → 400, nothing deleted, no ChangeLog row', async (_label, body) => {
    const before = await counts();
    let r = request(app).delete(`/api/investors/${target._id}`).set('Authorization', bearer(global.dgToken));
    if (body !== undefined) r = r.send(body);
    const res = await r;
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(await counts()).toEqual(before);
  });

  it('Staff (even assigned) → 403, nothing deleted, no ChangeLog row', async () => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/investors/${target._id}`)
      .set('Authorization', bearer(staffToken))
      .send({ reason: 'Duplicate record' });
    expect(res.statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });

  it.each([['unknown', MISSING_ID], ['malformed', 'not-an-id']])('%s id → 404 { message }, no ChangeLog row', async (_l, id) => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/investors/${id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ reason: 'Duplicate record' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message');
    expect(await counts()).toEqual(before);
  });

  it('audit write fails → 500, nothing deleted', async () => {
    const spy = jest.spyOn(ChangeLog, 'insertMany').mockRejectedValue(new Error('audit down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const before = await counts();
      const res = await request(app)
        .delete(`/api/investors/${target._id}`)
        .set('Authorization', bearer(global.dgToken))
        .send({ reason: 'Duplicate record' });
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message');
      expect(await counts()).toEqual(before);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

describe('DELETE /api/interactions/:id', () => {
  it('Admin deletes one log (no body) → 200; 1 ChangeLog row, reason null', async () => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/interactions/${investorLog._id}`)
      .set('Authorization', bearer(global.portalAdminToken));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: { interactions: 1 } });
    expect(await InteractionLog.exists({ _id: investorLog._id })).toBeNull();
    const after = await counts();
    expect(after.logs).toBe(before.logs - 1);
    expect(after.investors).toBe(before.investors);
    expect(after.projects).toBe(before.projects);
    const rows = await ChangeLog.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'InteractionLog', action: 'delete', reason: null, role: 'Portal-Admin', byName: 'Portal Admin User' });
    expect(String(rows[0].entityId)).toBe(String(investorLog._id));
    expect(rows[0].snapshot.description).toBe('Meeting');
    expect(rows[0].batchId).toEqual(expect.any(String));
  });

  it('DG with an optional reason → stored trimmed', async () => {
    await request(app)
      .delete(`/api/interactions/${projectLogs[0]._id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ reason: ' Logged twice ' })
      .expect(200);
    const row = await ChangeLog.findOne({ entityId: projectLogs[0]._id }).lean();
    expect(row.reason).toBe('Logged twice');
    expect(row.role).toBe('Director-General');
  });

  it('non-string reason → 400 { message }, log kept, no ChangeLog row', async () => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/interactions/${investorLog._id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ reason: 42 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(await counts()).toEqual(before);
    expect(await InteractionLog.exists({ _id: investorLog._id })).not.toBeNull();
  });

  it('blank reason → 200, ChangeLog reason null', async () => {
    await request(app)
      .delete(`/api/interactions/${investorLog._id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ reason: '   ' })
      .expect(200);
    const row = await ChangeLog.findOne({ entityId: investorLog._id }).lean();
    expect(row.reason).toBeNull();
  });

  it('Staff → 403, log kept, no ChangeLog row', async () => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/interactions/${investorLog._id}`)
      .set('Authorization', bearer(staffToken));
    expect(res.statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });

  it.each([['unknown', MISSING_ID], ['malformed', 'not-an-id']])('%s id → 404 { message }, no ChangeLog row', async (_l, id) => {
    const before = await counts();
    const res = await request(app)
      .delete(`/api/interactions/${id}`)
      .set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message');
    expect(await counts()).toEqual(before);
  });

  it('audit write fails → 500, log kept', async () => {
    const spy = jest.spyOn(ChangeLog, 'insertMany').mockRejectedValue(new Error('audit down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const before = await counts();
      const res = await request(app)
        .delete(`/api/interactions/${investorLog._id}`)
        .set('Authorization', bearer(global.dgToken));
      expect(res.statusCode).toBe(500);
      expect(await counts()).toEqual(before);
      expect(await InteractionLog.exists({ _id: investorLog._id })).not.toBeNull();
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

describe('ChangeLog is append-only', () => {
  let row;
  beforeEach(async () => {
    await request(app)
      .delete(`/api/interactions/${investorLog._id}`)
      .set('Authorization', bearer(global.dgToken))
      .expect(200);
    row = await ChangeLog.findOne({ entityId: investorLog._id });
  });

  it.each([
    ['updateOne', () => ChangeLog.updateOne({ _id: row._id }, { reason: 'x' })],
    ['updateMany', () => ChangeLog.updateMany({}, { reason: 'x' })],
    ['findOneAndUpdate', () => ChangeLog.findOneAndUpdate({ _id: row._id }, { reason: 'x' })],
    ['findByIdAndUpdate', () => ChangeLog.findByIdAndUpdate(row._id, { reason: 'x' })],
    ['replaceOne', () => ChangeLog.replaceOne({ _id: row._id }, { reason: 'x' })],
    ['findOneAndReplace', () => ChangeLog.findOneAndReplace({ _id: row._id }, { reason: 'x' })],
    ['bulkWrite (deleteOne op)', () => ChangeLog.bulkWrite([{ deleteOne: { filter: { _id: row._id } } }])],
    ['deleteOne', () => ChangeLog.deleteOne({ _id: row._id })],
    ['deleteMany', () => ChangeLog.deleteMany({})],
    ['findOneAndDelete', () => ChangeLog.findOneAndDelete({ _id: row._id })],
    ['findByIdAndDelete', () => ChangeLog.findByIdAndDelete(row._id)],
    ['doc.deleteOne', () => row.deleteOne()],
    ['doc.save (changed)', () => { row.reason = 'x'; return row.save(); }],
  ])('%s is refused and the row is unchanged', async (_op, op) => {
    await expect(op()).rejects.toThrow(ChangeLog.APPEND_ONLY_MSG);
    const after = await ChangeLog.findById(row._id).lean();
    expect(after).not.toBeNull();
    expect(after.reason).toBeNull();
    expect(await ChangeLog.countDocuments()).toBe(1);
  });

  it('no API route updates or deletes ChangeLog rows', async () => {
    const r1 = await request(app).delete(`/api/changelog/${row._id}`).set('Authorization', bearer(global.dgToken));
    const r2 = await request(app).put(`/api/changelog/${row._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' });
    expect(r1.statusCode).toBe(404);
    expect(r2.statusCode).toBe(404);
  });
});
