const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index'); // Your Express app
const User = require('../models/User');
const InvestorModel = require('../models/InvestorModel'); // Corrected import
const InvestmentProject = require('../models/InvestmentProject');
const jwt = require('jsonwebtoken');

let staffToken;
let staffUser;
let investor;
let project1;
let project2;

describe('Staff API', () => {
  beforeAll(async () => {
    // Connect to a test database
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/oysipa_test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  beforeEach(async () => {
    // Clear the database and seed with test data
    await User.deleteMany({});
    await InvestorModel.deleteMany({}); // Delete InvestorModel data
    await InvestmentProject.deleteMany({});

    staffUser = await User.create({
      name: 'Test Staff',
      email: 'staff@test.com',
      password: 'password123',
      role: 'Staff',
    });

    // Generate a token for the staff user
    staffToken = jwt.sign({ user: { id: staffUser.id, role: staffUser.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

    investor = await InvestorModel.create({
      investorName: 'Test Investor',
      email: 'investor@test.com',
      contactPerson: 'John Doe',
      phone: '123-456-7890',
      address: '123 Main St',
      status: 'Active',
      sector: 'Technology',
      countryOfOrigin: 'USA',
    });

    project1 = await InvestmentProject.create({
      projectTitle: 'Staff Project 1',
      investor: investor._id,
      assignedTo: staffUser._id,
      lifecycleStatus: 'Lead',
    });

    project2 = await InvestmentProject.create({
      projectTitle: 'Staff Project 2',
      investor: investor._id,
      assignedTo: staffUser._id,
      lifecycleStatus: 'Initial Interest',
    });

    // A project not assigned to staffUser
    await InvestmentProject.create({
      projectTitle: 'Other Project',
      investor: investor._id,
      assignedTo: new mongoose.Types.ObjectId(), // Assign to a different, non-existent user
      lifecycleStatus: 'Committment',
    });
  });

  afterEach(async () => {
    // Clean up after each test
    await User.deleteMany({});
    await InvestorModel.deleteMany({}); // Delete InvestorModel data
    await InvestmentProject.deleteMany({});
  });

  afterAll(async () => {
    // Disconnect from the database
    await mongoose.connection.close();
  });

  it('should return assigned projects for a staff member', async () => {
    const res = await request(app)
      .get('/api/staff/dashboard')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveLength(2); // Should only get project1 and project2

    // Check if projects are correctly returned and populated
    expect(res.body[0].projectTitle).toBeDefined();
    expect(res.body[0].investor.investorName).toBeDefined();
    expect(res.body[0].lifecycleStatus).toBeDefined();
    expect(res.body.some(p => p.projectTitle === 'Staff Project 1')).toBeTruthy();
    expect(res.body.some(p => p.projectTitle === 'Staff Project 2')).toBeTruthy();
  });

  it('should return 401 if no token is provided', async () => {
    const res = await request(app)
      .get('/api/staff/dashboard');

    expect(res.statusCode).toEqual(401);
    expect(res.body.msg).toEqual('No token, authorization denied');
  });

  it('should return 401 if an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/staff/dashboard')
      .set('Authorization', 'Bearer invalidtoken');

    expect(res.statusCode).toEqual(401);
  });

  it('should return 403 if user is not a Staff member', async () => {
    const nonStaffUser = await User.create({
      name: 'Non Staff',
      email: 'nonstaff@test.com',
      password: 'password123',
      role: 'Portal-Admin', // Not a Staff role
    });
    const nonStaffToken = jwt.sign({ user: { id: nonStaffUser.id, role: nonStaffUser.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/staff/dashboard')
      .set('Authorization', `Bearer ${nonStaffToken}`);

    // Assuming auth middleware checks for role and returns 403
    // If auth middleware only checks for token validity, this test might need adjustment
    // For now, I'll assume the auth middleware handles role-based access control.
    // If not, the controller itself would need to check req.user.role
    expect(res.statusCode).toEqual(403); // Or 500 if the controller doesn't handle it
  });
});