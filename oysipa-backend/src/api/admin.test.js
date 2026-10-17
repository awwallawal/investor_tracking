const request = require('supertest');
const app = require('../index'); // The main app instance
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const jwt = require('jsonwebtoken');

describe('GET /api/admin/dashboard-kpis', () => {
  let dgToken, staffToken;

  beforeEach(async () => {
    // Clean and seed the database before each test
    await Promise.all([
        User.deleteMany({}),
        Investor.deleteMany({}),
        InvestmentProject.deleteMany({}),
        InteractionLog.deleteMany({}),
    ]);

    const dgUser = await User.create({
      name: 'Test DG',
      email: 'testdg@example.com',
      password: 'password123',
      role: 'Director-General',
    });
    const staffUser = await User.create({
      name: 'Test Staff',
      email: 'teststaff@example.com',
      password: 'password123',
      role: 'Staff',
    });

    dgToken = jwt.sign({ user: { id: dgUser.id } }, process.env.JWT_SECRET, { expiresIn: '1h' });
    staffToken = jwt.sign({ user: { id: staffUser.id } }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // lifecycleStatus is an ObjectId ref ("Idea" is seeded globally by jest.setup.js)
    const [leadStatus, initialInterestStatus, expansionStatus] = await LifecycleStatus.create([
      { name: 'Lead', order: 2 },
      { name: 'Initial Interest', order: 3 },
      { name: 'Expansion', order: 5 },
    ]);

    const testInvestor = await Investor.create(
        { investorName: 'Main Test Investor', sector: 'Tech', countryOfOrigin: 'USA' }
    );

    await InvestmentProject.create([
      { projectTitle: 'Proj 1', investor: testInvestor._id, lifecycleStatus: leadStatus._id },
      { projectTitle: 'Proj 2', investor: testInvestor._id, lifecycleStatus: leadStatus._id },
      { projectTitle: 'Proj 3', investor: testInvestor._id, lifecycleStatus: expansionStatus._id },
    ]);

    const testProjectForLogs = await InvestmentProject.create(
        { projectTitle: 'Log Project', investor: testInvestor._id, lifecycleStatus: initialInterestStatus._id }
    );

    await InteractionLog.create([
        { description: 'log 1', category: 'Call', project: testProjectForLogs._id, loggedBy: dgUser.id },
        { description: 'log 2', category: 'Meeting', project: testProjectForLogs._id, loggedBy: staffUser.id },
    ]);
    // An older log: recentInteractions is an all-time count, so it is included
    const oldLog = new InteractionLog({ description: 'log 3 old', category: 'Email', project: testProjectForLogs._id, loggedBy: staffUser.id });
    oldLog.createdAt = new Date(new Date().setDate(new Date().getDate() - 31));
    await oldLog.save();
  });

  it('should return correct KPI data for a Director-General', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard-kpis')
      .set('Authorization', `Bearer ${dgToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.totalInvestors).toBe(1);
    expect(res.body.totalProjects).toBe(4);
    expect(res.body.recentInteractions).toBe(3); // all-time count ("All-Time Interactions" on the DG dashboard)
    expect(res.body.projectsByStage).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'Lead', count: 2 }),
      expect.objectContaining({ status: 'Expansion', count: 1 }),
      expect.objectContaining({ status: 'Initial Interest', count: 1 }),
    ]));
  });

  it('should return correct KPI data for a Staff user', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard-kpis')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.statusCode).toEqual(403);
  });

  it('should return 401 Unauthorized if no token is provided', async () => {
    const res = await request(app).get('/api/admin/dashboard-kpis');

    expect(res.statusCode).toEqual(401);
  });
});
