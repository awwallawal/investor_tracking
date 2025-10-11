const request = require('supertest');
const app = require('../index'); // Assuming your app entry point is index.js
const LifecycleStatus = require('../models/LifecycleStatusModel');

describe('Lifecycle Statuses API', () => {
  beforeEach(async () => {
    await LifecycleStatus.deleteMany({});
    await LifecycleStatus.create([
      { name: 'Execution', order: 3, description: '...' },
      { name: 'Planning', order: 2, description: '...' },
      { name: 'Idea', order: 1, description: '...' },
    ]);
  });

  it('should fetch all lifecycle statuses sorted by order', async () => {
    const res = await request(app)
      .get('/api/lifecycle-statuses')
      .set('Authorization', `Bearer ${global.mockToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].name).toBe('Idea');
    expect(res.body[1].name).toBe('Planning');
    expect(res.body[2].name).toBe('Execution');
  });
});
