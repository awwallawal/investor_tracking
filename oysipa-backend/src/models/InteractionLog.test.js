const mongoose = require('mongoose');
const InteractionLog = require('./InteractionLog');

// Extend Jest timeout (important for Mongo connections on Windows)
jest.setTimeout(30000);

describe('InteractionLog Model', () => {

  it('should require description, category, loggedBy, and investor when there is no project', async () => {
    const log = new InteractionLog({});
    let err;
    try {
      await log.validate();
    } catch (error) {
      err = error;
    }
    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.description).toBeDefined();
    expect(err.errors.category).toBeDefined();
    expect(err.errors.loggedBy).toBeDefined();
    expect(err.errors.investor).toBeDefined();
    expect(err.errors.project).toBeUndefined();
  });

  it('create with neither investor nor project -> ValidationError on investor', async () => {
    await expect(InteractionLog.create({ loggedBy: global.mockUserId, description: 'x', category: 'Email' }))
      .rejects.toMatchObject({ name: 'ValidationError', errors: { investor: expect.anything() } });
  });

  it('investor-level log saves without a project; defaults serviceCodes [] and creditLinkage false', async () => {
    const log = await InteractionLog.create({
      investor: global.investorId, loggedBy: global.mockUserId, description: 'Briefing letter sent to NIPC', category: 'Email',
    });
    expect(log.project).toBeUndefined();
    expect(log.investor.toString()).toBe(global.investorId);
    expect(log.serviceCodes).toEqual([]);
    expect(log.creditLinkage).toBe(false);
  });

  it('project-linked log takes investor from the project, not from the input', async () => {
    const foreign = new mongoose.Types.ObjectId();
    const log = await InteractionLog.create({
      project: global.mockProjectId, investor: foreign, loggedBy: global.mockUserId, description: 'x', category: 'Call',
    });
    expect(log.investor.toString()).toBe(global.investorId);
  });

  it('accepts valid service codes and rejects an unknown one', async () => {
    const ok = await InteractionLog.create({
      investor: global.investorId, loggedBy: global.mockUserId, description: 'x', category: 'Email', serviceCodes: ['M4', 'A10', 'V5'], creditLinkage: true,
    });
    expect(ok.serviceCodes).toEqual(['M4', 'A10', 'V5']);
    expect(ok.creditLinkage).toBe(true);
    const bad = new InteractionLog({ investor: global.investorId, loggedBy: global.mockUserId, description: 'x', category: 'Email', serviceCodes: ['M9'] });
    await expect(bad.validate()).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });

  it('has an { investor, createdAt } index', () => {
    const indexes = InteractionLog.schema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({ investor: 1, createdAt: -1 });
  });

  it('should create and save an interaction log successfully', async () => {
    const logData = {
      project: global.mockProjectId,
      loggedBy: global.mockUserId,
      description: 'Test interaction description',
      category: 'Meeting',
      documentUrl: 'http://example.com/doc.pdf',
    };

    const validLog = new InteractionLog(logData);
    const savedLog = await validLog.save();

    expect(savedLog._id).toBeDefined();
    expect(savedLog.project.toString()).toBe(global.mockProjectId.toString());
    expect(savedLog.loggedBy.toString()).toBe(global.mockUserId.toString());
    expect(savedLog.description).toBe(logData.description);
    expect(savedLog.category).toBe(logData.category);
    expect(savedLog.documentUrl).toBe(logData.documentUrl);
    expect(savedLog.createdAt).toBeDefined();
  });

  it('should correctly reference project and user ObjectIds', async () => {
    const logData = {
      project: global.mockProjectId,
      loggedBy: global.mockUserId,
      description: 'Another test',
      category: 'Call',
    };

    const log = new InteractionLog(logData);
    const savedLog = await log.save();

    const foundLog = await InteractionLog.findById(savedLog._id);
    expect(foundLog.project.toString()).toBe(global.mockProjectId.toString());
    expect(foundLog.loggedBy.toString()).toBe(global.mockUserId.toString());
  });
});
