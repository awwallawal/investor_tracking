// Evidence library routes (spec-evidence-library-and-bulk-attach). Fake storage
// provider only: no test reaches Cloudinary.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const ChangeLog = require('../models/ChangeLog');
const documentStorage = require('../services/documentStorage');

const MISSING_ID = '507f1f77bcf86cd799439011';

let fake;
let calls;
let staff;
let staffToken;
let dgUser;
let assigned;
let other;
let logA;
let logOther;
let project;
let top;
let sub;
let seq = 0;

const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => `Bearer ${t}`;

const makeFake = () => {
  let n = 0;
  return {
    name: 'fake',
    configured: true,
    isConfigured() { return this.configured; },
    upload: jest.fn(async () => { n += 1; calls.push('storage-upload'); return { key: `ev-${n}`, resourceType: 'raw' }; }),
    signedUrl: jest.fn(async (doc, ttl) => `https://signed.example.test/${doc.key}?ttl=${ttl}`),
    remove: jest.fn(async () => { calls.push('storage-remove'); }),
  };
};

const mkFile = (extra = {}) => {
  seq += 1;
  return EvidenceFile.create({
    folder: sub._id,
    fileName: `photo-${seq}.jpg`,
    mimeType: 'image/jpeg',
    size: 10,
    sha256: `sha-${seq}-${Date.now()}`,
    provider: 'fake',
    key: `stored-${seq}`,
    resourceType: 'image',
    uploadedBy: dgUser._id,
    uploadedAt: new Date(),
    ...extra,
  });
};

