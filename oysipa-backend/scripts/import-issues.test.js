// Investor issues loader (story 11.7). Synthetic files in a temp dir and a fake
// storage provider only: no real issues, no Cloudinary.
const fs = require('fs');
const mongoose = require('mongoose');
const os = require('os');
const path = require('path');
const User = require('../src/models/User');
const Investor = require('../src/models/InvestorModel');
const InvestorIssue = require('../src/models/InvestorIssue');
const EvidenceFolder = require('../src/models/EvidenceFolder');
const EvidenceFile = require('../src/models/EvidenceFile');
const ChangeLog = require('../src/models/ChangeLog');
const documentStorage = require('../src/services/documentStorage');
const { parseIssuesFile, matchMda } = require('../src/services/issueImport');
const { parseArgs, run } = require('./import-issues');

let dir;
let lines;
let dg;
let fake;
let investorA;
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
    upload: jest.fn(async () => { n += 1; return { key: `issue-bulk-${n}`, resourceType: 'raw' }; }),
    signedUrl: jest.fn(async (doc) => `https://signed.example.test/${doc.key}`),
    remove: jest.fn(async () => {}),
  };
};

const issue = (o) => ({
  id: 'ISS-S1',
  investorName: 'Synthetic Issues A',
  project: 'Synthetic resort project',
  dateReported: '2025-04-26',
  reportedVia: 'MDA',
  mdaResponsible: ['Ministry of Culture and Tourism'],
  category: 'security',
  description: 'Synthetic issue',
  status: 'Open',
  actions: [{ date: '2025-04-26', by: 'Synthetic desk', note: 'Letter sent' }],
  resolvedDate: null,
  resolution: null,
  evidenceFiles: [],
  note: 'Synthetic note',
  ...o,
});

