const mongoose = require('mongoose');
const InteractionLog = require('./InteractionLog');

// Extend Jest timeout (important for Mongo connections on Windows)
jest.setTimeout(30000);

describe('InteractionLog Model', () => {

  it('should require description, category, project, and loggedBy', async () => {
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
    expect(err.errors.project).toBeDefined();
    expect(err.errors.loggedBy).toBeDefined();
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
