// Route × role access matrix. Every mounted route is checked against
// Director-General (DG), Portal-Admin (PA), Staff and no token. Project writes
// are also checked for Staff on a project whose investor is not assigned to them.
// Allowed = response is not 401/403. Denied = 403 (role) or 401 (no token).
// Keep in sync with _bmad-output/implementation-artifacts/access-matrix.md.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');

const DG = 'DG';
const PA = 'PA';
const STAFF = 'Staff';
const ALL = [DG, PA, STAFF];
const ADMINS = [DG, PA];

let f; // fixtures, rebuilt before every test (jest.setup.js wipes the DB)
let inviteSeq = 0;

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(async () => {
  const staff = await User.create({ name: 'Matrix Staff', email: 'matrix.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  const otherStaff = await User.create({ name: 'Other Staff', email: 'other.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  const revokeTarget = await User.create({ name: 'Revoke Me', email: 'revoke.me@example.com', password: 'password123', role: 'Staff', status: 'active' });

  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  const lead = await LifecycleStatus.create({ name: 'Lead', order: 2 });
  const spare = await LifecycleStatus.create({ name: 'Spare', order: 3 });

  const assignedInvestor = await Investor.create({ investorName: 'Assigned Inv', sector: 'Tech', countryOfOrigin: 'NG', assignedTo: staff._id });
  const unassignedInvestor = await Investor.create({ investorName: 'Unassigned Inv', sector: 'Tech', countryOfOrigin: 'NG' });
  const otherInvestor = await Investor.create({ investorName: 'Other Staff Inv', sector: 'Tech', countryOfOrigin: 'NG', assignedTo: otherStaff._id });

  const mk = (title, investor) => InvestmentProject.create({ projectTitle: title, investor: investor._id, lifecycleStatus: idea._id });
  const assignedProject = await mk('Assigned Project', assignedInvestor);
  const unassignedProject = await mk('Unassigned Project', unassignedInvestor);
  const otherProject = await mk('Other Project', otherInvestor);

  f = {
    tokens: { [DG]: global.dgToken, [PA]: global.portalAdminToken, [STAFF]: sign(staff) },
    staff, revokeTarget, idea, lead, spare,
    assignedInvestor, unassignedInvestor, otherInvestor,
    assignedProject, unassignedProject, otherProject,
  };
});

// ctx: { investorId, projectId } — the project/investor a request targets.
const assignedCtx = () => ({ investorId: f.assignedInvestor._id.toString(), projectId: f.assignedProject._id.toString() });
const unassignedCtxs = () => [
  { label: 'investor unassigned', investorId: f.unassignedInvestor._id.toString(), projectId: f.unassignedProject._id.toString() },
  { label: 'investor assigned to other staff', investorId: f.otherInvestor._id.toString(), projectId: f.otherProject._id.toString() },
];

// allow: roles that get through. public: no token needed.
// projectWrite: also run Staff against unassigned projects (expect 403, nothing changed).
// When you add or change a route, add it here and in access-matrix.md
const ROUTES = [
  // Public by design
  { name: 'GET /health', method: 'get', path: () => '/health', public: true },
  { name: 'POST /api/auth/login', method: 'post', path: () => '/api/auth/login', body: () => ({ email: 'nobody@example.com', password: 'x' }), public: true },
  { name: 'GET /api/lifecycle-statuses', method: 'get', path: () => '/api/lifecycle-statuses', public: true },

  // Users
  { name: 'GET /api/users', method: 'get', path: () => '/api/users', allow: ADMINS },
  { name: 'GET /api/users/staff', method: 'get', path: () => '/api/users/staff', allow: ADMINS },
  { name: 'POST /api/users/invite', method: 'post', path: () => '/api/users/invite', body: () => ({ name: 'Invitee', email: `invitee${++inviteSeq}@example.com`, password: 'password123', role: 'Staff' }), allow: ADMINS },
  { name: 'PUT /api/users/:id/revoke', method: 'put', path: () => `/api/users/${f.revokeTarget._id}/revoke`, allow: ADMINS },

  // Investors
  { name: 'GET /api/investors', method: 'get', path: () => '/api/investors', allow: ALL },
  { name: 'GET /api/investors/:id', method: 'get', path: (c) => `/api/investors/${c.investorId}`, allow: ALL },
  { name: 'POST /api/investors', method: 'post', path: () => '/api/investors', body: () => ({ investorName: 'New Inv', sector: 'Tech', countryOfOrigin: 'NG' }), allow: ADMINS },
  { name: 'PUT /api/investors/:id', method: 'put', path: (c) => `/api/investors/${c.investorId}`, body: () => ({ sector: 'Agro' }), allow: ADMINS },

  // Projects — reads
  { name: 'GET /api/projects', method: 'get', path: () => '/api/projects', allow: ALL },
  { name: 'GET /api/projects/investors/:investorId/projects', method: 'get', path: (c) => `/api/projects/investors/${c.investorId}/projects`, allow: ALL, staffAnyProject: true },
  { name: 'GET /api/projects/:id', method: 'get', path: (c) => `/api/projects/${c.projectId}`, allow: ALL, staffAnyProject: true },
  { name: 'GET /api/projects/:id/interactions', method: 'get', path: (c) => `/api/projects/${c.projectId}/interactions`, allow: ALL, staffAnyProject: true },

  // Projects — writes
  { name: 'POST /api/projects/investors/:investorId/projects', method: 'post', path: (c) => `/api/projects/investors/${c.investorId}/projects`, body: () => ({ projectTitle: 'Matrix New', lifecycleStatus: f.idea._id.toString() }), allow: ALL, projectWrite: true },
  { name: 'PUT /api/projects/:id', method: 'put', path: (c) => `/api/projects/${c.projectId}`, body: () => ({ projectTitle: 'Matrix Changed' }), allow: ALL, projectWrite: true },
  { name: 'PUT /api/projects/:id/status', method: 'put', path: (c) => `/api/projects/${c.projectId}/status`, body: () => ({ lifecycleStatus: f.lead._id.toString() }), allow: ALL, projectWrite: true },
  { name: 'POST /api/projects/:id/interactions', method: 'post', path: (c) => `/api/projects/${c.projectId}/interactions`, body: () => ({ description: 'Matrix call', category: 'Meeting' }), allow: ALL, projectWrite: true },

  // Interactions (all projects)
  { name: 'GET /api/interactions', method: 'get', path: () => '/api/interactions', allow: ALL },

  // Lifecycle statuses — Portal-Admin only
  { name: 'POST /api/lifecycle-statuses', method: 'post', path: () => '/api/lifecycle-statuses', body: () => ({ name: 'Matrix Status', order: 9 }), allow: [PA] },
  { name: 'PUT /api/lifecycle-statuses/reorder', method: 'put', path: () => '/api/lifecycle-statuses/reorder', body: () => ({ orderedIds: [f.spare._id.toString(), f.lead._id.toString(), f.idea._id.toString()] }), allow: [PA] },
  { name: 'PUT /api/lifecycle-statuses/:id', method: 'put', path: () => `/api/lifecycle-statuses/${f.spare._id}`, body: () => ({ description: 'changed' }), allow: [PA] },
  { name: 'DELETE /api/lifecycle-statuses/:id', method: 'delete', path: () => `/api/lifecycle-statuses/${f.spare._id}`, allow: [PA] },

  // Staff dashboard — Staff only (checked in the controller)
  { name: 'GET /api/staff/dashboard', method: 'get', path: () => '/api/staff/dashboard', allow: [STAFF] },

  // Admin KPIs
  { name: 'GET /api/admin/dashboard-kpis', method: 'get', path: () => '/api/admin/dashboard-kpis', allow: ADMINS },
];

const send = (route, ctx, token) => {
  let req = request(app)[route.method](route.path(ctx));
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return route.body ? req.send(route.body()) : req;
};

describe('Access matrix', () => {
  ROUTES.forEach((route) => {
    describe(route.name, () => {
      [DG, PA, STAFF].forEach((role) => {
        const allowed = route.public || route.allow.includes(role);
        it(`${role} → ${allowed ? 'allowed' : 'denied (403)'}`, async () => {
          const res = await send(route, assignedCtx(), f.tokens[role]);
          if (allowed) {
            expect([401, 403]).not.toContain(res.statusCode);
          } else {
            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('msg');
          }
        });
      });

      it(`no token → ${route.public ? 'allowed (public)' : 'denied (401)'}`, async () => {
        const res = await send(route, assignedCtx(), null);
        if (route.public) {
          expect([401, 403]).not.toContain(res.statusCode);
        } else {
          expect(res.statusCode).toBe(401);
        }
      });

      if (route.staffAnyProject) {
        it('Staff → allowed on a project of an unassigned investor (read all)', async () => {
          for (const ctx of unassignedCtxs()) {
            const res = await send(route, ctx, f.tokens[STAFF]);
            expect(res.statusCode).toBe(200);
          }
        });
      }

      if (route.projectWrite) {
        it('Staff, not assigned → denied (403), nothing changed', async () => {
          for (const ctx of unassignedCtxs()) {
            const before = {
              projects: await InvestmentProject.countDocuments(),
              logs: await InteractionLog.countDocuments(),
              project: (await InvestmentProject.findById(ctx.projectId).lean()),
            };
            const res = await send(route, ctx, f.tokens[STAFF]);
            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('msg');
            expect(await InvestmentProject.countDocuments()).toBe(before.projects);
            expect(await InteractionLog.countDocuments()).toBe(before.logs);
            const after = await InvestmentProject.findById(ctx.projectId).lean();
            expect(after.projectTitle).toBe(before.project.projectTitle);
            expect(after.lifecycleStatus.toString()).toBe(before.project.lifecycleStatus.toString());
          }
        });
      }
    });
  });

  it('ROUTES list has 26 unique entries', () => {
    expect(ROUTES.length).toBe(26);
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(ROUTES.length);
  });
});

describe('Project write edge cases (Staff)', () => {
  it('Staff can write on an assigned project (200/201, same as before)', async () => {
    const t = f.tokens[STAFF];
    const id = f.assignedProject._id;
    await request(app).put(`/api/projects/${id}`).set('Authorization', `Bearer ${t}`).send({ projectTitle: 'Staff Edit' }).expect(200);
    await request(app).put(`/api/projects/${id}/status`).set('Authorization', `Bearer ${t}`).send({ lifecycleStatus: f.lead._id.toString() }).expect(200);
    await request(app).post(`/api/projects/${id}/interactions`).set('Authorization', `Bearer ${t}`).send({ description: 'Call', category: 'Call' }).expect(201);
    await request(app).post(`/api/projects/investors/${f.assignedInvestor._id}/projects`).set('Authorization', `Bearer ${t}`)
      .send({ projectTitle: 'Staff New', lifecycleStatus: f.idea._id.toString() }).expect(201);
    expect((await InvestmentProject.findById(id)).projectTitle).toBe('Staff Edit');
  });

  it('Staff cannot move an assigned project to an investor not assigned to them', async () => {
    const res = await request(app)
      .put(`/api/projects/${f.assignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ investor: f.unassignedInvestor._id.toString() });
    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('msg');
    expect((await InvestmentProject.findById(f.assignedProject._id)).investor.toString()).toBe(f.assignedInvestor._id.toString());
  });

  it('Staff can keep the same (assigned) investor in the body', async () => {
    await request(app)
      .put(`/api/projects/${f.assignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ investor: f.assignedInvestor._id.toString(), projectTitle: 'Same Inv' })
      .expect(200);
  });

  it('Staff can send the populated investor object of an assigned investor (ProjectForm edit shape)', async () => {
    await request(app)
      .put(`/api/projects/${f.assignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ investor: { _id: f.assignedInvestor._id.toString(), investorName: 'Assigned Inv' }, projectTitle: 'Populated Shape' })
      .expect(200);
  });

  it('Staff cannot move a project via a populated investor object that is not theirs', async () => {
    const res = await request(app)
      .put(`/api/projects/${f.assignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ investor: { _id: f.unassignedInvestor._id.toString() }, projectTitle: 'Moved?' });
    expect(res.statusCode).toBe(403);
    const after = await InvestmentProject.findById(f.assignedProject._id);
    expect(after.investor.toString()).toBe(f.assignedInvestor._id.toString());
    expect(after.projectTitle).toBe('Assigned Project');
  });

  it('Staff update operators ($set) are refused with 400 and change nothing', async () => {
    const res = await request(app)
      .put(`/api/projects/${f.assignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ $set: { investor: f.unassignedInvestor._id.toString() } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ msg: 'Invalid update' });
    expect((await InvestmentProject.findById(f.assignedProject._id)).investor.toString()).toBe(f.assignedInvestor._id.toString());
  });

  it('denied status change via PUT /:id writes no System Update log', async () => {
    const logsBefore = await InteractionLog.countDocuments();
    const res = await request(app)
      .put(`/api/projects/${f.unassignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ lifecycleStatus: f.lead._id.toString() });
    expect(res.statusCode).toBe(403);
    expect((await InvestmentProject.findById(f.unassignedProject._id)).lifecycleStatus.toString()).toBe(f.idea._id.toString());
    expect(await InteractionLog.countDocuments()).toBe(logsBefore);
  });

  it('missing project id → controller response (404), not 403', async () => {
    const res = await request(app)
      .put('/api/projects/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ projectTitle: 'x' });
    expect(res.statusCode).toBe(404);
  });

  it('malformed project id → controller response, not 403', async () => {
    const res = await request(app)
      .put('/api/projects/not-an-id/status')
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ lifecycleStatus: f.lead._id.toString() });
    expect([401, 403]).not.toContain(res.statusCode);
  });

  it('missing investor id on project create → controller response, not 403', async () => {
    const res = await request(app)
      .post('/api/projects/investors/507f1f77bcf86cd799439011/projects')
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ projectTitle: 'x', lifecycleStatus: f.idea._id.toString() });
    expect([401, 403]).not.toContain(res.statusCode);
  });
});