beforeAll(async () => {
  // Every model's index builds finish first, so none is still running when the
  // database is dropped at the end (that left a request hanging).
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  lines = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issues-cli-'));
  await Promise.all([
    InvestorIssue.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({}), ChangeLog.collection.deleteMany({}),
  ]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  dg = await User.findOne({ email: 'dg@example.com' });
  investorA = await Investor.create({ investorName: 'Synthetic Issues A', sector: 'Tourism', countryOfOrigin: 'NG' });
  await Investor.create({ investorName: 'Synthetic Issues B', sector: 'Agro', countryOfOrigin: 'NG' });
});

afterEach(() => {
  jest.restoreAllMocks();
  documentStorage.__setProviderForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const fileData = () => {
  const shared = [write('evidence/issues/S2/visit.pdf', '%PDF-shared visit'), write('evidence/issues/S2/photo.jpg', 'jpg-shared')];
  return {
    generated: '2026-10-23',
    issues: [
      issue({ evidenceFiles: [write('evidence/issues/S1/a.pdf', '%PDF-a'), write('evidence/issues/S1/b.pdf', '%PDF-b')] }),
      issue({
        id: 'ISS-S2', investorName: 'Synthetic Issues B', category: 'other', reportedVia: 'visit', mdaResponsible: ['OYSIPA (BOI and finance linkage)'], evidenceFiles: shared,
      }),
      issue({ id: 'ISS-S3', investorName: 'Synthetic Issues B', category: 'other', evidenceFiles: shared }),
      issue({ id: 'ISS-S4', investorName: 'Nobody Synthetic', evidenceFiles: [] }),
    ],
  };
};

describe('import-issues CLI', () => {
  it('parses args: dry run by default; --apply needs --as', () => {
    expect(parseArgs(['--file', 'i.json', '--files-root', 'root'])).toMatchObject({
      file: 'i.json', filesRoot: 'root', apply: false, uriEnv: 'MONGO_URI',
    });
    expect(() => parseArgs(['--file', 'i.json', '--apply'])).toThrow(/--as/);
    expect(() => parseArgs([])).toThrow(/--file/);
  });

  it('parses the file and maps a qualified MDA to its base name', () => {
    expect(() => parseIssuesFile('{"x":1}')).toThrow(/issues/);
    expect(() => parseIssuesFile('not json')).toThrow(/JSON/);
    expect(matchMda('OYSIPA (BOI and finance linkage)')).toEqual({ value: 'OYSIPA', qualified: true });
    expect(matchMda('Ministry of Magic')).toEqual({ error: true });
  });

  it('dry run: counts only, nothing written or uploaded; an unknown investor is a row error and the run continues', async () => {
    const { plan } = await run({ data: fileData(), filesRoot: dir, log });
    expect(plan.counts).toMatchObject({
      issues: 4, toCreate: 3, existing: 0, errors: 1, files: 6, fileErrors: 0, filesToUpload: 4, linksToAdd: 6,
    });
    expect(await InvestorIssue.countDocuments()).toBe(0);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(await ChangeLog.countDocuments()).toBe(0);
    expect(fake.upload).not.toHaveBeenCalled();
    const out = lines.join('\n');
    expect(out).toContain('DRY RUN');
    expect(out).toMatch(/ERROR row 4 ISS-S4: no investor with this exact name/);
    expect(out).toMatch(/WARNING row 2 ISS-S2/);
    expect(out).not.toContain('Synthetic Issues');
    expect(out).not.toContain('Nobody Synthetic');
  });

  it('apply: issues, folders, files once by sha256, links, audit; a repeat creates 0 and uploads 0', async () => {
    const data = fileData();
    const first = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(first.result.counts).toMatchObject({ issuesCreated: 3, filesUploaded: 4, linksAdded: 6 });
    expect(first.result.errors).toEqual([]);
    expect(fake.upload).toHaveBeenCalledTimes(4);

    const s1 = await InvestorIssue.findOne({ importRef: 'ISS-S1' }).lean();
    expect(s1).toMatchObject({
      projectText: 'Synthetic resort project', status: 'Open', category: 'security', importNote: 'Synthetic note', importBatchId: first.result.batchId,
    });
    expect(s1.project).toBeUndefined();
    expect(String(s1.investor)).toBe(String(investorA._id));
    expect(s1.dateReported.toISOString()).toBe('2025-04-26T00:00:00.000Z');
    expect(s1.dateRegistered).toBeTruthy();
    expect(s1.actions).toHaveLength(1);
    expect(String(s1.actions[0].recordedBy)).toBe(String(dg._id));
    expect(s1.actions[0].by).toBe('Synthetic desk');
    const s2 = await InvestorIssue.findOne({ importRef: 'ISS-S2' }).lean();
    expect(s2.mdaResponsible).toEqual(['OYSIPA']);

    // Shared files: stored once in the first issue's folder, linked to both issues.
    const shared = await EvidenceFile.findOne({ fileName: 'visit.pdf' }).populate('folder').lean();
    expect(shared.folder.key).toBe('investor-issues/ISS-S2');
    expect(shared.links.map((l) => String(l.issue)).sort()).toEqual([String(s2._id), String((await InvestorIssue.findOne({ importRef: 'ISS-S3' }))._id)].sort());
    expect(await EvidenceFolder.exists({ key: 'investor-issues' })).toBeTruthy();
    expect(await EvidenceFolder.exists({ key: 'investor-issues/ISS-S3' })).toBeNull(); // received no file of its own
    expect(await EvidenceFile.countDocuments(EvidenceFile.UNTAGGED)).toBe(0);

    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, entity: 'InvestorIssue', action: 'import' })).toBe(3);
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, entity: 'EvidenceFile', action: 'import' })).toBe(4);
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, action: 'link' })).toBe(6);

    fake.upload.mockClear();
    const second = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(second.plan.counts).toMatchObject({ toCreate: 0, existing: 3, filesToUpload: 0, linksToAdd: 0 });
    expect(second.result.counts).toMatchObject({
      issuesCreated: 0, filesUploaded: 0, linksAdded: 0, foldersCreated: 0, auditRows: 0,
    });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(await InvestorIssue.countDocuments()).toBe(3);
  });

  it('bad rows and files are reported, the rest loads', async () => {
    write('big.pdf', Buffer.alloc(11 * 1024 * 1024));
    const data = {
      issues: [
        issue({ id: 'ISS-B1', category: 'weather' }),
        issue({ id: 'ISS-B2', status: 'Resolved', resolution: '' }),
        issue({ id: 'ISS-B3', dateReported: '2999-01-01' }),
        issue({ id: 'ISS-B4', evidenceFiles: ['missing.pdf', 'clip.mp4', 'big.pdf', write('ok.pdf', '%PDF-ok')] }),
        issue({ id: 'ISS-B4' }),
      ],
    };
    const { plan, result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(plan.counts).toMatchObject({ toCreate: 1, fileErrors: 3, errors: 7 });
    expect(result.counts).toMatchObject({ issuesCreated: 1, filesUploaded: 1 });
    expect(await InvestorIssue.countDocuments()).toBe(1);
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
    expect(await InvestorIssue.countDocuments()).toBe(0);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it('non-list actions / evidenceFiles are row errors; a path outside the files root is a file error', async () => {
    const outside = path.join(path.dirname(dir), `outside-${path.basename(dir)}.pdf`);
    fs.writeFileSync(outside, '%PDF-outside');
    try {
      const data = {
        issues: [
          issue({ id: 'ISS-L1', actions: 'called them' }),
          issue({ id: 'ISS-L2', evidenceFiles: 'a.pdf' }),
          issue({ id: 'ISS-L3', evidenceFiles: [`../${path.basename(outside)}`, outside] }),
        ],
      };
      const { plan } = await run({ data, filesRoot: dir, log });
      const reasons = plan.errors.map((e) => `${e.ref}: ${e.reason}`);
      expect(reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/ISS-L1: .*actions is not a list/),
        expect.stringMatching(/ISS-L2: .*evidenceFiles is not a list/),
        'ISS-L3: file #1: outside the files root',
        'ISS-L3: file #2: outside the files root',
      ]));
      expect(plan.counts).toMatchObject({ toCreate: 1, fileErrors: 2, filesToUpload: 0 });
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it('--apply refuses a user who is not DG/Admin', async () => {
    const staff = await User.create({ name: 'S', email: 'iss.cli.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
    await expect(run({
      data: fileData(), filesRoot: dir, apply: true, actor: staff, log,
    })).rejects.toThrow(/Director-General or Portal-Admin/);
  });
});
