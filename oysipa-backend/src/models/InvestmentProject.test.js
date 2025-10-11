const InvestmentProject = require('./InvestmentProject');
const mongoose = require('mongoose');

// Mock the Investor model for testing purposes
jest.mock('./InvestorModel', () => {
  const { Types } = require('mongoose'); // require inside mock is safe
  return {
    _id: new Types.ObjectId(), // Mock ObjectId
  };
});

describe('InvestmentProject Model', () => {
  beforeAll(async () => {
    // Connect to a test database (or mock mongoose connection)
    // For simplicity, we'll assume mongoose is already connected in a test environment
    // or mock its behavior.
    // In a real scenario, you'd connect to an in-memory DB like @shelf/jest-mongodb
    // or mock mongoose.connect.
  });

  afterAll(async () => {
    // Disconnect from the test database or clean up mocks
  });

  it('should create a new investment project successfully', async () => {
    const investorId = new mongoose.Types.ObjectId(); // Create a new ObjectId for the investor
    const lifecycleStatusId = new mongoose.Types.ObjectId();

    const projectData = {
      projectTitle: 'Green Energy Initiative',
      description: 'A project to invest in renewable energy sources.',
      estimatedValue: 1000000,
      location: 'California',
      lifecycleStatus: lifecycleStatusId, // Use an ObjectId
      investor: investorId, // Use the mocked investor ID
    };

    const project = new InvestmentProject(projectData);
    await expect(project.validate()).resolves.toBeUndefined(); // Validate without saving to DB

    expect(project.projectTitle).toBe(projectData.projectTitle);
    expect(project.description).toBe(projectData.description);
    expect(project.estimatedValue).toBe(projectData.estimatedValue);
    expect(project.location).toBe(projectData.location);
    expect(project.lifecycleStatus).toBe(projectData.lifecycleStatus);
    expect(project.investor.toString()).toBe(investorId.toString());
  });

  it('should require projectTitle', async () => {
    const project = new InvestmentProject({
      description: 'Test description',
      investor: new mongoose.Types.ObjectId(),
      lifecycleStatus: new mongoose.Types.ObjectId(),
    });
    await expect(project.validate()).rejects.toThrow('projectTitle: Path `projectTitle` is required.');
  });

  it('should require investor', async () => {
    const project = new InvestmentProject({
      projectTitle: 'Test Project',
      description: 'Test description',
      lifecycleStatus: new mongoose.Types.ObjectId(),
    });
    await expect(project.validate()).rejects.toThrow('investor: Path `investor` is required.');
  });

  it('should require lifecycleStatus', async () => {
    const project = new InvestmentProject({
      projectTitle: 'Test Project',
      description: 'Test description',
      investor: new mongoose.Types.ObjectId(),
    });
    await expect(project.validate()).rejects.toThrow('lifecycleStatus: Path `lifecycleStatus` is required.');
  });

  it('should set default value for estimatedValue', async () => {
    const project = new InvestmentProject({
      projectTitle: 'Project with Defaults',
      investor: new mongoose.Types.ObjectId(),
      lifecycleStatus: new mongoose.Types.ObjectId(),
    });
    await expect(project.validate()).resolves.toBeUndefined();
    expect(project.estimatedValue).toBe(0);
  });
});
