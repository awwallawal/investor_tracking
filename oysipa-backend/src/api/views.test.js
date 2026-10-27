// Story 11.15: saved views (server-stored per user; DG / Portal-Admin share).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const SavedView = require('../models/SavedView');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

let staffToken;
let otherToken;

beforeEach(async () => {
  await SavedView.deleteMany({});
  const staff = await User.create({ name: 'View Staff', email: 'view.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  const other = await User.create({ name: 'View Other', email: 'view.other@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  otherToken = sign(other);
});

const api = (method, path, token) => request(app)[method](path).set('Authorization', bearer(token));
const list = async (token, name = 'investors') => (await api('get', `/api/views?list=${name}`, token).expect(200)).body;

describe('Saved views', () => {
  it('Staff saves "My agro": only they see it; the query is stored without "?"', async () => {
    const res = await api('post', '/api/views', staffToken).send({ list: 'investors', name: '  My agro ', query: '?sector=Agribusiness&q=agro' }).expect(201);
    expect(res.body).toMatchObject({
      name: 'My agro', query: 'sector=Agribusiness&q=agro', shared: false, mine: true, canEdit: true, canDelete: true, list: 'investors',
    });
    expect(res.body.owner.name).toBe('View Staff');
    expect((await list(staffToken)).map((v) => v.name)).toEqual(['My agro']);
    expect(await list(otherToken)).toEqual([]);
    expect(await list(global.dgToken)).toEqual([]);
    expect(await list(staffToken, 'projects')).toEqual([]);
  });

  it('sharing by Staff → 403 (create and update), nothing shared', async () => {
    const denied = await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'Team', query: 'x=1', shared: true }).expect(403);
    expect(denied.body).toHaveProperty('msg');
    expect(await SavedView.countDocuments()).toBe(0);
    const own = (await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'Mine', query: '' }).expect(201)).body;
    await api('put', `/api/views/${own._id}`, staffToken).send({ shared: true }).expect(403);
    expect((await SavedView.findById(own._id).lean()).shared).toBe(false);
  });

  it('DG shares "Walkthrough": every user sees it; only the owner or DG/PA delete it', async () => {
    const view = (await api('post', '/api/views', global.dgToken).send({ list: 'issues', name: 'Walkthrough', query: 'status=Open', shared: true }).expect(201)).body;
    const seen = await list(staffToken, 'issues');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: 'Walkthrough', shared: true, mine: false, canEdit: false, canDelete: false,
    });
    expect((await list(global.portalAdminToken, 'issues'))[0]).toMatchObject({ canDelete: true, canEdit: false, canShare: true });
    // Staff cannot change or delete it.
    await api('put', `/api/views/${view._id}`, staffToken).send({ name: 'Mine now' }).expect(403);
    await api('delete', `/api/views/${view._id}`, staffToken).expect(403);
    // PA cannot rename it but can unshare it.
    await api('put', `/api/views/${view._id}`, global.portalAdminToken).send({ name: 'Renamed' }).expect(403);
    const unshared = await api('put', `/api/views/${view._id}`, global.portalAdminToken).send({ shared: false }).expect(200);
    expect(unshared.body.shared).toBe(false);
    expect(await list(staffToken, 'issues')).toEqual([]);
    // Back to shared by the owner; PA deletes it.
    await api('put', `/api/views/${view._id}`, global.dgToken).send({ shared: true, name: 'Walkthrough 2' }).expect(200);
    await api('delete', `/api/views/${view._id}`, global.portalAdminToken).expect(200);
    expect(await SavedView.countDocuments()).toBe(0);
  });

  it('owner edits and deletes; another user\'s unshared view is not found', async () => {
    const view = (await api('post', '/api/views', staffToken).send({ list: 'projects', name: 'Valued', query: 'hasValue=1' }).expect(201)).body;
    const res = await api('put', `/api/views/${view._id}`, staffToken).send({ name: 'With value', query: 'hasValue=1&sort=-value' }).expect(200);
    expect(res.body).toMatchObject({ name: 'With value', query: 'hasValue=1&sort=-value' });
    await api('put', `/api/views/${view._id}`, otherToken).send({ name: 'x' }).expect(404);
    await api('delete', `/api/views/${view._id}`, otherToken).expect(404);
    await api('delete', `/api/views/${view._id}`, global.dgToken).expect(404);
    await api('delete', `/api/views/${view._id}`, staffToken).expect(200);
    await api('delete', `/api/views/${view._id}`, staffToken).expect(404);
    await api('delete', '/api/views/nope', staffToken).expect(404);
  });

  it('validation: list, name and query; mine listed before shared', async () => {
    await api('get', '/api/views', staffToken).expect(400);
    await api('get', '/api/views?list=users', staffToken).expect(400);
    await api('post', '/api/views', staffToken).send({ list: 'nope', name: 'x' }).expect(400);
    await api('post', '/api/views', staffToken).send({ list: 'investors', name: '   ' }).expect(400);
    await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'x'.repeat(81) }).expect(400);
    await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'Long', query: 'q='.repeat(1001) }).expect(400);
    await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'Bad', shared: 'yes' }).expect(400);
    await api('post', '/api/views', staffToken).send({ $set: { shared: true } }).expect(400);
    await api('post', '/api/views', global.dgToken).send({ list: 'investors', name: 'A shared', query: '', shared: true }).expect(201);
    await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'Z mine', query: '' }).expect(201);
    expect((await list(staffToken)).map((v) => v.name)).toEqual(['Z mine', 'A shared']);
  });

  it('change log views: Staff → 403 (GET and POST); DG/PA allowed', async () => {
    expect((await api('get', '/api/views?list=changelog', staffToken).expect(403)).body).toHaveProperty('msg');
    await api('post', '/api/views', staffToken).send({ list: 'changelog', name: 'Audit', query: 'entity=Investor' }).expect(403);
    expect(await SavedView.countDocuments()).toBe(0);
    await api('post', '/api/views', global.dgToken).send({ list: 'changelog', name: 'Audit', query: 'entity=Investor' }).expect(201);
    expect(await list(global.portalAdminToken, 'changelog')).toEqual([]);
    expect(await list(global.dgToken, 'changelog')).toHaveLength(1);
  });

  it('at most 50 views per list per user → 400', async () => {
    const staffUser = await User.findOne({ email: 'view.staff@example.com' });
    await SavedView.insertMany(Array.from({ length: 50 }, (_, i) => ({
      owner: staffUser._id, list: 'investors', name: `View ${i}`, query: '',
    })));
    const res = await api('post', '/api/views', staffToken).send({ list: 'investors', name: 'One more', query: '' }).expect(400);
    expect(res.body.message).toMatch(/at most 50/);
    // Another list is still open.
    await api('post', '/api/views', staffToken).send({ list: 'projects', name: 'One more', query: '' }).expect(201);
  });

  it('canEdit / canShare / canDelete say exactly what PUT / DELETE allow (incl. a demoted owner)', async () => {
    const view = (await api('post', '/api/views', global.dgToken).send({ list: 'projects', name: 'Board', query: 'hasValue=1', shared: true }).expect(201)).body;
    expect(view).toMatchObject({ canEdit: true, canShare: true, canDelete: true });
    // PA: may unshare / delete, not rename.
    const asPa = (await list(global.portalAdminToken, 'projects'))[0];
    expect(asPa).toMatchObject({ canEdit: false, canShare: true, canDelete: true });
    await api('put', `/api/views/${view._id}`, global.portalAdminToken).send({ name: 'x' }).expect(403);
    // Staff: nothing.
    const asStaff = (await list(staffToken, 'projects'))[0];
    expect(asStaff).toMatchObject({ canEdit: false, canShare: false, canDelete: false });
    await api('put', `/api/views/${view._id}`, staffToken).send({ shared: false }).expect(403);
    await api('put', `/api/views/${view._id}`, staffToken).send({}).expect(403);

    // The DG owner is demoted to Staff: their shared view can no longer be
    // edited or reshared by them, only deleted.
    const dgUser = await User.findOne({ email: 'dg@example.com' });
    await User.updateOne({ _id: dgUser._id }, { $set: { role: 'Staff' } });
    const asDemoted = (await list(global.dgToken, 'projects'))[0];
    expect(asDemoted).toMatchObject({ mine: true, canEdit: false, canShare: false, canDelete: true });
    await api('put', `/api/views/${view._id}`, global.dgToken).send({ name: 'Mine still' }).expect(403);
    await api('put', `/api/views/${view._id}`, global.dgToken).send({ shared: false }).expect(403);
    // Sending the current value changes nothing (a Staff owner's unshared view).
    const own = (await api('post', '/api/views', staffToken).send({ list: 'projects', name: 'Own', query: '' }).expect(201)).body;
    expect(own).toMatchObject({ canEdit: true, canShare: false, canDelete: true });
    await api('put', `/api/views/${own._id}`, staffToken).send({ name: 'Own 2', shared: false }).expect(200);
    await api('delete', `/api/views/${view._id}`, global.dgToken).expect(200);
  });
});