beforeEach(async () => {
  calls = [];
  await Promise.all([EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({}), ChangeLog.collection.deleteMany({})]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  dgUser = await User.findOne({ email: 'dg@example.com' });
  staff = await User.create({ name: 'Ev Staff', email: 'ev.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  assigned = await Investor.create({ investorName: 'Ev Assigned', sector: 'Agro', countryOfOrigin: 'NG', assignedTo: staff._id });
  other = await Investor.create({ investorName: 'Ev Other', sector: 'Agro', countryOfOrigin: 'NG' });
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  project = await InvestmentProject.create({ projectTitle: 'Ev Plant', investor: assigned._id, lifecycleStatus: idea._id });
  logA = await InteractionLog.create({ investor: assigned._id, loggedBy: dgUser._id, description: 'Visit', category: 'Meeting' });
  logOther = await InteractionLog.create({ investor: other._id, loggedBy: dgUser._id, description: 'Call', category: 'Call' });
  top = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes and events', order: 1 });
  sub = await EvidenceFolder.create({ key: 'programmes/forum', name: 'Forum', parent: top._id, folderDate: new Date('2025-05-15') });
  // Story 11.10: the fixtures above wrote audit create rows; start empty.
  await ChangeLog.collection.deleteMany({});
});

afterEach(() => {
  documentStorage.__setProviderForTests(null);
  jest.restoreAllMocks();
});

describe('Folders', () => {
  it('GET /folders: tree in display order, subfolders by date then key, with file and untagged counts', async () => {
    const eng = await EvidenceFolder.create({ key: 'engagements-2025', name: 'Engagements 2025', order: 0 });
    const zzz = await EvidenceFolder.create({ key: 'zzz-other', name: 'Another', order: 5 });
    await EvidenceFolder.create({ key: 'programmes/early', name: 'Early', parent: top._id, folderDate: new Date('2025-01-01') });
    await EvidenceFolder.create({ key: 'programmes/undated', name: 'Undated', parent: top._id });
    await mkFile();
    await mkFile({ links: [{ investor: assigned._id, linkedBy: dgUser._id, linkedAt: new Date() }] });

    const res = await request(app).get('/api/evidence/folders').set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.map((f) => f.key)).toEqual([eng.key, 'programmes', zzz.key]);
    const prog = res.body[1];
    expect(prog.children.map((c) => c.key)).toEqual(['programmes/early', 'programmes/forum', 'programmes/undated']);
    expect(prog.children[1]).toMatchObject({ fileCount: 2, untaggedCount: 1 });
    expect(prog).toMatchObject({ totalFiles: 2, totalUntagged: 1 });
  });

  it('POST /folders (DG/Admin): key from the parent key and the name; two levels only', async () => {
    const res = await request(app).post('/api/evidence/folders').set('Authorization', bearer(global.dgToken))
      .send({ name: 'Oyo Business Forum', parent: top._id.toString(), folderDate: '2026-11-24', description: 'Forum files' })
      .expect(201);
    expect(res.body).toMatchObject({ key: 'programmes/oyo-business-forum', name: 'Oyo Business Forum', description: 'Forum files' });
    const deeper = await request(app).post('/api/evidence/folders').set('Authorization', bearer(global.dgToken))
      .send({ name: 'Too deep', parent: res.body._id });
    expect(deeper.statusCode).toBe(400);
    const noName = await request(app).post('/api/evidence/folders').set('Authorization', bearer(global.dgToken)).send({});
    expect(noName.statusCode).toBe(400);
    const staffRes = await request(app).post('/api/evidence/folders').set('Authorization', bearer(staffToken)).send({ name: 'X' });
    expect(staffRes.statusCode).toBe(403);
  });

  it('PUT /folders/:id changes name, description and date only', async () => {
    const res = await request(app).put(`/api/evidence/folders/${sub._id}`).set('Authorization', bearer(global.portalAdminToken))
      .send({ name: 'Forum 2025', description: 'd', folderDate: '2025-05-16', key: 'hacked' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Forum 2025', description: 'd', key: 'programmes/forum' });
  });
});

describe('Files', () => {
  it('upload (DG/Admin): stored privately, server sets uploadedAt/By, audited; same content → 409 with the existing id', async () => {
    const send = () => request(app).post(`/api/evidence/folders/${sub._id}/files`).set('Authorization', bearer(global.dgToken))
      .field('documentDate', '2025-05-15').field('what', 'Programme')
      .field('uploadedAt', '2001-01-01')
      .attach('file', Buffer.from('%PDF-one'), { filename: 'programme.pdf', contentType: 'application/pdf' });
    const res = await send().expect(201);
    expect(res.body).toMatchObject({ fileName: 'programme.pdf', mimeType: 'application/pdf', what: 'Programme', links: [] });
    expect(res.body).not.toHaveProperty('key');
    expect(res.body).not.toHaveProperty('provider');
    expect(new Date(res.body.uploadedAt).getFullYear()).toBeGreaterThan(2020);
    expect(res.body.uploadedBy).toBe(dgUser._id.toString());
    expect(await ChangeLog.countDocuments({ entity: 'EvidenceFile', action: 'upload', entityId: res.body._id })).toBe(1);

    const dup = await send();
    expect(dup.statusCode).toBe(409);
    expect(dup.body.fileId).toBe(res.body._id);
    expect(fake.upload).toHaveBeenCalledTimes(1);
  });

  it('upload refuses video, audio, a future date, and Staff', async () => {
    const post = (token, name, type, date) => {
      const r = request(app).post(`/api/evidence/folders/${sub._id}/files`).set('Authorization', bearer(token));
      if (date) r.field('documentDate', date);
      return r.attach('file', Buffer.from('data'), { filename: name, contentType: type });
    };
    expect((await post(global.dgToken, 'clip.mp4', 'video/mp4')).statusCode).toBe(400);
    expect((await post(global.dgToken, 'song.mp3', 'audio/mpeg')).statusCode).toBe(400);
    expect((await post(global.dgToken, 'a.pdf', 'application/pdf', '2999-01-01')).statusCode).toBe(400);
    expect((await post(staffToken, 'a.pdf', 'application/pdf')).statusCode).toBe(403);
    expect(await EvidenceFile.countDocuments()).toBe(0);
  });

  it('an empty documentDate stays empty', async () => {
    const res = await request(app).post(`/api/evidence/folders/${sub._id}/files`).set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('%PDF-two'), { filename: 'b.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(res.body.documentDate).toBeUndefined();
  });

  it('GET /folders/:id/files with ?untagged=1', async () => {
    await mkFile();
    await mkFile({ links: [{ investor: assigned._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    const all = await request(app).get(`/api/evidence/folders/${sub._id}/files`).set('Authorization', bearer(staffToken)).expect(200);
    expect(all.body.files).toHaveLength(2);
    expect(all.body.folder).toMatchObject({ name: 'Forum' });
    expect(all.body.files[1].links[0].investor).toMatchObject({ investorName: 'Ev Assigned' });
    all.body.files.forEach((f) => expect(f).not.toHaveProperty('key'));
    const untagged = await request(app).get(`/api/evidence/folders/${sub._id}/files?untagged=1`).set('Authorization', bearer(staffToken)).expect(200);
    expect(untagged.body.files).toHaveLength(1);
  });

  it('signed link: any logged-in role; no token → 401; unknown → 404', async () => {
    const file = await mkFile();
    const res = await request(app).get(`/api/evidence/files/${file._id}/link`).set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.url).toBe(`https://signed.example.test/${file.key}?ttl=300`);
    expect((await request(app).get(`/api/evidence/files/${file._id}/link`)).statusCode).toBe(401);
    expect(fake.signedUrl).toHaveBeenCalledTimes(1);
    expect((await request(app).get(`/api/evidence/files/${MISSING_ID}/link`).set('Authorization', bearer(staffToken))).statusCode).toBe(404);
  });
});

describe('Tagging (links)', () => {
  const link = (file, body, token = staffToken) => request(app).post(`/api/evidence/files/${file._id}/links`)
    .set('Authorization', bearer(token)).send(body);
  const count = async () => (await request(app).get('/api/evidence/untagged-count').set('Authorization', bearer(staffToken)).expect(200)).body.count;

  it('Staff tags an untagged file to an assigned investor, interaction and codes; audited; untagged count drops by 1', async () => {
    const file = await mkFile();
    await mkFile();
    expect(await count()).toBe(2);
    const res = await link(file, { investor: assigned._id.toString(), interaction: logA._id.toString(), serviceCodes: ['M4', 'A1'] });
    expect(res.statusCode).toBe(201);
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0]).toMatchObject({ serviceCodes: ['M4', 'A1'], investor: { investorName: 'Ev Assigned' } });
    expect(res.body.links[0].linkedBy).toMatchObject({ name: 'Ev Staff' });
    expect(await count()).toBe(1);
    const audit = await ChangeLog.findOne({ entity: 'EvidenceFile', action: 'link', entityId: file._id }).lean();
    expect(audit.by.toString()).toBe(staff._id.toString());
    expect(audit.snapshot.link.interaction.toString()).toBe(logA._id.toString());
  });

  it('an interaction of a project of the investor is accepted', async () => {
    const pLog = await InteractionLog.create({ project: project._id, loggedBy: dgUser._id, description: 'P', category: 'Meeting' });
    const file = await mkFile();
    expect((await link(file, { investor: assigned._id.toString(), interaction: pLog._id.toString() })).statusCode).toBe(201);
  });

  it('bad code or an interaction of another investor → 400; Staff on an unassigned investor → 403; nothing saved', async () => {
    const file = await mkFile();
    expect((await link(file, { investor: assigned._id.toString(), serviceCodes: ['Z9'] })).statusCode).toBe(400);
    expect((await link(file, { investor: assigned._id.toString(), interaction: logOther._id.toString() })).statusCode).toBe(400);
    expect((await link(file, { investor: MISSING_ID })).statusCode).toBe(400);
    const denied = await link(file, { investor: other._id.toString() });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toHaveProperty('msg');
    expect((await link(file, { investor: other._id.toString() }, global.dgToken)).statusCode).toBe(201);
    expect((await link(file, { investor: other._id.toString() }, global.dgToken)).statusCode).toBe(409);
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(1);
    expect(await ChangeLog.countDocuments({ action: 'link' })).toBe(1);
  });

  it('unlink: DG/Admin only, audited first, file kept', async () => {
    const file = await mkFile({ links: [{ investor: assigned._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    const linkId = file.links[0]._id;
    expect((await request(app).delete(`/api/evidence/files/${file._id}/links/${linkId}`).set('Authorization', bearer(staffToken))).statusCode).toBe(403);
    await request(app).delete(`/api/evidence/files/${file._id}/links/${linkId}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'Wrong investor' }).expect(200);
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(0);
    expect(await ChangeLog.countDocuments({ action: 'unlink', reason: 'Wrong investor' })).toBe(1);
  });
});

describe('Delete file', () => {
  it('reason required, DG/Admin only; order: audit → storage → database', async () => {
    const file = await mkFile();
    expect((await request(app).delete(`/api/evidence/files/${file._id}`).set('Authorization', bearer(staffToken)).send({ reason: 'x' })).statusCode).toBe(403);
    expect((await request(app).delete(`/api/evidence/files/${file._id}`).set('Authorization', bearer(global.dgToken)).send({})).statusCode).toBe(400);
    expect(await EvidenceFile.exists({ _id: file._id })).toBeTruthy();

    const realInsert = ChangeLog.insertMany.bind(ChangeLog);
    jest.spyOn(ChangeLog, 'insertMany').mockImplementation(async (...args) => {
      calls.push('audit');
      return realInsert(...args);
    });
    const realDelete = EvidenceFile.deleteOne.bind(EvidenceFile);
    jest.spyOn(EvidenceFile, 'deleteOne').mockImplementation((...args) => {
      calls.push('db-delete');
      return realDelete(...args);
    });
    await request(app).delete(`/api/evidence/files/${file._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'Duplicate scan' }).expect(200);
    expect(calls).toEqual(['audit', 'storage-remove', 'db-delete']);
    expect(await EvidenceFile.exists({ _id: file._id })).toBeNull();
    const row = await ChangeLog.findOne({ entity: 'EvidenceFile', action: 'delete' }).lean();
    expect(row).toMatchObject({ reason: 'Duplicate scan' });
  });

  it('audit failure → 500 and nothing removed', async () => {
    const file = await mkFile();
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValue(new Error('down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).delete(`/api/evidence/files/${file._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' });
    expect(res.statusCode).toBe(500);
    expect(fake.remove).not.toHaveBeenCalled();
    expect(await EvidenceFile.exists({ _id: file._id })).toBeTruthy();
  });
});

describe('Interactions and deletes', () => {
  it('a file linked to an interaction shows on the investor timeline and the project list under evidenceFiles', async () => {
    const pLog = await InteractionLog.create({ project: project._id, loggedBy: dgUser._id, description: 'P', category: 'Meeting' });
    const file = await mkFile({
      documentDate: new Date('2025-05-15'),
      links: [
        { investor: assigned._id, interaction: logA._id, linkedBy: dgUser._id, linkedAt: new Date() },
        { investor: assigned._id, interaction: pLog._id, linkedBy: dgUser._id, linkedAt: new Date() },
      ],
    });
    const res = await request(app).get(`/api/interactions/investors/${assigned._id}`).set('Authorization', bearer(staffToken)).expect(200);
    const visit = res.body.find((l) => l._id === logA._id.toString());
    expect(visit.evidenceFiles).toEqual([expect.objectContaining({ _id: file._id.toString(), fileName: file.fileName, mimeType: 'image/jpeg', size: 10 })]);
    expect(visit.evidenceFiles[0]).not.toHaveProperty('key');
    const projectRes = await request(app).get(`/api/projects/${project._id}/interactions`).set('Authorization', bearer(staffToken)).expect(200);
    expect(projectRes.body[0].evidenceFiles).toHaveLength(1);
  });

  it('deleting an investor removes the links to it and its interactions (audited); the files stay', async () => {
    const f1 = await mkFile({ links: [{ investor: other._id, interaction: logOther._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    const f2 = await mkFile({
      links: [
        { investor: other._id, linkedBy: dgUser._id, linkedAt: new Date() },
        { investor: assigned._id, linkedBy: dgUser._id, linkedAt: new Date() },
      ],
    });
    const res = await request(app).delete(`/api/investors/${other._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'Test record' }).expect(200);
    expect(res.body.deleted.evidenceLinks).toBe(2);
    expect((await EvidenceFile.findById(f1._id).lean()).links).toHaveLength(0);
    expect((await EvidenceFile.findById(f2._id).lean()).links).toHaveLength(1);
    const unlinks = await ChangeLog.find({ action: 'unlink' }).lean();
    expect(unlinks).toHaveLength(2);
    const del = await ChangeLog.findOne({ entity: 'Investor', action: 'delete' }).lean();
    expect(unlinks[0].batchId).toBe(del.batchId);
  });

  it('deleting an interaction removes the links to it (audited); the file stays', async () => {
    const f = await mkFile({ links: [{ investor: assigned._id, interaction: logA._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    await request(app).delete(`/api/interactions/${logA._id}`).set('Authorization', bearer(global.dgToken)).expect(200);
    expect(await EvidenceFile.exists({ _id: f._id })).toBeTruthy();
    expect((await EvidenceFile.findById(f._id).lean()).links).toHaveLength(0);
    expect(await ChangeLog.countDocuments({ action: 'unlink', entityId: f._id })).toBe(1);
  });
});

describe('Failures and races', () => {
  const auditDown = () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    return jest.spyOn(ChangeLog, 'insertMany').mockRejectedValue(new Error('audit down'));
  };
  const upload = () => request(app).post(`/api/evidence/folders/${sub._id}/files`).set('Authorization', bearer(global.dgToken))
    .attach('file', Buffer.from('%PDF-race'), { filename: 'race.pdf', contentType: 'application/pdf' });

  it('upload: audit failure → 500, the stored copy removed, no EvidenceFile', async () => {
    auditDown();
    const res = await upload();
    expect(res.statusCode).toBe(500);
    expect(fake.remove).toHaveBeenCalledWith(expect.objectContaining({ key: 'ev-1' }));
    expect(await EvidenceFile.countDocuments()).toBe(0);
  });

  it('upload: create failure → 500 and the stored copy removed', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(EvidenceFile, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await upload();
    expect(res.statusCode).toBe(500);
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(await ChangeLog.countDocuments()).toBe(0);
  });

  it('link: audit failure → 500 and links unchanged', async () => {
    const file = await mkFile();
    auditDown();
    const res = await request(app).post(`/api/evidence/files/${file._id}/links`).set('Authorization', bearer(global.dgToken))
      .send({ investor: assigned._id.toString() });
    expect(res.statusCode).toBe(500);
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(0);
  });

  it('unlink: audit failure → 500 and links unchanged', async () => {
    const file = await mkFile({ links: [{ investor: assigned._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    auditDown();
    const res = await request(app).delete(`/api/evidence/files/${file._id}/links/${file.links[0]._id}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(500);
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(1);
  });

  it('two identical link requests at once → one 201, one 409, one link and one audit row', async () => {
    const file = await mkFile();
    const send = () => request(app).post(`/api/evidence/files/${file._id}/links`).set('Authorization', bearer(global.dgToken))
      .send({ investor: assigned._id.toString(), interaction: logA._id.toString() });
    const codes = (await Promise.all([send(), send()])).map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409]);
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(1);
    expect(await ChangeLog.countDocuments({ action: 'link' })).toBe(1);
  });

  it('link to a file deleted meanwhile → 404', async () => {
    const file = await mkFile();
    const realUpdate = EvidenceFile.updateOne.bind(EvidenceFile);
    jest.spyOn(EvidenceFile, 'updateOne').mockImplementationOnce(async (...args) => {
      await EvidenceFile.collection.deleteOne({ _id: file._id });
      return realUpdate(...args);
    });
    const res = await request(app).post(`/api/evidence/files/${file._id}/links`).set('Authorization', bearer(global.dgToken))
      .send({ investor: assigned._id.toString() });
    expect(res.statusCode).toBe(404);
  });

  it('delete investor with linked files: combined audit insert fails → 500, everything kept', async () => {
    const file = await mkFile({ links: [{ investor: other._id, interaction: logOther._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    auditDown();
    const res = await request(app).delete(`/api/investors/${other._id}`).set('Authorization', bearer(global.dgToken)).send({ reason: 'x' });
    expect(res.statusCode).toBe(500);
    expect(ChangeLog.insertMany).toHaveBeenCalledTimes(1);
    expect(await Investor.exists({ _id: other._id })).toBeTruthy();
    expect(await InteractionLog.exists({ _id: logOther._id })).toBeTruthy();
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(1);
  });

  it('delete interaction with linked files: combined audit insert fails → 500, everything kept', async () => {
    const file = await mkFile({ links: [{ investor: assigned._id, interaction: logA._id, linkedBy: dgUser._id, linkedAt: new Date() }] });
    auditDown();
    const res = await request(app).delete(`/api/interactions/${logA._id}`).set('Authorization', bearer(global.dgToken));
    expect(res.statusCode).toBe(500);
    expect(ChangeLog.insertMany).toHaveBeenCalledTimes(1);
    expect(await InteractionLog.exists({ _id: logA._id })).toBeTruthy();
    expect((await EvidenceFile.findById(file._id).lean()).links).toHaveLength(1);
  });

  it('folders: no body → 400 (not 500); a name over 200 characters → 400; a duplicate key → 409', async () => {
    const post = (body) => {
      const r = request(app).post('/api/evidence/folders').set('Authorization', bearer(global.dgToken));
      return body === undefined ? r : r.send(body);
    };
    expect((await post()).statusCode).toBe(400);
    expect((await post({ name: `  ${'x'.repeat(201)}  ` })).statusCode).toBe(400);
    expect((await post({ name: `  ${'x'.repeat(200)}  ` })).statusCode).toBe(201);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const dup = new Error('dup');
    dup.code = 11000;
    jest.spyOn(EvidenceFolder, 'create').mockRejectedValueOnce(dup);
    expect((await post({ name: 'Race' })).statusCode).toBe(409);
    expect((await request(app).put(`/api/evidence/folders/${sub._id}`).set('Authorization', bearer(global.dgToken))).statusCode).toBe(200);
  });

  it('a top-level folder lists its subfolders with counts', async () => {
    await mkFile();
    const res = await request(app).get(`/api/evidence/folders/${top._id}/files`).set('Authorization', bearer(staffToken)).expect(200);
    expect(res.body.subfolders).toEqual([expect.objectContaining({ _id: sub._id.toString(), name: 'Forum', fileCount: 1, untaggedCount: 1 })]);
  });
});

describe('Investor email: empty means no email', () => {
  const base = { sector: 'Agribusiness', countryOfOrigin: 'NG', leadSource: 'Other' };
  it("two investors created with email '' (or spaces) are both saved with no email", async () => {
    const a = await request(app).post('/api/investors').set('Authorization', bearer(global.dgToken)).send({ ...base, investorName: 'No Mail One', email: '' });
    const b = await request(app).post('/api/investors').set('Authorization', bearer(global.dgToken)).send({ ...base, investorName: 'No Mail Two', email: '   ' });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    const stored = await Investor.find({ investorName: /^No Mail/ }).lean();
    stored.forEach((i) => expect(i).not.toHaveProperty('email'));
  });

  it("an update to '' unsets the email", async () => {
    const inv = await Investor.create({ ...base, investorName: 'Has Mail', email: 'has.mail@example.test' });
    await Investor.create({ ...base, investorName: 'Also None' });
    const res = await request(app).put(`/api/investors/${inv._id}`).set('Authorization', bearer(global.dgToken)).send({ email: '', sector: 'Technology and ICT' });
    expect(res.statusCode).toBe(200);
    const stored = await Investor.findById(inv._id).lean();
    expect(stored).not.toHaveProperty('email');
    expect(stored.sector).toBe('Technology and ICT');
  });
});
