// Story 11.4b: happened dates (FR-Y18) and private document upload (FR-Y19).
// Storage is always a fake provider injected here: no test reaches Cloudinary.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const ChangeLog = require('../models/ChangeLog');
const documentStorage = require('../services/documentStorage');
const { todayLagos, lagosDay, parseHappenedDate } = require('../utils/happenedDate');

const DENIED_PROJECT = { msg: 'Forbidden: You can only change projects of investors assigned to you' };
const MISSING_ID = '507f1f77bcf86cd799439011';
const MB = 1024 * 1024;

let staff;
let staffToken;
let idea;
let lead;
let assignedInvestor;
let unassignedInvestor;
let assignedProject;
let unassignedProject;
let fake;

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;
const day = (d) => lagosDay(new Date(d));

const makeFakeProvider = () => {
  let n = 0;
  return {
    name: 'fake',
    configured: true,
    isConfigured() { return this.configured; },
    upload: jest.fn(async (buffer, { mimeType }) => {
      n += 1;
      return { key: `fake-key-${n}`, resourceType: mimeType.startsWith('image/') ? 'image' : 'raw' };
    }),
    signedUrl: jest.fn(async (doc, ttl) => `https://signed.example.test/${doc.key}?ttl=${ttl}`),
    remove: jest.fn(async () => {}),
  };
};

