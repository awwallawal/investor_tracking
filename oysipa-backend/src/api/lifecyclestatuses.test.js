const request = require('supertest');
const app = require('../index');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestmentProject = require('../models/InvestmentProject');
const ChangeLog = require('../models/ChangeLog');

// jest.setup.js seeds an 'Idea' status (order 1) used by one project.
const ROLES = [
  ['Director-General', () => global.dgToken],
  ['Portal-Admin', () => global.portalAdminToken],
];

const api = (method, path, token, body) => {
  let r = request(app)[method](path);
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
};

let idea; let planning; let execution;

beforeEach(async () => {
  idea = await LifecycleStatus.findOne({ name: 'Idea' });
  planning = await LifecycleStatus.create({ name: 'Planning', order: 2, description: 'Plan it' });
  execution = await LifecycleStatus.create({ name: 'Execution', order: 3, description: 'Do it' });
  await ChangeLog.collection.deleteMany({});
});

describe('GET /api/lifecycle-statuses', () => {
  it('lists the statuses sorted by order (public)', async () => {
    const res = await api('get', '/api/lifecycle-statuses');
    expect(res.statusCode).toBe(200);
    expect(res.body.map((s) => s.name)).toEqual(['Idea', 'Planning', 'Execution']);
  });
});

describe.each(ROLES)('%s manages lifecycle statuses', (role, token) => {
  it('creates a status with a trimmed name, order = max + 1', async () => {
    const res = await api('post', '/api/lifecycle-statuses', token(), { name: '  Closed  ', description: 'Done', order: 99 });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ name: 'Closed', description: 'Done', order: 4 });
  });

  it('edits the name and description; order in the body is ignored', async () => {
    const res = await api('put', `/api/lifecycle-statuses/${planning._id}`, token(), { name: ' Design ', description: 'New text', order: 42 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ name: 'Design', description: 'New text', order: 2 });
    const stored = await LifecycleStatus.findById(planning._id).lean();
    expect(stored).toMatchObject({ name: 'Design', description: 'New text', order: 2 });
  });

  it('clears the description with an empty string', async () => {
    const res = await api('put', `/api/lifecycle-statuses/${planning._id}`, token(), { name: 'Planning', description: '' });
    expect(res.statusCode).toBe(200);
    expect((await LifecycleStatus.findById(planning._id).lean()).description).toBe('');
  });

  it('deletes a status no project uses', async () => {
    const res = await api('delete', `/api/lifecycle-statuses/${execution._id}`, token());
    expect(res.statusCode).toBe(200);
    expect(await LifecycleStatus.findById(execution._id)).toBeNull();
  });

  it('reorders the statuses', async () => {
    const orderedIds = [execution._id, idea._id, planning._id].map(String);
    const res = await api('put', '/api/lifecycle-statuses/reorder', token(), { orderedIds });
    expect(res.statusCode).toBe(200);
    const list = await api('get', '/api/lifecycle-statuses');
    expect(list.body.map((s) => s._id)).toEqual(orderedIds);
  });
});

