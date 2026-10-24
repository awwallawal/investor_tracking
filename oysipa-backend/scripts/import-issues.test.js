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
const { parseIssuesFile } = require('../src/services/issueImport');
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
  // Story 11.10: the fixtures above wrote audit create rows; start empty.
  await ChangeLog.collection.deleteMany({});
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

  it('parses the file', () => {
    expect(() => parseIssuesFile('{"x":1}')).toThrow(/issues/);
    expect(() => parseIssuesFile('not json')).toThrow(/JSON/);
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
    expect(s1.mdaResponsible).toEqual(['CULTURE AND TOURISM']);
    const s2 = await InvestorIssue.findOne({ importRef: 'ISS-S2' }).lean();
    expect(s2.mdaResponsible).toEqual(['OYSIPA']);
    // 11.7b: an id that is not ISS-NN gets the next free reference (file order).
    expect([s1.reference, s2.reference]).toEqual(['ISS-01', 'ISS-02']);

    // Shared files: stored once in the first issue's folder, linked to both issues.
    const shared = await EvidenceFile.findOne({ fileName: 'visit.pdf' }).populate('folder').lean();
    expect(shared.folder.key).toBe('investor-issues/ISS-02'); // reference first (11.7b)
    expect(shared.folder.name).toBe('Issue ISS-02');
    expect(shared.links.map((l) => String(l.issue)).sort()).toEqual([String(s2._id), String((await InvestorIssue.findOne({ importRef: 'ISS-S3' }))._id)].sort());
    expect(await EvidenceFolder.exists({ key: 'investor-issues' })).toBeTruthy();
    expect(await EvidenceFolder.exists({ key: /^investor-issues\/ISS-(S3|03)$/ })).toBeNull(); // received no file of its own
    expect(await EvidenceFile.countDocuments(EvidenceFile.UNTAGGED)).toBe(0);

    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, entity: 'InvestorIssue', action: 'import' })).toBe(3);
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, entity: 'EvidenceFile', action: 'import' })).toBe(4);
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, action: 'link' })).toBe(6);
    // Story 11.10: only `import` rows for the loaded issues, no duplicate create rows.
    expect(await ChangeLog.countDocuments({ entity: 'InvestorIssue', action: 'create' })).toBe(0);

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

  it('MDA entries are stored as codes: studio names, old codes and qualifiers (11.7c); an unknown base is a row error', async () => {
    const data = {
      issues: [
        issue({ id: 'ISS-D1', mdaResponsible: ['Ministry of Agriculture / OYSADA', 'MLH', 'oysada'] }),
        issue({ id: 'ISS-D2', mdaResponsible: ['OYSIPA (BOI and finance linkage)'] }),
        issue({ id: 'ISS-D3', mdaResponsible: ['Ministry of Magic (wands)'] }),
      ],
    };
    const { plan, result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(plan.counts).toMatchObject({ toCreate: 2, errors: 1, warnings: 1 });
    expect(plan.errors.map((e) => `${e.ref}: ${e.reason}`)).toEqual(['ISS-D3: mdaResponsible #1 is not on the MDA list']);
    expect(plan.warnings[0]).toMatchObject({ ref: 'ISS-D2', message: expect.stringMatching(/OYSIPA \(qualifier dropped\)/) });
    expect(result.counts).toMatchObject({ issuesCreated: 2 });
    expect((await InvestorIssue.findOne({ importRef: 'ISS-D1' }).lean()).mdaResponsible).toEqual(['AGRICULTURE', 'OYSADA', 'LANDS AND HOUSING']);
    expect((await InvestorIssue.findOne({ importRef: 'ISS-D2' }).lean()).mdaResponsible).toEqual(['OYSIPA']);
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

  it('Resolved, Closed unresolved and Withdrawn rows need a resolution / reason note (owner rule 24 Oct 2026)', async () => {
    const data = {
      issues: [
        issue({ id: 'ISS-N1', status: 'Resolved', resolution: '' }),
        issue({ id: 'ISS-N2', status: 'Closed unresolved', resolution: null }),
        issue({ id: 'ISS-N3', status: 'Withdrawn', resolution: '   ' }),
        issue({ id: 'ISS-N4', status: 'Closed unresolved', resolution: 'Investor relocated out of state' }),
        issue({ id: 'ISS-N5', status: 'Withdrawn', resolution: 'Investor withdrew the complaint' }),
      ],
    };
    const { plan, result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    const reasons = plan.errors.map((e) => `${e.ref}: ${e.reason}`);
    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/ISS-N1: .*status Resolved needs a resolution \/ reason note/),
      expect.stringMatching(/ISS-N2: .*status Closed unresolved needs a resolution \/ reason note/),
      expect.stringMatching(/ISS-N3: .*status Withdrawn needs a resolution \/ reason note/),
    ]));
    expect(reasons.some((r) => /ISS-N4|ISS-N5/.test(r))).toBe(false);
    expect(plan.counts).toMatchObject({ toCreate: 2, errors: 3 });
    expect(result.counts).toMatchObject({ issuesCreated: 2 });
    const saved = await InvestorIssue.find({}).lean();
    expect(saved.map((i) => i.status).sort()).toEqual(['Closed unresolved', 'Withdrawn']);
    expect(saved.map((i) => i.resolution).sort()).toEqual(['Investor relocated out of state', 'Investor withdrew the complaint']);
    // Only Resolved sets resolvedDate.
    saved.forEach((i) => expect(i.resolvedDate).toBeUndefined());
  });

  it('--apply refuses a user who is not DG/Admin', async () => {
    const staff = await User.create({ name: 'S', email: 'iss.cli.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
    await expect(run({
      data: fileData(), filesRoot: dir, apply: true, actor: staff, log,
    })).rejects.toThrow(/Director-General or Portal-Admin/);
  });
});

