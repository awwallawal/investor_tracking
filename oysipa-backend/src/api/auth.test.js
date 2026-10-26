const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');

// Story 11.13: the login token carries the user's name so the header's user
// chip can show it. The DB connection is opened (and closed) by jest.setup.js.
describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await User.create({
      name: 'Adebayo Officer',
      email: 'officer@test.com',
      password: 'password123',
      role: 'Staff',
      status: 'active',
    });
  });

  it('signs { user: { id, role, name } } into the token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.user).toEqual({ id: expect.any(String), role: 'Staff', name: 'Adebayo Officer' });
  });

  it('wrong password → 400 and no token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer@test.com', password: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });
});
