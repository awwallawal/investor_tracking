// Route × role access matrix. Every mounted route is checked against
// Director-General (DG), Portal-Admin (PA), Staff and no token. Project writes
// are also checked for Staff on a project whose investor is not assigned to them,
// and investor edits for Staff on an investor not assigned to them.
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
const ChangeLog = require('../models/ChangeLog');
const documentStorage = require('../services/documentStorage');

// Document routes (11.4b) use a fake storage provider: no test reaches Cloudinary.
const fakeStorage = {
  name: 'fake',
  isConfigured: () => true,
  upload: async () => ({ key: `matrix-${Date.now()}-${Math.random()}`, resourceType: 'raw' }),
  signedUrl: async (doc) => `https://signed.example.test/${doc.key}`,
  remove: async () => {},
};
afterAll(() => documentStorage.__setProviderForTests(null));

const DG = 'DG';
const PA = 'PA';
const STAFF = 'Staff';
const ALL = [DG, PA, STAFF];
const ADMINS = [DG, PA];

let f; // fixtures, rebuilt before every test (jest.setup.js wipes the DB)
let inviteSeq = 0;

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(async () => {
  documentStorage.__setProviderForTests(fakeStorage);
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

  // One interaction per project, for PATCH /api/interactions/:id (Tag services)
  // Each carries one stored document, for the document link/remove routes (11.4b).
  const mkLog = (project) => InteractionLog.create({
    project: project._id,
    loggedBy: staff._id,
    description: 'Old meeting',
    category: 'Meeting',
    documents: [{
      fileName: 'scan.pdf', mimeType: 'application/pdf', size: 4, uploadedBy: staff._id, uploadedAt: new Date(), provider: 'fake', key: `k-${project._id}`, resourceType: 'raw',
    }],
  });
  const assignedLog = await mkLog(assignedProject);
  const unassignedLog = await mkLog(unassignedProject);
  const otherLog = await mkLog(otherProject);

  f = {
    tokens: { [DG]: global.dgToken, [PA]: global.portalAdminToken, [STAFF]: sign(staff) },
    staff, revokeTarget, idea, lead, spare,
    assignedInvestor, unassignedInvestor, otherInvestor,
    assignedProject, unassignedProject, otherProject,
    assignedLog, unassignedLog, otherLog,
  };
});

// ctx: { investorId, projectId } — the project/investor a request targets.
const ctxFor = (investor, project, log) => ({
  investorId: investor._id.toString(), projectId: project._id.toString(), logId: log._id.toString(), docId: log.documents[0]._id.toString(),
});
const assignedCtx = () => ctxFor(f.assignedInvestor, f.assignedProject, f.assignedLog);
const unassignedCtxs = () => [
  { label: 'investor unassigned', ...ctxFor(f.unassignedInvestor, f.unassignedProject, f.unassignedLog) },
  { label: 'investor assigned to other staff', ...ctxFor(f.otherInvestor, f.otherProject, f.otherLog) },
];