describe('import-issues 11.7b: references and the change report', () => {
  const one = (o = {}) => ({ issues: [issue({ id: 'ISS-03', ...o })] });

  it('a new ISS-NN row gets reference = importRef; another id gets the next free number', async () => {
    const data = { issues: [issue({ id: 'ISS-03' }), issue({ id: 'S-LEGACY', investorName: 'Synthetic Issues B' })] };
    const { result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(result.counts.issuesCreated).toBe(2);
    expect((await InvestorIssue.findOne({ importRef: 'ISS-03' }).lean()).reference).toBe('ISS-03');
    expect((await InvestorIssue.findOne({ importRef: 'S-LEGACY' }).lean()).reference).toBe('ISS-04');
    // The audit snapshot holds the reference.
    const row = await ChangeLog.findOne({ entity: 'InvestorIssue', action: 'import', 'snapshot.importRef': 'ISS-03' }).lean();
    expect(row.snapshot.reference).toBe('ISS-03');
  });

  it('a new row whose ISS-NN is already used by an app issue is a row error (dry run too); the rest loads', async () => {
    await InvestorIssue.create({
      investor: investorA._id, dateRegistered: new Date(), dateReported: new Date('2026-01-01T00:00:00.000Z'), category: 'other', description: 'App issue', reference: 'ISS-09',
    });
    const data = { issues: [issue({ id: 'ISS-09' }), issue({ id: 'ISS-10' })] };
    const dry = await run({ data, filesRoot: dir, log });
    expect(dry.plan.errors.map((e) => `${e.ref}: ${e.reason}`)).toEqual(['ISS-09: reference ISS-09 is already used']);
    expect(lines.join('\n')).toContain('ERROR row 1 ISS-09: reference ISS-09 is already used');
    const { result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(result.counts.issuesCreated).toBe(1);
    expect(await InvestorIssue.exists({ importRef: 'ISS-09' })).toBeNull();
    expect((await InvestorIssue.findOne({ importRef: 'ISS-10' }).lean()).reference).toBe('ISS-10');
  });

  it('repeat with a changed file: dry run lists "ISS-03: status, actions"; nothing is written, also on --apply', async () => {
    await run({
      data: one(), filesRoot: dir, apply: true, actor: dg, log,
    });
    const before = await InvestorIssue.collection.find({}).toArray();
    const changed = one({
      status: 'In progress',
      actions: [{ date: '2025-04-26', by: 'Synthetic desk', note: 'Letter sent again' }],
    });
    lines = [];
    const dry = await run({ data: changed, filesRoot: dir, log });
    expect(dry.plan.counts.changed).toBe(1);
    expect(dry.plan.changes).toEqual([{ row: 1, ref: 'ISS-03', fields: ['status', 'actions'] }]);
    const out = lines.join('\n');
    expect(out).toContain('1 loaded issues differ from the file');
    expect(out).toContain('  ISS-03: status, actions');
    expect(out).not.toContain('In progress');
    expect(out).not.toContain('Letter sent again');
    lines = [];
    await run({
      data: changed, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(lines.join('\n')).toContain('  ISS-03: status, actions');
    expect(await InvestorIssue.collection.find({}).toArray()).toEqual(before);
  });

  it('file order [S-LEGACY, ISS-01] on an empty database: ISS-01 keeps its number, S-LEGACY gets ISS-02', async () => {
    const data = { issues: [issue({ id: 'S-LEGACY' }), issue({ id: 'ISS-01', investorName: 'Synthetic Issues B' })] };
    const { result } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(result.errors).toEqual([]);
    expect((await InvestorIssue.findOne({ importRef: 'ISS-01' }).lean()).reference).toBe('ISS-01');
    expect((await InvestorIssue.findOne({ importRef: 'S-LEGACY' }).lean()).reference).toBe('ISS-02');
  });

  it('ISS-5 is stored as ISS-05; ISS-5 and ISS-05 in one file clash; an app ISS-05 makes ISS-5 a row error; ISS-0 gets a new number', async () => {
    const data = { issues: [issue({ id: 'ISS-5' }), issue({ id: 'ISS-05' }), issue({ id: 'ISS-0' })] };
    const { plan } = await run({
      data, filesRoot: dir, apply: true, actor: dg, log,
    });
    expect(plan.errors.map((e) => `${e.ref}: ${e.reason}`)).toEqual(['ISS-05: reference ISS-05 is already used']);
    expect((await InvestorIssue.findOne({ importRef: 'ISS-5' }).lean()).reference).toBe('ISS-05');
    expect((await InvestorIssue.findOne({ importRef: 'ISS-0' }).lean()).reference).toBe('ISS-06');

    await InvestorIssue.deleteMany({});
    await InvestorIssue.create({
      investor: investorA._id, dateRegistered: new Date(), dateReported: new Date('2026-01-01T00:00:00.000Z'), category: 'other', description: 'App issue', reference: 'ISS-05',
    });
    const again = await run({ data: { issues: [issue({ id: 'ISS-005' })] }, filesRoot: dir, log });
    expect(again.plan.errors.map((e) => e.reason)).toEqual(['reference ISS-05 is already used']);
  });

  it('change report: action "by" is compared; no investorName in the file is not a difference; an invalid stored date does not throw', async () => {
    await run({
      data: one(), filesRoot: dir, apply: true, actor: dg, log,
    });
    let { plan } = await run({ data: one({ actions: [{ date: '2025-04-26', by: 'Other desk', note: 'Letter sent' }] }), filesRoot: dir, log });
    expect(plan.changes).toEqual([{ row: 1, ref: 'ISS-03', fields: ['actions'] }]);
    ({ plan } = await run({ data: one({ investorName: '' }), filesRoot: dir, log }));
    expect(plan.changes).toEqual([]);
    await InvestorIssue.collection.updateOne({ importRef: 'ISS-03' }, { $set: { dateReported: 'not a date' } });
    lines = [];
    ({ plan } = await run({ data: one(), filesRoot: dir, log }));
    expect(plan.changes).toEqual([{ row: 1, ref: 'ISS-03', fields: ['dateReported'] }]);
    expect(lines.join('\n')).toContain('a difference can also be an edit made in the app since loading');
  });

  it('an unchanged repeat reports 0 differences', async () => {
    await run({
      data: one(), filesRoot: dir, apply: true, actor: dg, log,
    });
    const { plan } = await run({ data: one(), filesRoot: dir, log });
    expect(plan.counts.changed).toBe(0);
    expect(plan.changes).toEqual([]);
  });

  it('every compared field is named; MDA names are resolved first; the investor name is compared with its current name', async () => {
    await run({
      data: one(), filesRoot: dir, apply: true, actor: dg, log,
    });
    // Same MDA by another spelling (code) → no difference.
    let { plan } = await run({ data: one({ mdaResponsible: ['CULTURE AND TOURISM'] }), filesRoot: dir, log });
    expect(plan.counts.changed).toBe(0);

    ({ plan } = await run({
      data: one({
        category: 'other',
        description: 'Changed',
        reportedVia: 'email',
        mdaResponsible: ['OYSIPA'],
        dateReported: '2025-04-27',
        project: 'Changed project',
        status: 'Withdrawn',
        resolution: 'Withdrawn note',
        note: 'Changed note',
        actions: [{ date: '2025-04-27', note: 'Letter sent' }],
      }),
      filesRoot: dir,
      log,
    }));
    expect(plan.changes[0].fields).toEqual([
      'category', 'description', 'status', 'reportedVia', 'mdaResponsible', 'dateReported', 'projectText', 'resolution', 'importNote', 'actions',
    ]);

    // The stored investor was renamed: the file's name now differs.
    await Investor.updateOne({ _id: investorA._id }, { investorName: 'Synthetic Issues A Renamed' });
    lines = [];
    ({ plan } = await run({ data: one(), filesRoot: dir, log }));
    expect(plan.changes).toEqual([{ row: 1, ref: 'ISS-03', fields: ['investorName'] }]);
    expect(lines.join('\n')).not.toContain('Synthetic Issues');
  });
});
