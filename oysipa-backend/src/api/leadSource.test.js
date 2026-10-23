// Story 11.5: lead source (T11), organisation type, referredBy, notes/website/
// head office, email check, directory filters, dashboard count, project currency.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const LifecycleStatus = require('../models/LifecycleStatusModel');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

let staff;
let staffToken;
const base = { sector: 'Agribusiness', countryOfOrigin: 'Nigeria' };
const post = (token, body) => request(app).post('/api/investors').set('Authorization', bearer(token)).send(body);
const put = (token, id, body) => request(app).put(`/api/investors/${id}`).set('Authorization', bearer(token)).send(body);

beforeEach(async () => {
  staff = await User.create({ name: 'Lead Staff', email: 'lead.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
});

describe('New-investor rules', () => {
  it('lead source is required → 400, nothing saved', async () => {
    const before = await Investor.countDocuments();
    const res = await post(staffToken, { investorName: 'No Lead', ...base });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Lead source is required/);
    expect(await Investor.countDocuments()).toBe(before);
  });

  it('"Unknown (pre-T11)" and unknown values cannot be chosen', async () => {
    let res = await post(global.dgToken, { investorName: 'Unknown Lead', ...base, leadSource: 'Unknown (pre-T11)' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot be chosen/);
    res = await post(global.dgToken, { investorName: 'Bad Lead', ...base, leadSource: 'Gossip' });
    expect(res.statusCode).toBe(400);
    expect(await Investor.exists({ investorName: { $in: ['Unknown Lead', 'Bad Lead'] } })).toBeNull();
  });

  it('creates with lead source, detail, type, notes, website, head office; default type Investor', async () => {
    const res = await post(staffToken, {
      investorName: 'Lead Co', ...base, leadSource: 'Business event or conference', leadSourceDetail: 'Synthetic forum', notes: 'n', website: 'https://lead.example.test', headOffice: 'Ibadan', importBatchId: 'client', importTags: ['x'],
    }).expect(201);
    expect(res.body).toMatchObject({
      leadSource: 'Business event or conference', leadSourceDetail: 'Synthetic forum', organisationType: 'Investor', notes: 'n', website: 'https://lead.example.test', headOffice: 'Ibadan',
    });
    expect(res.body.importBatchId).toBeUndefined();
    expect(res.body.importTags).toBeUndefined();
  });

  it('referredBy must be an Intermediary, and is kept only for "Intermediary referral"', async () => {
    const nipc = await post(global.dgToken, { investorName: 'NIPC Synthetic', ...base, leadSource: 'Other', organisationType: 'Intermediary' }).expect(201);
    const plain = await post(global.dgToken, { investorName: 'Plain Investor', ...base, leadSource: 'Other' }).expect(201);

    let res = await post(staffToken, { investorName: 'Bad Ref', ...base, leadSource: 'Intermediary referral', referredBy: plain.body._id });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Intermediary/);
    res = await post(staffToken, { investorName: 'Bad Ref 2', ...base, leadSource: 'Intermediary referral', referredBy: 'nope' });
    expect(res.statusCode).toBe(400);

    res = await post(staffToken, { investorName: 'Referred Co', ...base, leadSource: 'Intermediary referral', referredBy: nipc.body._id }).expect(201);
    expect(String(res.body.referredBy)).toBe(nipc.body._id);
    const one = await request(app).get(`/api/investors/${res.body._id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(one.body.referredBy).toMatchObject({ investorName: 'NIPC Synthetic', organisationType: 'Intermediary' });

    res = await post(staffToken, { investorName: 'Not Referred', ...base, leadSource: 'Other', referredBy: nipc.body._id }).expect(201);
    expect(res.body.referredBy).toBeUndefined();
  });

  it('duplicate name or email → clear 400', async () => {
    await post(global.dgToken, { investorName: 'Dup Co', ...base, leadSource: 'Other', email: 'dup@example.test' }).expect(201);
    let res = await post(global.dgToken, { investorName: 'Dup Co', ...base, leadSource: 'Other' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/name already exists/);
    res = await post(global.dgToken, { investorName: 'Dup Co 2', ...base, leadSource: 'Other', email: 'dup@example.test' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/email/);
  });

  it('email check accepts long endings such as .africa and rejects junk', async () => {
    await post(global.dgToken, { investorName: 'Africa Co', ...base, leadSource: 'Other', email: 'someone@codesign.africa' }).expect(201);
    const res = await post(global.dgToken, { investorName: 'Junk Co', ...base, leadSource: 'Other', email: 'not an email' });
    expect(res.statusCode).toBe(400);
  });
});

describe('Editing lead source', () => {
  let inv;
  beforeEach(async () => {
    inv = await Investor.create({ investorName: 'Edit Co', ...base, leadSource: 'Other', assignedTo: staff._id });
  });

  it('Staff cannot change leadSource (ignored); other fields still update', async () => {
    await put(staffToken, inv._id, { leadSource: 'Media campaign or advertising', notes: 'Staff note', website: 'w', headOffice: 'h' }).expect(200);
    const after = await Investor.findById(inv._id).lean();
    expect(after.leadSource).toBe('Other');
    expect(after).toMatchObject({ notes: 'Staff note', website: 'w', headOffice: 'h' });
  });

  it('DG and Portal-Admin can correct leadSource', async () => {
    await put(global.dgToken, inv._id, { leadSource: 'Media campaign or advertising' }).expect(200);
    expect((await Investor.findById(inv._id)).leadSource).toBe('Media campaign or advertising');
    await put(global.portalAdminToken, inv._id, { leadSource: 'Existing investor referral' }).expect(200);
    expect((await Investor.findById(inv._id)).leadSource).toBe('Existing investor referral');
  });
});

describe('Directory filters', () => {
  beforeEach(async () => {
    await Investor.create({ investorName: 'Inter A', ...base, leadSource: 'Other', organisationType: 'Intermediary' });
    await Investor.create({ investorName: 'Media B', ...base, leadSource: 'Media campaign or advertising' });
    await Investor.collection.insertOne({ investorName: 'Old C', ...base }); // pre-migration: no type, no lead source
  });
  const names = async (qs) => (await request(app).get(`/api/investors${qs}`).set('Authorization', bearer(staffToken)).expect(200)).body.map((i) => i.investorName).sort();

  it('filters by organisation type and lead source', async () => {
    expect(await names('?organisationType=Intermediary')).toEqual(['Inter A']);
    expect(await names('?organisationType=Investor')).toEqual(['Media B', 'Old C', 'Test Investor']);
    expect(await names('?leadSource=Media%20campaign%20or%20advertising')).toEqual(['Media B']);
    expect(await names(`?leadSource=${encodeURIComponent('Unknown (pre-T11)')}`)).toEqual(['Old C', 'Test Investor']);
    expect(await names('?leadSource=Other&organisationType=Intermediary')).toEqual(['Inter A']);
    expect(await names('')).toHaveLength(4);
  });

  it('bad filter value → 400', async () => {
    await request(app).get('/api/investors?organisationType=Alien').set('Authorization', bearer(staffToken)).expect(400);
  });
});

describe('Dashboard investor count', () => {
  it('counts only organisation type Investor (or none set): NIPC is not counted', async () => {
    const nipc = await post(global.dgToken, { investorName: 'NIPC', ...base, leadSource: 'Other', organisationType: 'Intermediary' }).expect(201);
    await post(global.dgToken, { investorName: 'Referred By NIPC', ...base, leadSource: 'Intermediary referral', referredBy: nipc.body._id }).expect(201);
    await Investor.create({ investorName: 'Agent X', ...base, organisationType: 'Promotion agent' });
    await Investor.create({ investorName: 'Contact Y', ...base, organisationType: 'Contact' });
    await Investor.collection.insertOne({ investorName: 'Old Z', ...base });
    const res = await request(app).get('/api/admin/dashboard-kpis').set('Authorization', bearer(global.dgToken)).expect(200);
    // Test Investor (seed) + Referred By NIPC + Old Z.
    expect(res.body.totalInvestors).toBe(3);
  });
});

describe('Project currency', () => {
  it('defaults to NGN and stores USD', async () => {
    const idea = await LifecycleStatus.findOne({ name: 'Idea' });
    const url = `/api/projects/investors/${global.investorId}/projects`;
    const ngn = await request(app).post(url).set('Authorization', bearer(global.dgToken)).send({ projectTitle: 'Naira', lifecycleStatus: idea._id, estimatedValue: 2500000000 }).expect(201);
    expect(ngn.body.currency).toBe('NGN');
    const usd = await request(app).post(url).set('Authorization', bearer(global.dgToken)).send({ projectTitle: 'Dollar', lifecycleStatus: idea._id, estimatedValue: 10000000, currency: 'USD' }).expect(201);
    expect(usd.body.currency).toBe('USD');
    expect((await InvestmentProject.findById(usd.body._id)).estimatedValue).toBe(10000000);
    await request(app).post(url).set('Authorization', bearer(global.dgToken)).send({ projectTitle: 'Bad', lifecycleStatus: idea._id, currency: 'BTC' }).expect(400);
  });

  it('client-sent importBatchId/importTags are ignored on project create and update', async () => {
    const idea = await LifecycleStatus.findOne({ name: 'Idea' });
    const url = `/api/projects/investors/${global.investorId}/projects`;
    const res = await request(app).post(url).set('Authorization', bearer(global.dgToken))
      .send({ projectTitle: 'Stamped', lifecycleStatus: idea._id, importBatchId: 'client', importTags: ['x'] }).expect(201);
    await request(app).put(`/api/projects/${res.body._id}`).set('Authorization', bearer(global.dgToken))
      .send({ projectTitle: 'Stamped 2', importBatchId: 'client2', importTags: ['y'] }).expect(200);
    const saved = await InvestmentProject.findById(res.body._id).lean();
    expect(saved.projectTitle).toBe('Stamped 2');
    expect(saved.importBatchId).toBeUndefined();
    expect(saved.importTags).toBeUndefined();
  });
});

describe('Editing referredBy', () => {
  let nipc;
  let plain;
  let inv;
  beforeEach(async () => {
    nipc = await Investor.create({ investorName: 'NIPC Ref', ...base, leadSource: 'Other', organisationType: 'Intermediary' });
    plain = await Investor.create({ investorName: 'Plain Ref', ...base, leadSource: 'Other' });
    inv = await Investor.create({
      investorName: 'Referred Edit Co', ...base, leadSource: 'Intermediary referral', referredBy: nipc._id, assignedTo: staff._id,
    });
  });
  const stored = async () => (await Investor.findById(inv._id).lean()).referredBy;

  it('re-sending the populated referredBy object → 200, kept', async () => {
    await put(global.dgToken, inv._id, {
      leadSource: 'Intermediary referral', referredBy: { _id: String(nipc._id), investorName: 'NIPC Ref' }, notes: 'x',
    }).expect(200);
    expect(String(await stored())).toBe(String(nipc._id));
  });

  it('a non-Intermediary id → 400, stored value unchanged', async () => {
    const res = await put(global.dgToken, inv._id, { referredBy: String(plain._id) });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Intermediary/);
    expect(String(await stored())).toBe(String(nipc._id));
  });

  it("'' → cleared", async () => {
    await put(global.dgToken, inv._id, { referredBy: '' }).expect(200);
    expect(await stored()).toBeNull();
  });

  it('Staff change → ignored', async () => {
    const other = await Investor.create({ investorName: 'NIPC Two', ...base, leadSource: 'Other', organisationType: 'Intermediary' });
    await put(staffToken, inv._id, { referredBy: String(other._id), notes: 'staff' }).expect(200);
    const after = await Investor.findById(inv._id).lean();
    expect(String(after.referredBy)).toBe(String(nipc._id));
    expect(after.notes).toBe('staff');
  });

  it('DG changes lead source to "Other" → referredBy cleared', async () => {
    await put(global.dgToken, inv._id, { leadSource: 'Other', referredBy: { _id: String(nipc._id), investorName: 'NIPC Ref' } }).expect(200);
    const after = await Investor.findById(inv._id).lean();
    expect(after.leadSource).toBe('Other');
    expect(after.referredBy).toBeNull();
  });
});
