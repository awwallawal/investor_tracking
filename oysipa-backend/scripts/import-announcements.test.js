// Announcements loader (story 11.8). Synthetic files in a temp dir and a fake
// storage provider only: no real announcements, no Cloudinary.
const fs = require('fs');
const mongoose = require('mongoose');
const os = require('os');
const path = require('path');
const User = require('../src/models/User');
const Investor = require('../src/models/InvestorModel');
const InvestmentProject = require('../src/models/InvestmentProject');
const InteractionLog = require('../src/models/InteractionLog');
const LifecycleStatus = require('../src/models/LifecycleStatusModel');
const InvestmentAnnouncement = require('../src/models/InvestmentAnnouncement');
const EvidenceFolder = require('../src/models/EvidenceFolder');
const EvidenceFile = require('../src/models/EvidenceFile');
const ChangeLog = require('../src/models/ChangeLog');
const documentStorage = require('../src/services/documentStorage');
const { parseAnnouncementsFile } = require('../src/services/announcementImport');
const { parseArgs, run } = require('./import-announcements');

let dir;
let lines;
let dg;
let fake;
let investorA;
let projectA;
let logA;
let logB;
const log = (l) => lines.push(l);

const write = (rel, content) => {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return rel;
};

const makeFake = () => {
  let n = 0;
  return {
    name: 'fake',
    isConfigured: () => true,
    upload: jest.fn(async () => { n += 1; return { key: `ann-bulk-${n}`, resourceType: 'raw' }; }),
    signedUrl: jest.fn(async (doc) => `https://signed.example.test/${doc.key}`),
    remove: jest.fn(async () => {}),
  };
};