describe('Lifecycle status reorder', () => {
  it('Portal-Admin reorder → 200 and order follows orderedIds', async () => {
    const orderedIds = [f.spare._id.toString(), f.idea._id.toString(), f.lead._id.toString()];
    await request(app)
      .put('/api/lifecycle-statuses/reorder')
      .set('Authorization', `Bearer ${global.portalAdminToken}`)
      .send({ orderedIds })
      .expect(200);

    const res = await request(app).get('/api/lifecycle-statuses').expect(200);
    expect(res.body.map((s) => s._id)).toEqual(orderedIds);
  });
});

describe('Investor writes', () => {
  it('Staff POST /api/investors → 403; no token → 401', async () => {
    await request(app).post('/api/investors').set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ investorName: 'X', sector: 'Tech', countryOfOrigin: 'NG' }).expect(403);
    await request(app).post('/api/investors').send({ investorName: 'X', sector: 'Tech', countryOfOrigin: 'NG' }).expect(401);
    expect(await Investor.countDocuments({ investorName: 'X' })).toBe(0);
  });

  it('Staff PUT /api/investors/:id → 403 (even when assigned); no token → 401', async () => {
    const id = f.assignedInvestor._id;
    await request(app).put(`/api/investors/${id}`).set('Authorization', `Bearer ${f.tokens[STAFF]}`).send({ sector: 'Agro' }).expect(403);
    await request(app).put(`/api/investors/${id}`).send({ sector: 'Agro' }).expect(401);
    expect((await Investor.findById(id)).sector).toBe('Tech');
  });
});
