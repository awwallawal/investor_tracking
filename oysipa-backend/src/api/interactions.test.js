// Story 11.4: interactions at investor level, SABER service codes, Tag services.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');

const DENIED = { msg: 'Forbidden: You can only change projects of investors assigned to you' };
const MISSING_ID = '507f1f77bcf86cd799439011';

let staff;
let staffToken;
let assignedInvestor;
let unassignedInvestor;
let assignedProject;

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;

beforeEach(async () => {
  staff = await User.create({ name: 'Desk Officer', email: 'desk.officer@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  assignedInvestor = await Investor.create({ investorName: 'NIPC Contact', sector: 'Agro', countryOfOrigin: 'NG', assignedTo: staff._id });
  unassignedInvestor = await Investor.create({ investorName: 'Not Mine', sector: 'Agro', countryOfOrigin: 'NG' });
  assignedProject = await InvestmentProject.create({ projectTitle: 'Agro Hub', investor: assignedInvestor._id, lifecycleStatus: idea._id });
});

describe('POST /api/interactions/investors/:investorId', () => {
  it('investor-level log → 201, no project, investor set, creditLinkage false', async () => {
    const res = await request(app)
      .post(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description: 'Briefing letter sent to NIPC', category: 'Email', serviceCodes: ['M4'] })
      .expect(201);
    expect(res.body.project).toBeUndefined();
    expect(res.body.investor).toBe(global.investorId);
    expect(res.body.serviceCodes).toEqual(['M4']);
    expect(res.body.creditLinkage).toBe(false);
    expect(res.body.loggedBy).toHaveProperty('name');
  });

  it('ignores a client documentUrl (no new public links, FR-Y19)', async () => {
    const res = await request(app)
      .post(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description: 'x', category: 'Email', documentUrl: 'http://evil.example/a.pdf' })
      .expect(201);
    expect(res.body.documentUrl).toBeUndefined();
    expect((await InteractionLog.findById(res.body._id).lean()).documentUrl).toBeUndefined();
  });

  it('ignores body investor/project', async () => {
    const res = await request(app)
      .post(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description: 'x', category: 'Email', investor: unassignedInvestor._id.toString(), project: global.mockProjectId })
      .expect(201);
    expect(res.body.investor).toBe(global.investorId);
    expect(res.body.project).toBeUndefined();
  });

  it('bad code → 400 naming the value, nothing written', async () => {
    const before = await InteractionLog.countDocuments();
    const res = await request(app)
      .post(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description: 'x', category: 'Email', serviceCodes: ['M4', 'M9'] });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('M9');
    expect(await InteractionLog.countDocuments()).toBe(before);
  });

  it('missing description/category → 400', async () => {
    const res = await request(app)
      .post(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ category: 'Email' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  it('non-boolean creditLinkage → 400', async () => {
    const res = await request(app)
      .post(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', bearer(global.dgToken))
      .send({ description: 'x', category: 'Email', creditLinkage: 'yes' });
    expect(res.statusCode).toBe(400);
  });

  it('Staff assigned → 201; Staff not assigned → 403, nothing written', async () => {
    await request(app)
      .post(`/api/interactions/investors/${assignedInvestor._id}`)
      .set('Authorization', bearer(staffToken))
      .send({ description: 'Call', category: 'Call', serviceCodes: ['M5'], creditLinkage: true })
      .expect(201);
    const before = await InteractionLog.countDocuments();
    const res = await request(app)
      .post(`/api/interactions/investors/${unassignedInvestor._id}`)
      .set('Authorization', bearer(staffToken))
      .send({ description: 'Call', category: 'Call' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(DENIED);
    expect(await InteractionLog.countDocuments()).toBe(before);
  });

  it.each([['unknown', MISSING_ID], ['malformed', 'not-an-id']])('%s investor id → 404 {message} (DG and Staff)', async (_l, id) => {
    for (const token of [global.dgToken, staffToken]) {
      const res = await request(app)
        .post(`/api/interactions/investors/${id}`)
        .set('Authorization', bearer(token))
        .send({ description: 'x', category: 'Email' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('message');
    }
    expect(await InteractionLog.countDocuments()).toBe(0);
  });
});

describe('GET /api/interactions/investors/:investorId (timeline)', () => {
  it('investor-level logs plus project logs (even unmigrated), newest first, project title populated', async () => {
    const t0 = Date.now();
    const investorLevel = await InteractionLog.create({ investor: assignedInvestor._id, loggedBy: staff._id, description: 'Briefing letter', category: 'Email', serviceCodes: ['M4'] });
    // Old record with no investor (inserted raw, as before the migration)
    await InteractionLog.collection.insertOne({
      project: assignedProject._id, loggedBy: staff._id, description: 'Old meeting', category: 'Meeting',
      createdAt: new Date(t0 - 60000), updatedAt: new Date(t0 - 60000),
    });
    // Someone else's log must not appear
    await InteractionLog.create({ investor: unassignedInvestor._id, loggedBy: staff._id, description: 'Other', category: 'Email' });

    const res = await request(app)
      .get(`/api/interactions/investors/${assignedInvestor._id}`)
      .set('Authorization', bearer(staffToken))
      .expect(200);
    expect(res.body.map((l) => l.description)).toEqual(['Briefing letter', 'Old meeting']);
    expect(res.body[0]._id).toBe(investorLevel._id.toString());
    expect(res.body[0].project).toBeUndefined();
    expect(res.body[1].project.projectTitle).toBe('Agro Hub');
    expect(res.body[1].serviceCodes === undefined || Array.isArray(res.body[1].serviceCodes)).toBe(true);
  });

  it.each([['unknown', MISSING_ID], ['malformed', 'not-an-id']])('%s investor id → 404 {message}', async (_l, id) => {
    const res = await request(app).get(`/api/interactions/investors/${id}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message');
  });
});

describe('GET /api/interactions', () => {
  it('populates investor name for investor-level logs', async () => {
    await InteractionLog.create({ investor: assignedInvestor._id, loggedBy: staff._id, description: 'x', category: 'Email' });
    const res = await request(app).get('/api/interactions').set('Authorization', bearer(global.dgToken)).expect(200);
    expect(res.body[0].investor.investorName).toBe('NIPC Contact');
  });
});

describe('PATCH /api/interactions/:id (Tag services)', () => {
  const insertOld = async (doc) => {
    const past = new Date(Date.now() - 3600000);
    const { insertedId } = await InteractionLog.collection.insertOne({
      loggedBy: staff._id, description: 'Old meeting', category: 'Meeting', createdAt: past, updatedAt: past, ...doc,
    });
    return insertedId;
  };

  it('old log: codes and flag saved, other fields ignored, updatedAt moves', async () => {
    const id = await insertOld({ project: assignedProject._id, documentUrl: 'http://example.com/a.pdf' });
    const before = await InteractionLog.findById(id).lean();
    const res = await request(app)
      .patch(`/api/interactions/${id}`)
      .set('Authorization', bearer(staffToken))
      .send({
        serviceCodes: ['A8'], creditLinkage: true, description: 'x', category: 'Email', documentUrl: 'http://evil', project: global.mockProjectId, investor: unassignedInvestor._id.toString(),
      })
      .expect(200);
    expect(res.body.serviceCodes).toEqual(['A8']);
    expect(res.body.creditLinkage).toBe(true);
    const after = await InteractionLog.findById(id).lean();
    expect(after.serviceCodes).toEqual(['A8']);
    expect(after.creditLinkage).toBe(true);
    expect(after.description).toBe('Old meeting');
    expect(after.category).toBe('Meeting');
    expect(after.documentUrl).toBe('http://example.com/a.pdf');
    expect(after.project.toString()).toBe(assignedProject._id.toString());
    expect(after.investor).toBeUndefined();
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('investor-level log of an assigned investor → 200 for Staff', async () => {
    const log = await InteractionLog.create({ investor: assignedInvestor._id, loggedBy: staff._id, description: 'x', category: 'Email' });
    const res = await request(app)
      .patch(`/api/interactions/${log._id}`)
      .set('Authorization', bearer(staffToken))
      .send({ serviceCodes: ['M4', 'M4'] })
      .expect(200);
    expect(res.body.serviceCodes).toEqual(['M4']);
    expect(res.body.creditLinkage).toBe(false);
  });

  it('Staff not assigned (via project or investor) → 403, unchanged', async () => {
    const otherProject = await InvestmentProject.create({ projectTitle: 'Theirs', investor: unassignedInvestor._id, lifecycleStatus: (await LifecycleStatus.findOne({ name: 'Idea' }))._id });
    const viaProject = await insertOld({ project: otherProject._id });
    const viaInvestor = (await InteractionLog.create({ investor: unassignedInvestor._id, loggedBy: staff._id, description: 'x', category: 'Email' }))._id;
    for (const id of [viaProject, viaInvestor]) {
      const before = await InteractionLog.findById(id).lean();
      const res = await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(staffToken)).send({ serviceCodes: ['A8'] });
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual(DENIED);
      const after = await InteractionLog.findById(id).lean();
      expect(after.serviceCodes || []).toEqual(before.serviceCodes || []);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    }
  });

  it('serviceCodes: [] clears existing tags', async () => {
    const log = await InteractionLog.create({ investor: assignedInvestor._id, loggedBy: staff._id, description: 'x', category: 'Email', serviceCodes: ['A8'] });
    const res = await request(app).patch(`/api/interactions/${log._id}`).set('Authorization', bearer(staffToken)).send({ serviceCodes: [] }).expect(200);
    expect(res.body.serviceCodes).toEqual([]);
    expect((await InteractionLog.findById(log._id)).serviceCodes).toEqual([]);
  });

  it('Staff check follows the project current investor, not a stale stored investor', async () => {
    const otherProject = await InvestmentProject.create({ projectTitle: 'Theirs 2', investor: unassignedInvestor._id, lifecycleStatus: (await LifecycleStatus.findOne({ name: 'Idea' }))._id });
    // Stale: stored investor is the Staff's, project now belongs to someone else
    const id = await insertOld({ project: otherProject._id, investor: assignedInvestor._id });
    const res = await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(staffToken)).send({ serviceCodes: ['A8'] });
    expect(res.statusCode).toBe(403);
  });

  it('DG can tag any log', async () => {
    const id = await insertOld({ project: global.mockProjectId });
    await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(global.dgToken)).send({ creditLinkage: true }).expect(200);
    expect((await InteractionLog.findById(id)).creditLinkage).toBe(true);
  });

  it.each([['unknown', MISSING_ID], ['malformed', 'not-an-id']])('%s id → 404', async (_l, id) => {
    const res = await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(staffToken)).send({ serviceCodes: ['A8'] });
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message');
  });

  it('invalid code → 400, unchanged', async () => {
    const id = await insertOld({ project: assignedProject._id });
    const res = await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(staffToken)).send({ serviceCodes: ['Z1'] });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Z1');
    expect((await InteractionLog.findById(id).lean()).serviceCodes).toBeUndefined();
  });

  it('empty body → 400; $-operator body → 400', async () => {
    const id = await insertOld({ project: assignedProject._id });
    await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(staffToken)).send({}).expect(400);
    await request(app).patch(`/api/interactions/${id}`).set('Authorization', bearer(staffToken)).send({ $set: { description: 'x' } }).expect(400);
    expect((await InteractionLog.findById(id)).description).toBe('Old meeting');
  });

  it('no token → 401', async () => {
    const id = new mongoose.Types.ObjectId();
    await request(app).patch(`/api/interactions/${id}`).send({ serviceCodes: ['A8'] }).expect(401);
  });
});