beforeEach(async () => {
  fake = makeFakeProvider();
  documentStorage.__setProviderForTests(fake);
  staff = await User.create({ name: 'Desk Officer', email: 'desk.officer.4b@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  idea = await LifecycleStatus.findOne({ name: 'Idea' });
  lead = await LifecycleStatus.create({ name: 'Lead', order: 2 });
  assignedInvestor = await Investor.create({ investorName: 'Paper Investor', sector: 'Agro', countryOfOrigin: 'NG', assignedTo: staff._id });
  unassignedInvestor = await Investor.create({ investorName: 'Not Mine', sector: 'Agro', countryOfOrigin: 'NG' });
  assignedProject = await InvestmentProject.create({ projectTitle: 'Agro Hub', investor: assignedInvestor._id, lifecycleStatus: idea._id });
  unassignedProject = await InvestmentProject.create({ projectTitle: 'Theirs', investor: unassignedInvestor._id, lifecycleStatus: idea._id });
});

afterEach(() => {
  documentStorage.__setProviderForTests(null);
  jest.restoreAllMocks();
  delete process.env.DOCUMENT_MAX_MB;
});

describe('parseHappenedDate', () => {
  it('empty → not sent; required → error', () => {
    expect(parseHappenedDate(undefined)).toEqual({ value: undefined });
    expect(parseHappenedDate('')).toEqual({ value: undefined });
    expect(parseHappenedDate(null, { required: true })).toHaveProperty('error');
  });
  it('YYYY-MM-DD stays the same Lagos day', () => {
    const { value } = parseHappenedDate('2025-03-18');
    expect(lagosDay(value)).toBe('2025-03-18');
  });
  it.each(['2099-01-01', '1980-01-01', '1989-12-31', '2025-02-30', 'yesterday', 42, '1', '5/3/2024', '2024-03-05T10:00'])('%p → error', (raw) => {
    expect(parseHappenedDate(raw)).toHaveProperty('error');
  });
  it('an ISO date-time is normalised to its Lagos day at 00:00:00.000Z', () => {
    // 23:30 UTC on 18 Mar is 00:30 on 19 Mar in Lagos.
    expect(parseHappenedDate('2025-03-18T23:30:00.000Z').value.toISOString()).toBe('2025-03-19T00:00:00.000Z');
    expect(parseHappenedDate('2025-03-18T10:15:00+01:00').value.toISOString()).toBe('2025-03-18T00:00:00.000Z');
    expect(parseHappenedDate('2025-03-18').value.toISOString()).toBe('2025-03-18T00:00:00.000Z');
  });

  it.each(['1', '5/3/2024'])('API: interactionDate %p → 400, nothing saved', async (raw) => {
    const before = await InteractionLog.countDocuments();
    const res = await request(app)
      .post(`/api/interactions/investors/${assignedInvestor._id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description: 'x', category: 'Meeting', interactionDate: raw });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(await InteractionLog.countDocuments()).toBe(before);
  });

  it('today (Lagos) and 1990-01-01 are accepted', () => {
    expect(parseHappenedDate(todayLagos())).toHaveProperty('value');
    expect(parseHappenedDate('1990-01-01')).toHaveProperty('value');
  });
});

describe('Interaction happened date', () => {
  const post = (body, token = global.dgToken) => request(app)
    .post(`/api/interactions/investors/${assignedInvestor._id}`)
    .set('Authorization', bearer(token))
    .send({ description: 'Meeting from the paper register', category: 'Meeting', ...body });

  it('paper interaction: saved with that date; createdAt is now', async () => {
    const t0 = Date.now();
    const res = await post({ interactionDate: '2025-03-18' }).expect(201);
    expect(day(res.body.interactionDate)).toBe('2025-03-18');
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(day(res.body.createdAt)).toBe(todayLagos());
  });

  it('no date → today', async () => {
    const res = await post({}).expect(201);
    expect(day(res.body.interactionDate)).toBe(todayLagos());
  });

  it('project interaction also gets the date', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProject._id}/interactions`)
      .set('Authorization', bearer(staffToken))
      .send({ description: 'Call', category: 'Call', interactionDate: '2024-11-02' })
      .expect(201);
    expect(day(res.body.interactionDate)).toBe('2024-11-02');
  });

  it('client createdAt/updatedAt/documents are ignored', async () => {
    const res = await post({ createdAt: '2020-01-01', updatedAt: '2020-01-01', documents: [{ fileName: 'x', key: 'evil' }] }).expect(201);
    expect(day(res.body.createdAt)).toBe(todayLagos());
    expect(day(res.body.updatedAt)).toBe(todayLagos());
    const saved = await InteractionLog.findById(res.body._id).lean();
    expect(saved.documents).toBeUndefined();
  });

  it.each(['2099-01-01', '1980-01-01'])('%s → 400 {message}, nothing saved', async (d) => {
    const before = await InteractionLog.countDocuments();
    const res = await post({ interactionDate: d });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(await InteractionLog.countDocuments()).toBe(before);
  });

  it('assigned Staff corrects the date via PATCH; createdAt unchanged', async () => {
    const created = (await post({}, staffToken).expect(201)).body;
    const res = await request(app)
      .patch(`/api/interactions/${created._id}`)
      .set('Authorization', bearer(staffToken))
      .send({ interactionDate: '2025-01-10', createdAt: '2020-01-01' })
      .expect(200);
    expect(day(res.body.interactionDate)).toBe('2025-01-10');
    expect(res.body.createdAt).toBe(created.createdAt);
  });

  it('PATCH future date → 400, unchanged', async () => {
    const created = (await post({ interactionDate: '2025-03-18' }).expect(201)).body;
    const res = await request(app)
      .patch(`/api/interactions/${created._id}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ interactionDate: '2099-01-01' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(day((await InteractionLog.findById(created._id)).interactionDate)).toBe('2025-03-18');
  });

  it('unassigned Staff PATCH → 403', async () => {
    const log = await InteractionLog.create({ investor: unassignedInvestor._id, loggedBy: staff._id, description: 'x', category: 'Email' });
    const res = await request(app)
      .patch(`/api/interactions/${log._id}`)
      .set('Authorization', bearer(staffToken))
      .send({ interactionDate: '2025-01-10' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(DENIED_PROJECT);
    expect((await InteractionLog.findById(log._id)).interactionDate).toBeUndefined();
  });

  it('lists order by happened date (fallback createdAt), newest first', async () => {
    const now = Date.now();
    // Old record: no interactionDate, recorded 2 days ago.
    await InteractionLog.collection.insertOne({
      investor: assignedInvestor._id, loggedBy: staff._id, description: 'old-unmigrated', category: 'Meeting',
      createdAt: new Date(now - 2 * 86400000), updatedAt: new Date(now - 2 * 86400000),
    });
    await post({ description: 'paper-2025', interactionDate: '2025-03-18' }).expect(201);
    await post({ description: 'today' }).expect(201);
    await post({ description: 'paper-2024', interactionDate: '2024-06-01' }).expect(201);

    const expected = ['today', 'old-unmigrated', 'paper-2025', 'paper-2024'];
    const timeline = await request(app).get(`/api/interactions/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(timeline.body.map((l) => l.description)).toEqual(expected);
    const all = await request(app).get('/api/interactions').set('Authorization', bearer(staffToken)).expect(200);
    expect(all.body.map((l) => l.description)).toEqual(expected);
  });

  it('project list orders by happened date too', async () => {
    const mk = (description, interactionDate) => request(app)
      .post(`/api/projects/${assignedProject._id}/interactions`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description, category: 'Call', ...(interactionDate && { interactionDate }) })
      .expect(201);
    await mk('older', '2023-05-05');
    await mk('newer');
    const res = await request(app).get(`/api/projects/${assignedProject._id}/interactions`).set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body.map((l) => l.description)).toEqual(['newer', 'older']);
  });

  it('no back-fill: an old log keeps no interactionDate after reads', async () => {
    const past = new Date(Date.now() - 3600000);
    const { insertedId } = await InteractionLog.collection.insertOne({
      investor: assignedInvestor._id, loggedBy: staff._id, description: 'Old', category: 'Meeting', createdAt: past, updatedAt: past,
    });
    const timeline = await request(app).get(`/api/interactions/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(timeline.body[0].interactionDate).toBeUndefined();
    await request(app).get('/api/interactions').set('Authorization', bearer(staffToken)).expect(200);
    const raw = await InteractionLog.collection.findOne({ _id: insertedId });
    expect(raw).not.toHaveProperty('interactionDate');
    expect(raw).not.toHaveProperty('documents');
  });
});

describe('Investor firstContactDate', () => {
  const base = { investorName: 'New Paper Inv', sector: 'Tech', countryOfOrigin: 'NG' };

  it('create with a paper date; client createdAt ignored', async () => {
    const res = await request(app).post('/api/investors').set('Authorization', bearer(global.dgToken))
      .send({ ...base, firstContactDate: '2024-02-14', createdAt: '2020-01-01', updatedAt: '2020-01-01' })
      .expect(201);
    expect(day(res.body.firstContactDate)).toBe('2024-02-14');
    expect(day(res.body.createdAt)).toBe(todayLagos());
    expect(day(res.body.updatedAt)).toBe(todayLagos());
  });

  it('create without a date → today', async () => {
    const res = await request(app).post('/api/investors').set('Authorization', bearer(staffToken)).send(base).expect(201);
    expect(day(res.body.firstContactDate)).toBe(todayLagos());
  });

  it.each(['2099-01-01', '1980-01-01'])('create %s → 400 {message}, nothing saved', async (d) => {
    const before = await Investor.countDocuments();
    const res = await request(app).post('/api/investors').set('Authorization', bearer(global.dgToken)).send({ ...base, firstContactDate: d });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(await Investor.countDocuments()).toBe(before);
  });

  it('assigned Staff corrects it; createdAt unchanged; empty leaves it alone', async () => {
    const before = await Investor.findById(assignedInvestor._id).lean();
    const res = await request(app).put(`/api/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken))
      .send({ firstContactDate: '2023-09-09', createdAt: '2020-01-01' })
      .expect(200);
    expect(day(res.body.firstContactDate)).toBe('2023-09-09');
    expect(new Date(res.body.createdAt).getTime()).toBe(before.createdAt.getTime());

    const again = await request(app).put(`/api/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken))
      .send({ firstContactDate: '', sector: 'Tech' })
      .expect(200);
    expect(day(again.body.firstContactDate)).toBe('2023-09-09');
  });

  it('update future date → 400, unchanged', async () => {
    const res = await request(app).put(`/api/investors/${assignedInvestor._id}`).set('Authorization', bearer(global.dgToken))
      .send({ firstContactDate: '2099-01-01', sector: 'Changed' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect((await Investor.findById(assignedInvestor._id)).sector).toBe('Agro');
  });

  it('unassigned Staff → 403', async () => {
    const res = await request(app).put(`/api/investors/${unassignedInvestor._id}`).set('Authorization', bearer(staffToken))
      .send({ firstContactDate: '2023-09-09' });
    expect(res.statusCode).toBe(403);
    expect((await Investor.findById(unassignedInvestor._id)).firstContactDate).toBeUndefined();
  });

  it('no back-fill: an old investor keeps no firstContactDate after reads', async () => {
    await request(app).get(`/api/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken)).expect(200);
    await request(app).get('/api/investors').set('Authorization', bearer(staffToken)).expect(200);
    const raw = await Investor.collection.findOne({ _id: assignedInvestor._id });
    expect(raw).not.toHaveProperty('firstContactDate');
  });
});

