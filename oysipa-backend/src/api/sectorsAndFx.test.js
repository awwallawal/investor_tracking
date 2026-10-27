// Story 11.14: sector fields, click-through filters and exchange rates.
// Synthetic data only (jest.setup seeds "Test Investor", sector "Tech", and
// status "Idea"; tokens global.dgToken / portalAdminToken).
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const Setting = require('../models/Setting');
const ChangeLog = require('../models/ChangeLog');
const { todayLagos } = require('../utils/happenedDate');

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;
const dayOffset = (days) => new Date(Date.parse(`${todayLagos()}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

let staff;
let staffToken;
let idea;

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  await Setting.collection.deleteMany({});
  staff = await User.create({ name: 'Sector Staff', email: 'sector.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  idea = await LifecycleStatus.findOne({ name: 'Idea' });
});

const newInvestor = (body, token = global.dgToken) => request(app).post('/api/investors').set('Authorization', bearer(token))
  .send({ countryOfOrigin: 'Nigeria', leadSource: 'Other', ...body });

describe('investor sector', () => {
  it('create: a list value and an optional detail are stored', async () => {
    const res = await newInvestor({ investorName: 'Cassava Co', sector: 'Agribusiness', sectorDetail: 'cassava processing' }).expect(201);
    expect(res.body).toMatchObject({ sector: 'Agribusiness', sectorDetail: 'cassava processing' });
    await newInvestor({ investorName: 'Nothing Yet Co', sector: 'Not recorded' }).expect(201);
  });

  it('create: a value not on the list → 400, nothing saved', async () => {
    const res = await newInvestor({ investorName: 'Bad Sector Co', sector: 'Agro' }).expect(400);
    expect(res.body.message).toMatch(/Invalid sector/);
    expect(await Investor.exists({ investorName: 'Bad Sector Co' })).toBeNull();
  });

  it('update: list values only, but an unchanged old value (not migrated yet) is accepted', async () => {
    const id = global.investorId; // seeded with sector "Tech"
    await request(app).put(`/api/investors/${id}`).set('Authorization', bearer(global.dgToken))
      .send({ sector: 'Tech', notes: 'kept' }).expect(200);
    const bad = await request(app).put(`/api/investors/${id}`).set('Authorization', bearer(global.dgToken))
      .send({ sector: 'Finance' }).expect(400);
    expect(bad.body.message).toMatch(/Invalid sector/);
    expect((await Investor.findById(id)).sector).toBe('Tech');
    const ok = await request(app).put(`/api/investors/${id}`).set('Authorization', bearer(global.dgToken))
      .send({ sector: 'Technology and ICT', sectorDetail: 'software' }).expect(200);
    expect(ok.body).toMatchObject({ sector: 'Technology and ICT', sectorDetail: 'software' });
  });
});

describe('project sector', () => {
  const createProject = (investorId, body) => request(app).post(`/api/projects/investors/${investorId}/projects`)
    .set('Authorization', bearer(global.dgToken)).send({ projectTitle: 'Plant', lifecycleStatus: idea._id.toString(), ...body });

  it('no sector sent → the investor\'s sector (an old spelling resolved)', async () => {
    const inv = await Investor.create({ investorName: 'Agro Old', sector: 'Agriculture/Agribusiness', countryOfOrigin: 'NG' });
    const res = await createProject(inv._id).expect(201);
    expect(res.body.sector).toBe('Agribusiness');
    const seeded = await createProject(global.investorId).expect(201); // "Tech"
    expect(seeded.body.sector).toBe('Technology and ICT');
  });

  it('a sent sector wins; a bad sector → 400 and nothing saved', async () => {
    const res = await createProject(global.investorId, { sector: 'Renewable energy', sectorDetail: 'solar' }).expect(201);
    expect(res.body).toMatchObject({ sector: 'Renewable energy', sectorDetail: 'solar' });
    const before = await InvestmentProject.countDocuments();
    const bad = await createProject(global.investorId, { sector: 'Solar' }).expect(400);
    expect(bad.body.message).toMatch(/Invalid sector/);
    expect(await InvestmentProject.countDocuments()).toBe(before);
  });

  it('update can change the sector; a bad one → 400', async () => {
    const id = global.mockProjectId;
    const res = await request(app).put(`/api/projects/${id}`).set('Authorization', bearer(global.dgToken)).send({ sector: 'Healthcare' }).expect(200);
    expect(res.body.sector).toBe('Healthcare');
    await request(app).put(`/api/projects/${id}`).set('Authorization', bearer(global.dgToken)).send({ sector: 'Hospitals' }).expect(400);
    expect((await InvestmentProject.findById(id)).sector).toBe('Healthcare');
  });
});

describe('click-through filters', () => {
  beforeEach(async () => {
    await Investor.create([
      { investorName: 'Agri One', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' },
      { investorName: 'Agri Old', sector: 'Agriculture/Agribusiness', countryOfOrigin: 'Nigeria ' },
      { investorName: 'Unknown Sector', sector: 'Not known', countryOfOrigin: 'Not stated' },
      { investorName: 'Recorded None', sector: 'Not recorded', countryOfOrigin: 'china' },
      { investorName: 'Chinese Co', sector: 'Manufacturing', countryOfOrigin: 'China' },
    ]);
  });
  const names = (res) => res.body.map((i) => i.investorName).sort();
  const get = (qs) => request(app).get(`/api/investors?${qs}`).set('Authorization', bearer(staffToken));

  it('sector=Agribusiness lists those (old spellings included)', async () => {
    expect(names(await get('sector=Agribusiness').expect(200))).toEqual(['Agri Old', 'Agri One']);
  });

  it('sector=Not recorded matches empty or unknown', async () => {
    expect(names(await get(`sector=${encodeURIComponent('Not recorded')}`).expect(200))).toEqual(['Recorded None', 'Unknown Sector']);
  });

  it('"Not recorded" is matched in any case', async () => {
    expect(names(await get('sector=not%20recorded').expect(200))).toEqual(['Recorded None', 'Unknown Sector']);
    expect(names(await get('country=NOT%20RECORDED').expect(200))).toEqual(['Unknown Sector']);
  });

  it('country ignores case and spaces; Not recorded matches "Not stated"', async () => {
    expect(names(await get('country=Nigeria').expect(200))).toEqual(['Agri Old', 'Agri One']);
    expect(names(await get('country=China').expect(200))).toEqual(['Chinese Co', 'Recorded None']);
    expect(names(await get(`country=${encodeURIComponent('Not recorded')}`).expect(200))).toEqual(['Unknown Sector']);
  });

  it('filters combine with each other and with q; a bad sector is ignored (11.15)', async () => {
    expect(names(await get('sector=Manufacturing&country=China').expect(200))).toEqual(['Chinese Co']);
    expect(names(await get('sector=Agribusiness&q=old').expect(200))).toEqual(['Agri Old']);
    expect((await get('sector=Agro').expect(200)).body).toHaveLength(6);
  });

  it('GET /api/projects?sector= filters projects; Not recorded matches none set', async () => {
    const inv = await Investor.findOne({ investorName: 'Agri One' });
    await InvestmentProject.create({ projectTitle: 'Farm', investor: inv._id, lifecycleStatus: idea._id, sector: 'Agribusiness' });
    const agri = await request(app).get('/api/projects?sector=Agribusiness').set('Authorization', bearer(staffToken)).expect(200);
    expect(agri.body.map((p) => p.projectTitle)).toEqual(['Farm']);
    const none = await request(app).get(`/api/projects?sector=${encodeURIComponent('Not recorded')}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(none.body.map((p) => p.projectTitle)).toEqual(['Test Project']);
    // A sector not on the list is ignored (11.15): every project.
    const farming = await request(app).get('/api/projects?sector=Farming').set('Authorization', bearer(staffToken)).expect(200);
    expect(farming.body).toHaveLength(2);
  });
});