// allow: roles that get through. public: no token needed.
// projectWrite: also run Staff against unassigned projects (expect 403, nothing changed).
// investorWrite: also run Staff against unassigned investors (expect 403, nothing changed).
// tagWrite: also run Staff against interactions of unassigned investors (expect 403, log unchanged).
// adminDelete: Staff 403 leaves every investor, project, log and ChangeLog row in place.
// attach: send as multipart with this file (document upload, 11.4b).
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
  { name: 'POST /api/investors', method: 'post', path: () => '/api/investors', body: () => ({ investorName: 'New Inv', sector: 'Tech', countryOfOrigin: 'NG', leadSource: 'Other' }), allow: ALL },
  { name: 'PUT /api/investors/:id', method: 'put', path: (c) => `/api/investors/${c.investorId}`, body: () => ({ sector: 'Agro' }), allow: ALL, investorWrite: true },
  // Import investors (story 11.11) — DG/Admin only. The dry run writes nothing;
  // the run with a wrong confirmation is refused (400) and writes nothing.
  { name: 'POST /api/investors/import/dry-run', method: 'post', path: () => '/api/investors/import/dry-run', attach: { field: 'file', buffer: Buffer.from(JSON.stringify({ records: [] })), filename: 'import.json', contentType: 'application/json' }, allow: ADMINS, adminDelete: true },
  { name: 'POST /api/investors/import/run', method: 'post', path: () => '/api/investors/import/run', attach: { field: 'file', buffer: Buffer.from(JSON.stringify({ records: [] })), filename: 'import.json', contentType: 'application/json' }, allow: ADMINS, adminDelete: true },
  { name: 'DELETE /api/investors/:id', method: 'delete', path: (c) => `/api/investors/${c.investorId}`, body: () => ({ reason: 'Matrix cleanup' }), allow: ADMINS, adminDelete: true },

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

  // Interactions at investor level (story 11.4)
  { name: 'POST /api/interactions/investors/:investorId', method: 'post', path: (c) => `/api/interactions/investors/${c.investorId}`, body: () => ({ description: 'Briefing letter sent to NIPC', category: 'Email', serviceCodes: ['M4'] }), allow: ALL, projectWrite: true },
  { name: 'GET /api/interactions/investors/:investorId', method: 'get', path: (c) => `/api/interactions/investors/${c.investorId}`, allow: ALL, staffAnyProject: true },
  { name: 'PATCH /api/interactions/:id', method: 'patch', path: (c) => `/api/interactions/${c.logId}`, body: () => ({ serviceCodes: ['A8'], creditLinkage: true }), allow: ALL, tagWrite: true },
  { name: 'DELETE /api/interactions/:id', method: 'delete', path: (c) => `/api/interactions/${c.logId}`, allow: ADMINS, adminDelete: true },

  // Private documents (story 11.4b)
  { name: 'POST /api/interactions/:id/documents', method: 'post', path: (c) => `/api/interactions/${c.logId}/documents`, attach: { field: 'file', buffer: Buffer.from('%PDF-1.4'), filename: 'matrix.pdf', contentType: 'application/pdf' }, allow: ALL, tagWrite: true },
  { name: 'GET /api/interactions/:id/documents/:docId/link', method: 'get', path: (c) => `/api/interactions/${c.logId}/documents/${c.docId}/link`, allow: ALL, staffAnyProject: true },
  { name: 'DELETE /api/interactions/:id/documents/:docId', method: 'delete', path: (c) => `/api/interactions/${c.logId}/documents/${c.docId}`, allow: ADMINS, adminDelete: true },

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
  if (route.attach) {
    const { field, buffer, filename, contentType } = route.attach;
    return req.attach(field, buffer, { filename, contentType });
  }
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

      if (route.tagWrite) {
        it('Staff, not assigned → denied (403), interaction unchanged', async () => {
          for (const ctx of unassignedCtxs()) {
            const before = await InteractionLog.findById(ctx.logId).lean();
            const res = await send(route, ctx, f.tokens[STAFF]);
            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({ msg: 'Forbidden: You can only change projects of investors assigned to you' });
            const after = await InteractionLog.findById(ctx.logId).lean();
            expect(after.serviceCodes).toEqual(before.serviceCodes);
            expect(after.creditLinkage).toBe(before.creditLinkage);
            expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
            expect(after.documents).toHaveLength(before.documents.length);
          }
        });
      }

      if (route.adminDelete) {
        it('Staff → 403, nothing deleted, no ChangeLog row', async () => {
          const count = async () => ({
            investors: await Investor.countDocuments(),
            projects: await InvestmentProject.countDocuments(),
            logs: await InteractionLog.countDocuments(),
            documents: (await InteractionLog.find({}).lean()).reduce((n, l) => n + (l.documents || []).length, 0),
            changeLog: await ChangeLog.countDocuments(),
          });
          const before = await count();
          const res = await send(route, assignedCtx(), f.tokens[STAFF]);
          expect(res.statusCode).toBe(403);
          expect(await count()).toEqual(before);
        });
      }

      if (route.investorWrite) {
        it('Staff, not assigned → denied (403), nothing changed', async () => {
          for (const ctx of unassignedCtxs()) {
            const before = await Investor.findById(ctx.investorId).lean();
            const res = await send(route, ctx, f.tokens[STAFF]);
            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({ msg: 'Forbidden: You can only change investors assigned to you' });
            const after = await Investor.findById(ctx.investorId).lean();
            expect(after.sector).toBe(before.sector);
            expect(String(after.assignedTo)).toBe(String(before.assignedTo));
          }
        });
      }
    });
  });

  it('ROUTES list has 36 unique entries', () => {
    expect(ROUTES.length).toBe(36);
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

  it('Staff project PUT with an array (pipeline) body → 400 Invalid update, investor unchanged', async () => {
    const res = await request(app)
      .put(`/api/projects/${f.assignedProject._id}`)
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send([{ $set: { investor: f.unassignedInvestor._id.toString() } }]);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ msg: 'Invalid update' });
    expect((await InvestmentProject.findById(f.assignedProject._id)).investor.toString()).toBe(f.assignedInvestor._id.toString());
  });

  it('lookup error on a Staff project write → 500 (fail closed), project unchanged', async () => {
    const spy = jest.spyOn(InvestmentProject, 'findById').mockImplementationOnce(() => ({
      select: () => Promise.reject(new Error('db down')),
    }));
    try {
      const res = await request(app)
        .put(`/api/projects/${f.assignedProject._id}`)
        .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
        .send({ projectTitle: 'Should Not Save' });
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ msg: 'Server Error' });
    } finally {
      spy.mockRestore();
    }
    expect((await InvestmentProject.findById(f.assignedProject._id)).projectTitle).toBe('Assigned Project');
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

  it('missing investor id on project create → 404 Investor not found, not 403', async () => {
    const before = await InvestmentProject.countDocuments();
    const res = await request(app)
      .post('/api/projects/investors/507f1f77bcf86cd799439011/projects')
      .set('Authorization', `Bearer ${f.tokens[STAFF]}`)
      .send({ projectTitle: 'x', lifecycleStatus: f.idea._id.toString() });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ msg: 'Investor not found' });
    expect(await InvestmentProject.countDocuments()).toBe(before);
  });
});