const row = (o) => ({
  id: 'ANN-S1',
  investorName: 'Synthetic Ann A',
  projectTitle: 'Synthetic Ann Plant',
  announcementDate: '2026-03-10',
  outlet: 'Synthetic Gazette',
  url: 'https://news.example.test/s1',
  archivedCopyUrl: 'https://archive.example.test/s1',
  oysipaNamed: true,
  oysipaRoleText: 'Synthetic facilitation',
  supportingInteractionRefs: [],
  archivedFiles: [],
  note: 'Synthetic note',
  ...o,
});

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  lines = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'announcements-cli-'));
  await Promise.all([
    InvestmentAnnouncement.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({}), ChangeLog.collection.deleteMany({}),
  ]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  dg = await User.findOne({ email: 'dg@example.com' });
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  investorA = await Investor.create({ investorName: 'Synthetic Ann A', sector: 'Agro', countryOfOrigin: 'NG' });
  const investorB = await Investor.create({ investorName: 'Synthetic Ann B', sector: 'Agro', countryOfOrigin: 'NG' });
  projectA = await InvestmentProject.create({ projectTitle: 'Synthetic Ann Plant', investor: investorA._id, lifecycleStatus: idea._id });
  await InvestmentProject.create({ projectTitle: 'Synthetic Ann B Plant', investor: investorB._id, lifecycleStatus: idea._id });
  // Same title twice under B: ambiguous.
  await InvestmentProject.create({ projectTitle: 'Twin', investor: investorB._id, lifecycleStatus: idea._id });
  await InvestmentProject.create({ projectTitle: 'Twin', investor: investorB._id, lifecycleStatus: idea._id });
  logA = await InteractionLog.create({
    investor: investorA._id, loggedBy: dg._id, description: 'Synthetic', category: 'Meeting', importRef: 'INT-A1',
  });
  logB = await InteractionLog.create({
    investor: investorB._id, loggedBy: dg._id, description: 'Synthetic', category: 'Meeting', importRef: 'INT-B1',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  documentStorage.__setProviderForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const fileData = () => {
  const shared = write('evidence/announcements/shared.pdf', '%PDF-shared');
  return {
    announcements: [
      row({ supportingInteractionRefs: ['INT-A1', 'INT-B1', 'INT-NONE'], archivedFiles: [write('evidence/announcements/s1.pdf', '%PDF-s1'), shared] }),
      row({ id: 'ANN-S2', oysipaNamed: false, oysipaRoleText: undefined, archivedFiles: [shared] }),
      row({ id: 'ANN-S3', projectTitle: 'No such project' }),
      row({ id: 'ANN-S4', investorName: 'Synthetic Ann B', projectTitle: 'Twin' }),
    ],
  };
};

describe('import-announcements CLI', () => {
  it('parses args: dry run by default; --apply needs --as', () => {
    expect(parseArgs(['--file', 'a.json'])).toMatchObject({ file: 'a.json', apply: false, uriEnv: 'MONGO_URI' });
    expect(() => parseArgs(['--file', 'a.json', '--apply'])).toThrow(/--as/);
  });

  it('parses the file', () => {
    expect(() => parseAnnouncementsFile('{"issues":[]}')).toThrow(/announcements/);
    expect(() => parseAnnouncementsFile('nope')).toThrow(/JSON/);
  });

  it('dry run: counts only; unknown / ambiguous project → row errors; bad interaction refs → warnings; nothing written', async () => {
    const { plan } = await run({ data: fileData(), filesRoot: dir, log });
    expect(plan.counts).toMatchObject({
      announcements: 4, toCreate: 2, existing: 0, errors: 2, warnings: 2, interactionLinks: 1, files: 3, filesToUpload: 2, linksToAdd: 3,
    });
    expect(plan.errors.map((e) => e.ref).sort()).toEqual(['ANN-S3', 'ANN-S4']);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(fake.upload).not.toHaveBeenCalled();
    // The report holds refs and counts, never names.
    const out = lines.join('\n');
    expect(out).not.toMatch(/Synthetic Ann|Synthetic Gazette|Twin|No such project/);
  });

  it('apply: announcements, folder, files once by sha256, links, audit; a repeat creates 0 and uploads 0', async () => {
    const { result } = await run({
      data: fileData(), filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(result.counts).toMatchObject({ announcementsCreated: 2, filesUploaded: 2, linksAdded: 3 });
    expect(result.errors).toEqual([]);
    const s1 = await InvestmentAnnouncement.findOne({ importRef: 'ANN-S1' }).lean();
    expect(String(s1.project)).toBe(String(projectA._id));
    expect(s1.supportingInteractions.map(String)).toEqual([String(logA._id)]);
    expect(s1.importNote).toBe('Synthetic note');
    expect(String(s1.createdBy)).toBe(String(dg._id));
    expect(s1.importBatchId).toBe(result.batchId);
    expect(s1.announcementDate.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    const files = await EvidenceFile.find({}).lean();
    expect(files).toHaveLength(2);
    files.forEach((f) => f.links.forEach((l) => expect(String(l.investor)).toBe(String(investorA._id))));
    expect(files.flatMap((f) => f.links)).toHaveLength(3);
    const folder = await EvidenceFolder.findById(files[0].folder).lean();
    expect(folder.key).toBe('announcements/ANN-S1');
    const actions = (await ChangeLog.find({ batchId: result.batchId }).lean()).map((r) => `${r.action}:${r.entity}`);
    expect(actions.filter((a) => a === 'import:InvestmentAnnouncement')).toHaveLength(2);
    expect(actions.filter((a) => a === 'link:EvidenceFile')).toHaveLength(3);
    expect(actions.filter((a) => a === 'import:EvidenceFile')).toHaveLength(2);

    lines = [];
    const again = await run({
      data: fileData(), filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(again.plan.counts).toMatchObject({ toCreate: 0, existing: 2, filesToUpload: 0, linksToAdd: 0, changed: 0 });
    expect(again.result.counts).toMatchObject({ announcementsCreated: 0, filesUploaded: 0, linksAdded: 0 });
    expect(fake.upload).toHaveBeenCalledTimes(2);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(2);
  });

  it('a changed row is listed by field name only and never overwritten', async () => {
    await run({
      data: { announcements: [row()] }, filesRoot: dir, apply: true, actor: dg, log,
    });
    lines = [];
    const { plan } = await run({
      data: { announcements: [row({ outlet: 'Changed', supportingInteractionRefs: ['INT-A1'] })] }, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(plan.changes).toEqual([{ row: 1, ref: 'ANN-S1', fields: ['outlet', 'supportingInteractions'] }]);
    expect(lines.join('\n')).toContain('ANN-S1: outlet, supportingInteractions');
    expect(lines.join('\n')).not.toContain('Changed');
    expect((await InvestmentAnnouncement.findOne({ importRef: 'ANN-S1' }).lean()).outlet).toBe('Synthetic Gazette');
  });

  it('a loaded row whose investor/project no longer matches by name: a warning, no comparison', async () => {
    await run({
      data: { announcements: [row({ supportingInteractionRefs: ['INT-A1'] })] }, filesRoot: dir, apply: true, actor: dg, log,
    });
    await Investor.updateOne({ _id: investorA._id }, { investorName: 'Synthetic Ann A Renamed' });
    lines = [];
    const { plan } = await run({ data: { announcements: [row({ supportingInteractionRefs: ['INT-A1'] })] }, filesRoot: dir, log });
    expect(plan.counts).toMatchObject({ existing: 1, changed: 0, errors: 0, warnings: 1 });
    expect(plan.changes).toEqual([]);
    expect(plan.warnings[0].message).toBe('investor/project no longer matches by name; not compared with the file');
  });

  it('apply prints the batch id before writing', async () => {
    const { result } = await run({
      data: { announcements: [row()] }, filesRoot: dir, apply: true, actor: dg, log,
    });
    const at = lines.indexOf(`Batch: ${result.batchId}`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(lines.findIndex((l) => l.startsWith('Announcements created:')));
    expect(await ChangeLog.countDocuments({ batchId: result.batchId })).toBeGreaterThan(0);
  });

  it('bad rows are reported and the rest loads', async () => {
    const data = {
      announcements: [
        row({ id: 'B1', oysipaNamed: 'yes' }),
        row({ id: 'B2', oysipaRoleText: '' }),
        row({ id: 'B3', url: 'javascript:x' }),
        row({ id: 'B4', announcementDate: '2999-01-01' }),
        row({ id: 'B5', outlet: '' }),
        row({ id: 'B6', archivedFiles: ['../outside.pdf', 'missing.pdf', write('x.exe', 'MZ')] }),
        row({ id: 'B7', investorName: 'Nobody Synthetic' }),
        row({ id: 'B8', supportingInteractionRefs: 'INT-A1' }),
        row({ id: 'B9', archivedCopyUrl: `https://archive.example.test/${'x'.repeat(2100)}` }),
        row({ id: 'OK1' }),
        row({ id: 'OK1' }),
      ],
    };
    const { plan, result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    const errorRefs = [...new Set(plan.errors.map((e) => e.ref))].sort();
    expect(errorRefs).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'OK1']);
    expect(plan.errors.find((e) => e.ref === 'B9').reason).toBe('archivedCopyUrl is too long');
    expect(plan.errors.find((e) => e.ref === 'B3').reason).toBe('url is not an http(s) link');
    expect(plan.counts.fileErrors).toBe(3);
    // B6 itself is valid: created without files. OK1 once (the repeat is an error).
    expect(result.counts.announcementsCreated).toBe(2);
    expect((await InvestmentAnnouncement.find({}).lean()).map((a) => a.importRef).sort()).toEqual(['B6', 'OK1']);
  });

  it('refuses the live database name without --allow-live', async () => {
    const realName = mongoose.connection.name;
    let err;
    try {
      mongoose.connection.name = 'test';
      await run({
        data: fileData(), filesRoot: dir, apply: true, actor: dg, log,
      }).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(err && err.message).toMatch(/allow-live/);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });

  it('--apply refuses a user who is not DG/Admin', async () => {
    const staff = await User.create({ name: 'Ann CLI Staff', email: 'ann.cli.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
    await expect(run({
      data: fileData(), filesRoot: dir, apply: true, actor: staff, log,
    })).rejects.toThrow(/Director-General/);
    expect(await InvestmentAnnouncement.countDocuments()).toBe(0);
  });
});