describe('create / update validation', () => {
  const pa = () => global.portalAdminToken;

  it.each([[{}], [{ name: '' }], [{ name: '   ' }], [{ name: 7 }]])('create with a missing or blank name → 400 (%j)', async (body) => {
    const res = await api('post', '/api/lifecycle-statuses', pa(), body);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/name/i);
    expect(await LifecycleStatus.countDocuments()).toBe(3);
  });

  it('create with a duplicate name (any case, spaces) → 409', async () => {
    const res = await api('post', '/api/lifecycle-statuses', pa(), { name: ' planning ' });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('A status with this name already exists.');
    expect(await LifecycleStatus.countDocuments()).toBe(3);
  });

  it('create: an E11000 from the unique index → 409', async () => {
    // A race: the name was free at the check, another request took it first.
    const spy = jest.spyOn(LifecycleStatus.prototype, 'save')
      .mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }));
    try {
      const res = await api('post', '/api/lifecycle-statuses', pa(), { name: 'Raced' });
      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('A status with this name already exists.');
    } finally {
      spy.mockRestore();
    }
  });

  it('update with a blank name → 400, unchanged', async () => {
    const res = await api('put', `/api/lifecycle-statuses/${planning._id}`, pa(), { name: '  ' });
    expect(res.statusCode).toBe(400);
    expect((await LifecycleStatus.findById(planning._id).lean()).name).toBe('Planning');
  });

  it('update to another status name (any case) → 409, unchanged', async () => {
    const res = await api('put', `/api/lifecycle-statuses/${planning._id}`, pa(), { name: 'EXECUTION' });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('A status with this name already exists.');
    expect((await LifecycleStatus.findById(planning._id).lean()).name).toBe('Planning');
  });

  it('update can change only the case of its own name', async () => {
    const res = await api('put', `/api/lifecycle-statuses/${planning._id}`, pa(), { name: 'PLANNING' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('PLANNING');
  });

  it('update without a name keeps the name (description only)', async () => {
    const res = await api('put', `/api/lifecycle-statuses/${planning._id}`, pa(), { description: 'Only this' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ name: 'Planning', description: 'Only this' });
  });

  it('update: unknown id → 404, malformed id → 400', async () => {
    const missing = await api('put', '/api/lifecycle-statuses/5f0000000000000000000000', pa(), { name: 'X' });
    expect(missing.statusCode).toBe(404);
    const bad = await api('put', '/api/lifecycle-statuses/not-an-id', pa(), { name: 'X' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('delete', () => {
  const pa = () => global.portalAdminToken;

  it('a status used by projects → 409 with the count, not deleted', async () => {
    const res = await api('delete', `/api/lifecycle-statuses/${idea._id}`, pa());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('This status is used by 1 project(s); move them to another status first.');
    expect(await LifecycleStatus.findById(idea._id)).not.toBeNull();
    expect(await ChangeLog.countDocuments({ entity: 'LifecycleStatus', action: 'delete' })).toBe(0);
  });

  it('unknown id → 404, malformed id → 400', async () => {
    expect((await api('delete', '/api/lifecycle-statuses/5f0000000000000000000000', pa())).statusCode).toBe(404);
    expect((await api('delete', '/api/lifecycle-statuses/not-an-id', pa())).statusCode).toBe(400);
  });

  it('the project count follows the projects', async () => {
    await InvestmentProject.updateMany({}, { $set: { lifecycleStatus: planning._id } });
    const res = await api('delete', `/api/lifecycle-statuses/${planning._id}`, pa());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/used by 1 project/);
    expect((await api('delete', `/api/lifecycle-statuses/${idea._id}`, pa())).statusCode).toBe(200);
  });
});

describe('reorder validation', () => {
  const pa = () => global.portalAdminToken;
  const ids = () => [idea, planning, execution].map((s) => String(s._id));

  it.each([
    ['not an array', () => ({ orderedIds: 'x' })],
    ['missing', () => ({})],
    ['a malformed id', () => ({ orderedIds: [...ids().slice(0, 2), 'nope'] })],
    ['a status left out', () => ({ orderedIds: ids().slice(0, 2) })],
    ['a repeated id', () => ({ orderedIds: [ids()[0], ids()[0], ids()[1]] })],
    ['an unknown id', () => ({ orderedIds: [...ids().slice(0, 2), '5f0000000000000000000000'] })],
    ['an extra id', () => ({ orderedIds: [...ids(), '5f0000000000000000000000'] })],
  ])('%s → 400, order unchanged', async (label, body) => {
    const res = await api('put', '/api/lifecycle-statuses/reorder', pa(), body());
    expect(res.statusCode).toBe(400);
    const list = await api('get', '/api/lifecycle-statuses');
    expect(list.body.map((s) => s.name)).toEqual(['Idea', 'Planning', 'Execution']);
  });

  it('numbers from 1 like create, so a new status goes last', async () => {
    const orderedIds = [execution, planning, idea].map((s) => String(s._id));
    await api('put', '/api/lifecycle-statuses/reorder', pa(), { orderedIds }).expect(200);
    const list = await api('get', '/api/lifecycle-statuses');
    expect(list.body.map((s) => s.order)).toEqual([1, 2, 3]);
    const created = await api('post', '/api/lifecycle-statuses', pa(), { name: 'Last' });
    expect(created.body.order).toBe(4);
  });
});

describe('audit (ChangeLog)', () => {
  const dg = () => global.dgToken;

  it('create and update write rows for the actor', async () => {
    const created = await api('post', '/api/lifecycle-statuses', dg(), { name: 'Audited' });
    expect(created.statusCode).toBe(201);
    await api('put', `/api/lifecycle-statuses/${created.body._id}`, dg(), { description: 'now set' }).expect(200);
    const rows = await ChangeLog.find({ entity: 'LifecycleStatus', entityId: created.body._id }).sort({ createdAt: 1, _id: 1 }).lean();
    expect(rows.map((r) => r.action)).toEqual(['create', 'update']);
    expect(rows[0]).toMatchObject({ byName: 'DG User', role: 'Director-General' });
    expect(rows[1].changes).toEqual([{ field: 'description', old: null, new: 'now set' }]);
  });

  it('delete writes a delete row with the snapshot first', async () => {
    await api('delete', `/api/lifecycle-statuses/${execution._id}`, dg()).expect(200);
    const rows = await ChangeLog.find({ entity: 'LifecycleStatus', action: 'delete' }).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].entityId)).toBe(String(execution._id));
    expect(rows[0]).toMatchObject({ byName: 'DG User', role: 'Director-General' });
    expect(rows[0].snapshot).toMatchObject({ name: 'Execution', order: 3, description: 'Do it' });
  });

  it('delete: audit write failure → 500 and nothing deleted', async () => {
    const spy = jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    try {
      const res = await api('delete', `/api/lifecycle-statuses/${execution._id}`, dg());
      expect(res.statusCode).toBe(500);
      expect(await LifecycleStatus.findById(execution._id)).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