describe('Orphan projects', () => {
  [DG, PA, STAFF].forEach((role) => {
    it(`${role} POST project for a valid but missing investor id → 404, no project saved`, async () => {
      const before = await InvestmentProject.countDocuments();
      const res = await request(app)
        .post('/api/projects/investors/507f1f77bcf86cd799439011/projects')
        .set('Authorization', `Bearer ${f.tokens[role]}`)
        .send({ projectTitle: 'Orphan', lifecycleStatus: f.idea._id.toString() });
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ msg: 'Investor not found' });
      expect(await InvestmentProject.countDocuments()).toBe(before);
    });
  });

  it.each([
    ['id string', (id) => id],
    ['populated object', (id) => ({ _id: id, investorName: 'Ghost' })],
  ])('DG/Admin PUT project with a missing investor (%s) → 404, project unchanged', async (_label, shape) => {
    for (const role of ADMINS) {
      const res = await request(app)
        .put(`/api/projects/${f.unassignedProject._id}`)
        .set('Authorization', `Bearer ${f.tokens[role]}`)
        .send({ investor: shape('507f1f77bcf86cd799439011'), projectTitle: 'Moved To Ghost' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ msg: 'Investor not found' });
      const after = await InvestmentProject.findById(f.unassignedProject._id);
      expect(after.investor.toString()).toBe(f.unassignedInvestor._id.toString());
      expect(after.projectTitle).toBe('Unassigned Project');
    }
  });

  it('malformed investor id on project create keeps the existing 400 path', async () => {
    const res = await request(app)
      .post('/api/projects/investors/not-an-id/projects')
      .set('Authorization', `Bearer ${global.dgToken}`)
      .send({ projectTitle: 'Bad', lifecycleStatus: f.idea._id.toString() });
    expect(res.statusCode).toBe(400);
    expect(await InvestmentProject.countDocuments({ projectTitle: 'Bad' })).toBe(0);
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
  const put = (id, token, body) => {
    let r = request(app).put(`/api/investors/${id}`);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return r.send(body);
  };
  const post = (token, body) => {
    let r = request(app).post('/api/investors');
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return r.send(body);
  };
  const base = { sector: 'Tech', countryOfOrigin: 'NG', leadSource: 'Other' };

  it('Staff create without assignedTo → 201, assigned to that Staff user', async () => {
    const res = await post(f.tokens[STAFF], { investorName: 'Staff New A', ...base });
    expect(res.statusCode).toBe(201);
    expect(String(res.body.assignedTo)).toBe(f.staff._id.toString());
    expect(String((await Investor.findOne({ investorName: 'Staff New A' })).assignedTo)).toBe(f.staff._id.toString());
  });

  it('Staff create with assignedTo = someone else → 201, still assigned to that Staff user', async () => {
    const res = await post(f.tokens[STAFF], { investorName: 'Staff New B', ...base, assignedTo: f.otherInvestor.assignedTo.toString() });
    expect(res.statusCode).toBe(201);
    expect(String((await Investor.findOne({ investorName: 'Staff New B' })).assignedTo)).toBe(f.staff._id.toString());
  });

  it('DG/Admin create with assignedTo = X → 201, assignedTo = X', async () => {
    const x = f.staff._id.toString();
    for (const role of ADMINS) {
      const name = `Admin New ${role}`;
      const res = await post(f.tokens[role], { investorName: name, ...base, assignedTo: x });
      expect(res.statusCode).toBe(201);
      expect(String((await Investor.findOne({ investorName: name })).assignedTo)).toBe(x);
    }
  });

  it('Staff edit, assigned → 200, fields updated', async () => {
    const res = await put(f.assignedInvestor._id, f.tokens[STAFF], { sector: 'Agro' });
    expect(res.statusCode).toBe(200);
    expect((await Investor.findById(f.assignedInvestor._id)).sector).toBe('Agro');
  });

  it('Staff cannot change assignment (other id / null / populated object): 200, assignedTo unchanged', async () => {
    const id = f.assignedInvestor._id;
    const otherStaffId = f.otherInvestor.assignedTo.toString();
    const bodies = [
      { sector: 'Agro', assignedTo: otherStaffId },
      { sector: 'Mining', assignedTo: null },
      { sector: 'Energy', assignedTo: { _id: otherStaffId, name: 'Other Staff' } },
    ];
    for (const body of bodies) {
      const res = await put(id, f.tokens[STAFF], body);
      expect(res.statusCode).toBe(200);
      const after = await Investor.findById(id);
      expect(after.sector).toBe(body.sector);
      expect(String(after.assignedTo)).toBe(f.staff._id.toString());
    }
  });

  it('Staff $-operator keys → 400 Invalid update, nothing changed', async () => {
    const id = f.assignedInvestor._id;
    const res = await put(id, f.tokens[STAFF], { $set: { assignedTo: null, sector: 'Agro' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ msg: 'Invalid update' });
    const after = await Investor.findById(id);
    expect(after.sector).toBe('Tech');
    expect(String(after.assignedTo)).toBe(f.staff._id.toString());

    const before = await Investor.countDocuments();
    const res2 = await post(f.tokens[STAFF], { investorName: 'Op Inv', ...base, $set: { assignedTo: null } });
    expect(res2.statusCode).toBe(400);
    expect(res2.body).toEqual({ msg: 'Invalid update' });
    expect(await Investor.countDocuments()).toBe(before);
  });

  it('Staff edit on a missing investor id → controller 404, not 403', async () => {
    const res = await put('507f1f77bcf86cd799439011', f.tokens[STAFF], { sector: 'Agro' });
    expect(res.statusCode).toBe(404);
  });

  it('Staff edit on a malformed investor id → controller 400 (cast error), not 403', async () => {
    const res = await put('not-an-id', f.tokens[STAFF], { sector: 'Agro' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('Staff PUT with an array (pipeline) body → 400 Invalid update, assignedTo unchanged', async () => {
    const id = f.assignedInvestor._id;
    const res = await put(id, f.tokens[STAFF], [{ $set: { assignedTo: null, sector: 'Agro' } }]);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ msg: 'Invalid update' });
    const after = await Investor.findById(id);
    expect(after.sector).toBe('Tech');
    expect(String(after.assignedTo)).toBe(f.staff._id.toString());
  });

  it('Staff POST with an array body → 400 Invalid update, no investor created', async () => {
    const before = await Investor.countDocuments();
    const res = await post(f.tokens[STAFF], [
      { investorName: 'Arr A', ...base, assignedTo: null },
      { investorName: 'Arr B', ...base },
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ msg: 'Invalid update' });
    expect(await Investor.countDocuments()).toBe(before);
  });

  it('lookup error on a Staff edit → 500 (fail closed), investor unchanged', async () => {
    const spy = jest.spyOn(Investor, 'exists').mockRejectedValueOnce(new Error('db down'));
    try {
      const res = await put(f.assignedInvestor._id, f.tokens[STAFF], { sector: 'Agro', assignedTo: null });
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ msg: 'Server Error' });
    } finally {
      spy.mockRestore();
    }
    const after = await Investor.findById(f.assignedInvestor._id);
    expect(after.sector).toBe('Tech');
    expect(String(after.assignedTo)).toBe(f.staff._id.toString());
  });

  it('DG/Admin edit can still change assignment', async () => {
    const res = await put(f.unassignedInvestor._id, global.dgToken, { assignedTo: f.staff._id.toString() });
    expect(res.statusCode).toBe(200);
    expect(String((await Investor.findById(f.unassignedInvestor._id)).assignedTo)).toBe(f.staff._id.toString());
  });

  it('no token → 401 on POST and PUT', async () => {
    await post(null, { investorName: 'X', ...base }).expect(401);
    await put(f.assignedInvestor._id, null, { sector: 'Agro' }).expect(401);
    expect(await Investor.countDocuments({ investorName: 'X' })).toBe(0);
    expect((await Investor.findById(f.assignedInvestor._id)).sector).toBe('Tech');
  });
});
