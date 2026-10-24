const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { connectDB } = require('./src/config/database');
const Investor = require('./src/models/InvestorModel');
const InvestmentProject = require('./src/models/InvestmentProject');
const User = require('./src/models/User');
const InteractionLog = require('./src/models/InteractionLog');
const LifecycleStatus = require('./src/models/LifecycleStatusModel'); // Import LifecycleStatusModel
const ChangeLog = require('./src/models/ChangeLog');

jest.setTimeout(60000);

let defaultLifecycleStatus; // Declare it outside to be accessible globally

// Safety guard: these hooks delete every collection and drop the database.
// Refuse to touch any database whose name does not mark it as disposable.
// (A URI with no database name connects to "test", which may hold live data.)
const assertSafeTestDb = () => {
  const name = mongoose.connection.name || '';
  if (name === 'test' || !/(_test|healthcheck)$/.test(name)) {
    throw new Error(`Refusing to run destructive test hooks against database "${name}". Use a database name ending in _test or healthcheck.`);
  }
};

// Single connection for all tests
beforeAll(async () => {
  await connectDB();
  assertSafeTestDb();
});

// Clean up and seed data before each test suite
beforeEach(async () => {
  assertSafeTestDb();
  // Clear all collections
  await Promise.all([
    Investor.deleteMany({}),
    InvestmentProject.deleteMany({}),
    User.deleteMany({}),
    InteractionLog.deleteMany({}),
    LifecycleStatus.deleteMany({}), // Clear LifecycleStatus collection
  ]);

  // Create fresh seed data for each test
  const user = await new User({ name: 'Global Test User', email: 'global@example.com', password: 'password123' }).save();
  const dgUser = await new User({ name: 'DG User', email: 'dg@example.com', password: 'password123', role: 'Director-General' }).save();
  const portalAdminUser = await new User({ name: 'Portal Admin User', email: 'pa@example.com', password: 'password123', role: 'Portal-Admin' }).save();

  const investor = await Investor.create({
    investorName: 'Test Investor',
    sector: 'Tech',
    countryOfOrigin: 'USA',
  });
  // Create a default LifecycleStatus
  defaultLifecycleStatus = await LifecycleStatus.create({ name: 'Idea', order: 1, description: 'Initial idea phase.' });

  const project = await InvestmentProject.create({
    projectTitle: 'Test Project',
    investor: investor._id,
    lifecycleStatus: defaultLifecycleStatus._id, // Use the _id of the created status
  });

  // Set global variables for tests to use
  global.mockUserId = user._id.toString();
  global.investorId = investor._id.toString();
  global.mockProjectId = project._id.toString();
  const payload = { user: { id: global.mockUserId } };
  global.mockToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

  const dgPayload = { user: { id: dgUser._id, role: 'Director-General' } };
  global.dgToken = jwt.sign(dgPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

  const portalAdminPayload = { user: { id: portalAdminUser._id, role: 'Portal-Admin' } };
  global.portalAdminToken = jwt.sign(portalAdminPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Story 11.10: the seed above writes audit create rows; start each test with
  // an empty ChangeLog (raw driver call: the model refuses deletes).
  await ChangeLog.collection.deleteMany({});
});

// Disconnect after all tests are done
afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    assertSafeTestDb();
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
  }
});

module.exports = { defaultLifecycleStatus }; // Export the defaultLifecycleStatus
