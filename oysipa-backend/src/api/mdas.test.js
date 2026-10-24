// Story 11.7c: Oyo MDA reference list and the MoU MDAs setting. Synthetic data only.
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Setting = require('../models/Setting');

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;

let staffToken;

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  await Setting.deleteMany({});
  const staff = await User.create({ name: 'Mda Staff', email: 'mda.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
});

const list = (token) => request(app).get('/api/mdas').set('Authorization', bearer(token));
const putMou = (token, body) => request(app).put('/api/mdas/mou').set('Authorization', bearer(token)).send(body);
const mouCodes = (body) => body.filter((m) => m.mou).map((m) => m.code);

describe('GET /api/mdas', () => {
  it('all roles: 64 entries in vlprs order, Other last; default MoU set when nothing is stored', async () => {
    for (const token of [global.dgToken, global.portalAdminToken, staffToken]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await list(token).expect(200);
      expect(res.body).toHaveLength(64);
      expect(res.body[0]).toEqual({
        code: 'OYSHMB', name: 'Oyo State Hospital Management Board', abbreviation: 'OYSHMB', mou: false,
      });
      expect(res.body[63]).toMatchObject({ code: 'OTHER', name: 'Other' });
      expect(mouCodes(res.body).sort()).toEqual(['BIR', 'ENVIRONMENT', 'LANDS AND HOUSING', 'TRADE']);
    }
  });

  it('no token → 401', async () => {
    await request(app).get('/api/mdas').expect(401);
  });
});

describe('PUT /api/mdas/mou', () => {
  it('DG saves exactly the given set (de-duplicated); GET then shows it', async () => {
    const res = await putMou(global.dgToken, { codes: ['TRADE', 'HEALTH', 'TRADE'] }).expect(200);
    expect(mouCodes(res.body).sort()).toEqual(['HEALTH', 'TRADE']);
    expect(mouCodes((await list(staffToken).expect(200)).body).sort()).toEqual(['HEALTH', 'TRADE']);
    const stored = await Setting.findOne({ key: 'mouMdas' }).lean();
    expect(stored.value).toEqual(['TRADE', 'HEALTH']);
    const dg = await User.findOne({ email: 'dg@example.com' });
    expect(String(stored.updatedBy)).toBe(String(dg._id));
    expect(stored.updatedAt).toBeTruthy();
  });

  it('a second PUT updates the same document (one Setting for mouMdas)', async () => {
    await putMou(global.dgToken, { codes: ['TRADE'] }).expect(200);
    const first = await Setting.findOne({ key: 'mouMdas' }).lean();
    await putMou(global.portalAdminToken, { codes: ['HEALTH', 'BIR'] }).expect(200);
    const docs = await Setting.find({ key: 'mouMdas' }).lean();
    expect(docs).toHaveLength(1);
    expect(String(docs[0]._id)).toBe(String(first._id));
    expect(docs[0].value).toEqual(['HEALTH', 'BIR']);
    const pa = await User.findOne({ email: 'pa@example.com' });
    expect(String(docs[0].updatedBy)).toBe(String(pa._id));
  });

  it('Portal-Admin can save a fifth MoU MDA', async () => {
    const codes = ['LANDS AND HOUSING', 'ENVIRONMENT', 'BIR', 'TRADE', 'SURVEYOR GENERAL'];
    await putMou(global.portalAdminToken, { codes }).expect(200);
    expect(mouCodes((await list(global.dgToken)).body).sort()).toEqual([...codes].sort());
  });

  it('an empty list is kept (no MoU MDAs), not the default', async () => {
    await putMou(global.dgToken, { codes: [] }).expect(200);
    expect(mouCodes((await list(global.dgToken)).body)).toEqual([]);
  });

  it('Staff → 403, nothing stored', async () => {
    const res = await putMou(staffToken, { codes: ['TRADE'] }).expect(403);
    expect(res.body).toHaveProperty('msg');
    expect(await Setting.countDocuments()).toBe(0);
  });

  it('bad code, a name or not a list → 400 naming it, nothing stored', async () => {
    const bad = await putMou(global.dgToken, { codes: ['TRADE', 'Ministry of Health'] }).expect(400);
    expect(bad.body.message).toContain('"Ministry of Health"');
    await putMou(global.dgToken, { codes: 'TRADE' }).expect(400);
    await putMou(global.dgToken, {}).expect(400);
    await putMou(global.dgToken, { codes: [{ $gt: '' }] }).expect(400);
    expect(await Setting.countDocuments()).toBe(0);
  });
});
