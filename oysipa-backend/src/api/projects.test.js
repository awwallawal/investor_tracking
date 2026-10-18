const request = require('supertest');
const app = require('../index');
const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const User = require('../models/User');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const jwt = require('jsonwebtoken');

describe('Project API', () => {
  // lifecycleStatus is an ObjectId ref to LifecycleStatus ("Idea" is seeded globally by jest.setup.js)
  let leadStatus, initialInterestStatus, commitmentStatus;

  beforeEach(async () => {
    [leadStatus, initialInterestStatus, commitmentStatus] = await LifecycleStatus.create([
      { name: 'Lead', order: 2 },
      { name: 'Initial Interest', order: 3 },
      { name: 'Commitment', order: 4 },
    ]);
  });

  it('should create a new project for an investor', async () => {
    const projectData = {
      projectTitle: 'Project A',
      lifecycleStatus: initialInterestStatus._id.toString(),
    };

    const res = await request(app)
      .post(`/api/projects/investors/${global.investorId}/projects`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send(projectData)
      .expect(201);

    expect(res.body).toHaveProperty('_id');
    expect(res.body.investor._id).toBe(global.investorId);
    expect(res.body.projectTitle).toBe('Project A');
    expect(res.body.lifecycleStatus).toBe(initialInterestStatus._id.toString());
  });

  it('should fetch projects for an investor', async () => {
    const res = await request(app)
      .get(`/api/projects/investors/${global.investorId}/projects`)
      .set('Authorization', `Bearer ${global.mockToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].investor._id).toBe(global.investorId);
  });

    it('should get all projects, optionally filtered by lifecycleStatus', async () => {
      const newInvestor1 = await Investor.create({ investorName: 'Test Investor 1', sector: 'IT', countryOfOrigin: 'USA' });
      const newUser1 = await User.create({ name: 'Test User 1', email: 'test1@example.com', password: 'password123' });

      const newInvestor2 = await Investor.create({ investorName: 'Test Investor 2', sector: 'Finance', countryOfOrigin: 'UK' });
      const newUser2 = await User.create({ name: 'Test User 2', email: 'test2@example.com', password: 'password123' });

      const newInvestor3 = await Investor.create({ investorName: 'Test Investor 3', sector: 'Healthcare', countryOfOrigin: 'Germany' });
      const newUser3 = await User.create({ name: 'Test User 3', email: 'test3@example.com', password: 'password123' });

      // Create projects directly in the database
      const project1 = await InvestmentProject.create({
        projectTitle: 'Filtered Project 1',
        projectType: 'Type A',
        lifecycleStatus: leadStatus._id,
        investor: newInvestor1._id,
        assignedTo: newUser1._id,
      });

      const project2 = await InvestmentProject.create({
        projectTitle: 'Filtered Project 2',
        projectType: 'Type B',
        lifecycleStatus: commitmentStatus._id,
        investor: newInvestor2._id,
        assignedTo: newUser2._id,
      });

      const project3 = await InvestmentProject.create({
        projectTitle: 'Filtered Project 3',
        projectType: 'Type C',
        lifecycleStatus: initialInterestStatus._id,
        investor: newInvestor3._id,
        assignedTo: newUser3._id,
      });

      // Get all projects without filter
      const resAll = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${global.dgToken}`);
      expect(resAll.statusCode).toEqual(200);
      expect(resAll.body.length).toEqual(4); // 1 from beforeEach + 3 from this test

      // Get projects filtered by lifecycleStatus
      const resFiltered = await request(app)
        .get('/api/projects?lifecycleStatus=Lead')
        .set('Authorization', `Bearer ${global.dgToken}`);
      expect(resFiltered.statusCode).toEqual(200);
      expect(resFiltered.body.length).toEqual(1);
      expect(resFiltered.body[0].projectTitle).toEqual('Filtered Project 1');
      expect(resFiltered.body[0].lifecycleStatus.name).toEqual('Lead');
    });

    it('should get a single project by ID', async () => {
      const res = await request(app)
        .get(`/api/projects/${global.mockProjectId}`)
        .set('Authorization', `Bearer ${global.dgToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('projectTitle', 'Test Project');
    });

  it('should update a project by ID', async () => {
    const project = await InvestmentProject.findOne({ investor: global.investorId });

    const updatedData = { projectTitle: 'Updated Project A' };

    const res = await request(app)
      .put(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send(updatedData)
      .expect(200);

    expect(res.body.projectTitle).toBe('Updated Project A');
    expect(res.body.investor._id).toBe(global.investorId);
  });

  it('should create an interaction log when lifecycleStatus is updated', async () => {
    const project = await InvestmentProject.create({
      projectTitle: 'Lifecycle Test Project',
      investor: global.investorId,
      lifecycleStatus: initialInterestStatus._id,
    });

    const updatedData = { lifecycleStatus: leadStatus._id.toString() };

    const res = await request(app)
      .put(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send(updatedData)
      .expect(200);

    expect(res.body.lifecycleStatus.name).toBe('Lead');

    const log = await InteractionLog.findOne({ project: project._id, category: 'System Update' });
    expect(log).not.toBeNull();
    expect(log.description).toBe(`Lifecycle status changed from "Initial Interest" to "Lead"`);
    expect(log.investor.toString()).toBe(global.investorId);
  });

  it('moving a project to another investor moves its logs (investor + timelines)', async () => {
    const newInvestor = await Investor.create({ investorName: 'New Owner', sector: 'Tech', countryOfOrigin: 'NG' });
    const log = await InteractionLog.create({ project: global.mockProjectId, loggedBy: global.mockUserId, description: 'Moved log', category: 'Call' });
    expect(log.investor.toString()).toBe(global.investorId);

    await request(app)
      .put(`/api/projects/${global.mockProjectId}`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send({ investor: newInvestor._id.toString() })
      .expect(200);

    expect((await InteractionLog.findById(log._id)).investor.toString()).toBe(newInvestor._id.toString());
    const oldTimeline = await request(app)
      .get(`/api/interactions/investors/${global.investorId}`)
      .set('Authorization', `Bearer ${global.dgToken}`)
      .expect(200);
    expect(oldTimeline.body.map((l) => l._id)).not.toContain(log._id.toString());
    const newTimeline = await request(app)
      .get(`/api/interactions/investors/${newInvestor._id}`)
      .set('Authorization', `Bearer ${global.dgToken}`)
      .expect(200);
    expect(newTimeline.body.map((l) => l._id)).toContain(log._id.toString());
  });

  it('PUT /:id/status System Update log has investor set', async () => {
    await request(app)
      .put(`/api/projects/${global.mockProjectId}/status`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send({ lifecycleStatus: leadStatus._id.toString() })
      .expect(200);
    const log = await InteractionLog.findOne({ project: global.mockProjectId, category: 'System Update' });
    expect(log).not.toBeNull();
    expect(log.investor.toString()).toBe(global.investorId);
  });
});

describe('Interaction Logs API', () => {
  it('should create a new interaction log', async () => {
    const logData = {
      description: 'Discussed project scope',
      category: 'Meeting',
      documentUrl: 'http://example.com/doc1.pdf',
      // loggedBy removed: controller handles via req.user.id
    };

    const res = await request(app)
      .post(`/api/projects/${global.mockProjectId}/interactions`)
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send(logData)
      .expect(201);

    expect(res.body).toHaveProperty('_id');
    expect(res.body.project).toBe(global.mockProjectId);
    expect(res.body.loggedBy._id).toBe(jwt.decode(global.portalAdminToken).user.id.toString());
    expect(res.body.documentUrl).toBe(logData.documentUrl);
    expect(res.body.investor).toBe(global.investorId);
    expect(res.body.serviceCodes).toEqual([]);
    expect(res.body.creditLinkage).toBe(false);
  });

  it('saves serviceCodes/creditLinkage and ignores a foreign investor in the body', async () => {
    const foreign = await Investor.create({ investorName: 'Foreign Inv', sector: 'Tech', countryOfOrigin: 'UK' });
    const res = await request(app)
      .post(`/api/projects/${global.mockProjectId}/interactions`)
      .set('Authorization', `Bearer ${global.dgToken}`)
      .send({ description: 'Site visit', category: 'Site Visit', serviceCodes: ['A1', 'A2', 'A1'], creditLinkage: true, investor: foreign._id.toString(), project: new mongoose.Types.ObjectId().toString() })
      .expect(201);
    expect(res.body.investor).toBe(global.investorId);
    expect(res.body.project).toBe(global.mockProjectId);
    expect(res.body.serviceCodes).toEqual(['A1', 'A2']);
    expect(res.body.creditLinkage).toBe(true);
  });

  it('bad service code on the project route -> 400 naming the value, nothing saved', async () => {
    const before = await InteractionLog.countDocuments();
    const res = await request(app)
      .post(`/api/projects/${global.mockProjectId}/interactions`)
      .set('Authorization', `Bearer ${global.dgToken}`)
      .send({ description: 'x', category: 'Email', serviceCodes: ['M9'] });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('M9');
    expect(await InteractionLog.countDocuments()).toBe(before);
  });

  it('should fetch all interaction logs for a project', async () => {
    // Ensure at least one log exists for this test
    await InteractionLog.create({
      project: global.mockProjectId,
      loggedBy: global.mockUserId,
      description: 'Test log for fetch test',
      category: 'Call',
    });

    const res = await request(app)
      .get(`/api/projects/${global.mockProjectId}/interactions`)
      .set('Authorization', `Bearer ${global.mockToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].project).toBe(global.mockProjectId);
  });
});