describe('GET /api/sectors', () => {
  it('all roles: the list with priority flags', async () => {
    const res = await request(app).get('/api/sectors').set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.sectors).toHaveLength(15);
    expect(res.body.sectors.filter((s) => s.priority)).toHaveLength(6);
    expect(res.body.notRecorded).toBe('Not recorded');
  });
});

describe('exchange rates', () => {
  const post = (body, token = global.dgToken) => request(app).post('/api/fx-rates').set('Authorization', bearer(token)).send(body);
  const rate = (extra) => ({
    currency: 'USD', rate: 1400, asOf: dayOffset(1), source: 'CBN', ...extra,
  });

  it('nothing stored: every currency missing', async () => {
    const res = await request(app).get('/api/fx-rates').set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body).toMatchObject({ latest: {}, missing: ['USD', 'EUR', 'GBP'], stale: [], history: [] });
  });

  it('DG/PA add dated rates; the latest asOf per currency is used; history newest first', async () => {
    await post(rate({ rate: 1300, asOf: dayOffset(10) })).expect(201);
    await post(rate({ rate: 1400, asOf: dayOffset(2) }), global.portalAdminToken).expect(201);
    const res = await post(rate({ rate: 1350, asOf: dayOffset(5) })).expect(201); // older than the latest
    expect(res.body.latest.USD).toMatchObject({ rate: 1400, asOf: dayOffset(2), source: 'CBN', stale: false });
    expect(res.body.history.map((h) => h.rate)).toEqual([1400, 1350, 1300]);
    expect(res.body.missing).toEqual(['EUR', 'GBP']);
  });

  it('two rates saved at the same moment both land', async () => {
    await Promise.all([post(rate({ rate: 1401 })), post(rate({ currency: 'EUR', rate: 1501 })), post(rate({ currency: 'GBP', rate: 1701 }))]);
    const res = await request(app).get('/api/fx-rates').set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.history.map((h) => h.rate).sort()).toEqual([1401, 1501, 1701]);
  });

  it('a rate older than 30 days is flagged out of date', async () => {
    const res = await post(rate({ currency: 'EUR', asOf: dayOffset(40) })).expect(201);
    expect(res.body.latest.EUR).toMatchObject({ stale: true, ageDays: 40 });
    expect(res.body.stale).toEqual(['EUR']);
  });

  it('validation: currency, rate > 0, date not in the future, source required → 400, nothing stored', async () => {
    const tomorrow = new Date(Date.parse(`${todayLagos()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    for (const bad of [
      rate({ currency: 'NGN' }), rate({ rate: 0 }), rate({ rate: -5 }), rate({ rate: 'abc' }),
      rate({ asOf: tomorrow }), rate({ asOf: '' }), rate({ source: '  ' }),
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await post(bad).expect(400);
      expect(res.body.message).toEqual(expect.any(String));
    }
    expect(await Setting.findOne({ key: 'fxRates' })).toBeNull();
  });

  it('Staff cannot add a rate (403); every edit is audited (Setting)', async () => {
    await post(rate(), staffToken).expect(403);
    expect(await Setting.findOne({ key: 'fxRates' })).toBeNull();
    await post(rate()).expect(201);
    await post(rate({ currency: 'GBP', rate: 1700 })).expect(201);
    const rows = await ChangeLog.find({ entity: 'Setting' }).sort({ createdAt: 1 }).lean();
    expect(rows.map((r) => r.action)).toEqual(['create', 'update']);
    expect(rows[1].changes.map((c) => c.field)).toContain('value');
    expect(rows[1].byName).toBe('DG User');
  });
});