describe('Project dateRegistered and statusChangeDate', () => {
  const createUrl = () => `/api/projects/investors/${assignedInvestor._id}/projects`;

  it('create with a paper date; client createdAt ignored', async () => {
    const res = await request(app).post(createUrl()).set('Authorization', bearer(staffToken))
      .send({ projectTitle: 'Paper Project', lifecycleStatus: idea._id.toString(), dateRegistered: '2022-07-01', createdAt: '2020-01-01' })
      .expect(201);
    expect(day(res.body.dateRegistered)).toBe('2022-07-01');
    expect(day(res.body.createdAt)).toBe(todayLagos());
  });

  it('create without a date → today', async () => {
    const res = await request(app).post(createUrl()).set('Authorization', bearer(staffToken))
      .send({ projectTitle: 'Today Project', lifecycleStatus: idea._id.toString() })
      .expect(201);
    expect(day(res.body.dateRegistered)).toBe(todayLagos());
  });

  it.each(['2099-01-01', '1980-01-01'])('create %s → 400 {message}, nothing saved', async (d) => {
    const before = await InvestmentProject.countDocuments();
    const res = await request(app).post(createUrl()).set('Authorization', bearer(global.dgToken))
      .send({ projectTitle: 'Bad', lifecycleStatus: idea._id.toString(), dateRegistered: d });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(await InvestmentProject.countDocuments()).toBe(before);
  });

  it('assigned Staff corrects dateRegistered; createdAt unchanged', async () => {
    const before = await InvestmentProject.findById(assignedProject._id).lean();
    const res = await request(app).put(`/api/projects/${assignedProject._id}`).set('Authorization', bearer(staffToken))
      .send({ dateRegistered: '2021-04-04', createdAt: '2020-01-01', updatedAt: '2020-01-01' })
      .expect(200);
    expect(day(res.body.dateRegistered)).toBe('2021-04-04');
    expect(new Date(res.body.createdAt).getTime()).toBe(before.createdAt.getTime());
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  });

  it('unassigned Staff → 403', async () => {
    const res = await request(app).put(`/api/projects/${unassignedProject._id}`).set('Authorization', bearer(staffToken))
      .send({ dateRegistered: '2021-04-04' });
    expect(res.statusCode).toBe(403);
    expect((await InvestmentProject.findById(unassignedProject._id)).dateRegistered).toBeUndefined();
  });

  it('PUT project with statusChangeDate → System Update log on that date', async () => {
    await request(app).put(`/api/projects/${assignedProject._id}`).set('Authorization', bearer(staffToken))
      .send({ lifecycleStatus: lead._id.toString(), statusChangeDate: '2024-06-01' })
      .expect(200);
    const log = await InteractionLog.findOne({ project: assignedProject._id, category: 'System Update' });
    expect(day(log.interactionDate)).toBe('2024-06-01');
    expect(day(log.createdAt)).toBe(todayLagos());
    const raw = await InvestmentProject.collection.findOne({ _id: assignedProject._id });
    expect(raw).not.toHaveProperty('statusChangeDate');
  });

  it('PUT /status with statusChangeDate → System Update log on that date', async () => {
    await request(app).put(`/api/projects/${assignedProject._id}/status`).set('Authorization', bearer(staffToken))
      .send({ lifecycleStatus: lead._id.toString(), statusChangeDate: '2024-06-01' })
      .expect(200);
    const log = await InteractionLog.findOne({ project: assignedProject._id, category: 'System Update' });
    expect(day(log.interactionDate)).toBe('2024-06-01');
  });

  it('status change with no date → today', async () => {
    await request(app).put(`/api/projects/${assignedProject._id}/status`).set('Authorization', bearer(staffToken))
      .send({ lifecycleStatus: lead._id.toString() })
      .expect(200);
    const log = await InteractionLog.findOne({ project: assignedProject._id, category: 'System Update' });
    expect(day(log.interactionDate)).toBe(todayLagos());
  });

  it.each([
    ['PUT /:id', (id) => `/api/projects/${id}`],
    ['PUT /:id/status', (id) => `/api/projects/${id}/status`],
  ])('%s invalid statusChangeDate → 400, project unchanged, no log', async (_l, url) => {
    const res = await request(app).put(url(assignedProject._id)).set('Authorization', bearer(staffToken))
      .send({ lifecycleStatus: lead._id.toString(), statusChangeDate: '2099-01-01' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect((await InvestmentProject.findById(assignedProject._id)).lifecycleStatus.toString()).toBe(idea._id.toString());
    expect(await InteractionLog.countDocuments({ project: assignedProject._id })).toBe(0);
  });
});

describe('Documents', () => {
  let log;
  let otherLog;

  beforeEach(async () => {
    log = await InteractionLog.create({ investor: assignedInvestor._id, loggedBy: staff._id, description: 'Paper meeting', category: 'Meeting' });
    otherLog = await InteractionLog.create({ project: unassignedProject._id, loggedBy: staff._id, description: 'Their meeting', category: 'Meeting' });
  });

  const upload = (id, { token = staffToken, filename = 'scan.pdf', contentType = 'application/pdf', size = 2 * MB, documentDate } = {}) => {
    let req = request(app).post(`/api/interactions/${id}/documents`).set('Authorization', bearer(token));
    if (documentDate !== undefined) req = req.field('documentDate', documentDate);
    return req.attach('file', Buffer.alloc(size, 1), { filename, contentType });
  };

  const addStoredDoc = async (target = log) => {
    const res = await upload(target._id, { token: global.dgToken }).expect(201);
    return res.body;
  };

  it('upload: assigned officer, PDF 2 MB + documentDate → 201 entry, no key or URL', async () => {
    const res = await upload(log._id, { documentDate: '2025-03-18' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({
      fileName: 'scan.pdf', mimeType: 'application/pdf', size: 2 * MB, uploadedBy: staff._id.toString(),
    }));
    expect(res.body._id).toBeTruthy();
    expect(day(res.body.documentDate)).toBe('2025-03-18');
    expect(day(res.body.uploadedAt)).toBe(todayLagos());
    ['key', 'provider', 'resourceType', 'url', 'secure_url'].forEach((k) => expect(res.body).not.toHaveProperty(k));
    expect(fake.upload).toHaveBeenCalledTimes(1);

    const saved = await InteractionLog.findById(log._id).lean();
    expect(saved.documents).toHaveLength(1);
    expect(saved.documents[0]).toEqual(expect.objectContaining({ key: 'fake-key-1', provider: 'fake', resourceType: 'raw' }));

    // Lists never expose the storage key either.
    const timeline = await request(app).get(`/api/interactions/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken)).expect(200);
    const listed = timeline.body.find((l) => l._id === log._id.toString());
    expect(listed.documents).toHaveLength(1);
    expect(JSON.stringify(timeline.body)).not.toContain('fake-key');
    const all = await request(app).get('/api/interactions').set('Authorization', bearer(staffToken)).expect(200);
    expect(JSON.stringify(all.body)).not.toContain('fake-key');
  });

  it('upload without documentDate → today; images stored as image resources', async () => {
    const res = await upload(log._id, { filename: 'photo.JPG', contentType: 'image/jpeg', size: 1000 }).expect(201);
    expect(day(res.body.documentDate)).toBe(todayLagos());
    expect(res.body.mimeType).toBe('image/jpeg');
    expect((await InteractionLog.findById(log._id).lean()).documents[0].resourceType).toBe('image');
  });

  it.each([
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['report.doc', 'application/msword'],
    ['sheet.xlsx', 'application/octet-stream'],
    ['sheet.xls', 'application/vnd.ms-excel'],
    ['scan.png', 'image/png'],
  ])('allowed type %s → 201', async (filename, contentType) => {
    await upload(log._id, { filename, contentType, size: 100 }).expect(201);
  });

  it.each([
    ['setup.exe', 'application/x-msdownload'],
    ['script.js', 'application/javascript'],
    ['fake.pdf', 'application/x-msdownload'],
    ['noext', 'application/pdf'],
  ])('bad type %s → 400 {message}, nothing stored', async (filename, contentType) => {
    const res = await upload(log._id, { filename, contentType, size: 100 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(fake.upload).not.toHaveBeenCalled();
    expect((await InteractionLog.findById(log._id).lean()).documents).toBeUndefined();
  });

  it('bigger than DOCUMENT_MAX_MB → 400, nothing stored', async () => {
    process.env.DOCUMENT_MAX_MB = '1';
    const res = await upload(log._id, { size: 2 * MB });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/1 MB/);
    expect(fake.upload).not.toHaveBeenCalled();
    expect((await InteractionLog.findById(log._id).lean()).documents).toBeUndefined();
  });

  it('missing file → 400', async () => {
    const res = await request(app).post(`/api/interactions/${log._id}/documents`).set('Authorization', bearer(staffToken)).field('documentDate', '2025-03-18');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  it('future documentDate → 400, nothing stored', async () => {
    const res = await upload(log._id, { documentDate: '2099-01-01', size: 100 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it('unassigned Staff → 403, nothing stored; unknown interaction → 404', async () => {
    const res = await upload(otherLog._id, { size: 100 });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(DENIED_PROJECT);
    expect(fake.upload).not.toHaveBeenCalled();
    const missing = await upload(MISSING_ID, { token: global.dgToken, size: 100 });
    expect(missing.statusCode).toBe(404);
  });

  it('provider fails → 502 {message}, no documents[] entry', async () => {
    fake.upload.mockRejectedValueOnce(new Error('cloud down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await upload(log._id, { size: 100 });
    expect(res.statusCode).toBe(502);
    expect(res.body).toHaveProperty('message');
    expect((await InteractionLog.findById(log._id).lean()).documents).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('not configured → upload and link 503 {message}', async () => {
    const doc = await addStoredDoc();
    fake.configured = false;
    const up = await upload(log._id, { size: 100 });
    expect(up.statusCode).toBe(503);
    expect(up.body).toEqual({ message: 'Document storage is not configured' });
    const link = await request(app).get(`/api/interactions/${log._id}/documents/${doc._id}/link`).set('Authorization', bearer(staffToken));
    expect(link.statusCode).toBe(503);
    expect(link.body).toEqual({ message: 'Document storage is not configured' });
  });

  it('not configured with no provider at all (unknown DOCUMENT_STORAGE) → 503', async () => {
    documentStorage.__setProviderForTests(null);
    const prev = process.env.DOCUMENT_STORAGE;
    process.env.DOCUMENT_STORAGE = 'nothing-here';
    try {
      const up = await upload(log._id, { size: 100 });
      expect(up.statusCode).toBe(503);
    } finally {
      if (prev === undefined) delete process.env.DOCUMENT_STORAGE; else process.env.DOCUMENT_STORAGE = prev;
    }
  });

  it('link: any logged-in role gets a signed 5-minute URL; unknown → 404; no token → 401', async () => {
    const doc = await addStoredDoc(otherLog);
    // Staff can open documents of investors not assigned to them (read all).
    const res = await request(app).get(`/api/interactions/${otherLog._id}/documents/${doc._id}/link`).set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.url).toBe('https://signed.example.test/fake-key-1?ttl=300');
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(fake.signedUrl).toHaveBeenCalledWith(expect.objectContaining({ key: 'fake-key-1' }), 300);

    expect((await request(app).get(`/api/interactions/${otherLog._id}/documents/${MISSING_ID}/link`).set('Authorization', bearer(staffToken))).statusCode).toBe(404);
    expect((await request(app).get(`/api/interactions/${MISSING_ID}/documents/${doc._id}/link`).set('Authorization', bearer(staffToken))).statusCode).toBe(404);
    expect((await request(app).get(`/api/interactions/${otherLog._id}/documents/${doc._id}/link`)).statusCode).toBe(401);
  });

  it('remove: DG → 200; ChangeLog row first; file removed; entry gone', async () => {
    const doc = await addStoredDoc();
    const order = [];
    const insert = jest.spyOn(ChangeLog, 'insertMany');
    insert.mockImplementation(async function wrapped(...args) {
      order.push('changelog');
      insert.mockRestore();
      return ChangeLog.insertMany(...args);
    });
    fake.remove.mockImplementation(async () => { order.push('remove'); });

    const res = await request(app).delete(`/api/interactions/${log._id}/documents/${doc._id}`)
      .set('Authorization', bearer(global.dgToken)).send({ reason: 'Wrong file' }).expect(200);
    expect(res.body).toEqual({ deleted: { documents: 1 } });
    expect(order).toEqual(['changelog', 'remove']);
    expect(fake.remove).toHaveBeenCalledWith(expect.objectContaining({ key: 'fake-key-1' }));

    const row = await ChangeLog.findOne({ entity: 'InteractionLog', entityId: log._id }).lean();
    expect(row).toBeTruthy();
    expect(row.reason).toBe('Wrong file');
    expect(row.snapshot.document.fileName).toBe('scan.pdf');
    expect(String(row.snapshot.document._id)).toBe(doc._id);
    expect((await InteractionLog.findById(log._id).lean()).documents).toEqual([]);
  });

  it('remove: Staff → 403, nothing removed', async () => {
    const doc = await addStoredDoc();
    const changeRows = await ChangeLog.countDocuments();
    const res = await request(app).delete(`/api/interactions/${log._id}/documents/${doc._id}`).set('Authorization', bearer(staffToken));
    expect(res.statusCode).toBe(403);
    expect(fake.remove).not.toHaveBeenCalled();
    expect(await ChangeLog.countDocuments()).toBe(changeRows);
    expect((await InteractionLog.findById(log._id).lean()).documents).toHaveLength(1);
  });

  it('remove: audit write fails → 500, nothing removed', async () => {
    const doc = await addStoredDoc();
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).delete(`/api/interactions/${log._id}/documents/${doc._id}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('message');
    expect(fake.remove).not.toHaveBeenCalled();
    expect((await InteractionLog.findById(log._id).lean()).documents).toHaveLength(1);
  });

  it('remove: unknown document → 404', async () => {
    const res = await request(app).delete(`/api/interactions/${log._id}/documents/${MISSING_ID}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(404);
  });

  it('UTF-8 file names round-trip (e.g. Yoruba)', async () => {
    const name = 'Ọ̀yọ́ minutes.pdf';
    const res = await upload(log._id, { filename: name, size: 100 }).expect(201);
    expect(res.body.fileName).toBe(name);
    expect((await InteractionLog.findById(log._id).lean()).documents[0].fileName).toBe(name);
  });

  it('fractional DOCUMENT_MAX_MB shows one decimal in the message', async () => {
    process.env.DOCUMENT_MAX_MB = '0.5';
    const res = await upload(log._id, { size: MB });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('File is larger than 0.5 MB.');
  });

  it('remove: storage remove fails → 502, entry kept', async () => {
    const doc = await addStoredDoc();
    fake.remove.mockRejectedValueOnce(new Error('cloud down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).delete(`/api/interactions/${log._id}/documents/${doc._id}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(502);
    expect(res.body).toHaveProperty('message');
    expect((await InteractionLog.findById(log._id).lean()).documents).toHaveLength(1);
  });

  it('remove: storage not configured → 503, no ChangeLog row, entry kept', async () => {
    const doc = await addStoredDoc();
    fake.configured = false;
    const changeRows = await ChangeLog.countDocuments();
    const res = await request(app).delete(`/api/interactions/${log._id}/documents/${doc._id}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ message: 'Document storage is not configured' });
    expect(await ChangeLog.countDocuments()).toBe(changeRows);
    expect(fake.remove).not.toHaveBeenCalled();
    expect((await InteractionLog.findById(log._id).lean()).documents).toHaveLength(1);
  });

  it('link: signing fails → 502', async () => {
    const doc = await addStoredDoc();
    fake.signedUrl.mockRejectedValueOnce(new Error('sign failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get(`/api/interactions/${log._id}/documents/${doc._id}/link`).set('Authorization', bearer(staffToken));
    expect(res.statusCode).toBe(502);
    expect(res.body).toHaveProperty('message');
  });

  it('upload: saving the entry fails → 500, stored file removed, no entry', async () => {
    jest.spyOn(InteractionLog, 'findByIdAndUpdate').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await upload(log._id, { size: 100 });
    expect(res.statusCode).toBe(500);
    expect(fake.remove).toHaveBeenCalledWith(expect.objectContaining({ key: 'fake-key-1' }));
    expect((await InteractionLog.findById(log._id).lean()).documents).toBeUndefined();
  });

  it('legacy documentUrl still returned as before', async () => {
    const legacy = await InteractionLog.create({ investor: assignedInvestor._id, loggedBy: staff._id, description: 'Old', category: 'Meeting', documentUrl: 'https://res.cloudinary.com/x/image/upload/a.pdf' });
    const res = await request(app).get(`/api/interactions/investors/${assignedInvestor._id}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.find((l) => l._id === legacy._id.toString()).documentUrl).toBe('https://res.cloudinary.com/x/image/upload/a.pdf');
  });
});
