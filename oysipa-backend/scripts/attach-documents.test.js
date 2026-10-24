// Bulk attach CLI (spec-evidence-library-and-bulk-attach). Synthetic files in a
// temp dir and a fake storage provider only: no real evidence, no Cloudinary.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Investor = require('../src/models/InvestorModel');
const InteractionLog = require('../src/models/InteractionLog');
const InvestmentProject = require('../src/models/InvestmentProject');
const EvidenceFolder = require('../src/models/EvidenceFolder');
const EvidenceFile = require('../src/models/EvidenceFile');
const ChangeLog = require('../src/models/ChangeLog');
const documentStorage = require('../src/services/documentStorage');
const { parseCsv, parseManifest } = require('../src/services/evidenceImport');
const { parseArgs, run } = require('./attach-documents');

const HEADER = 'folderKey,folderName,folderDate,folderDescription,parentKey,parentName,parentDescription,file,fileName,documentDate,what,interactionRef,attach,reason';

let dir;
let lines;
let dg;
let fake;
let investorA;
let investorB;
const log = (l) => lines.push(l);

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const write = (name, content) => { fs.writeFileSync(path.join(dir, name), content); return name; };

// One manifest row. Columns are deliberately reordered in some tests to prove
// they are read by header name.
const row = (o) => ({
  folderKey: 'engagements-2025/delegation-jan',
  folderName: 'Delegation, January',
  folderDate: '2025-01-15',
  folderDescription: '',
  parentKey: 'engagements-2025',
  parentName: 'Engagements 2025',
  parentDescription: 'Engagements with investors in 2025: posts, photos, memos.',
  file: '',
  fileName: '',
  documentDate: '2025-01-15',
  what: 'post',
  interactionRef: '',
  attach: 'yes',
  reason: '',
  ...o,
});

const toCsv = (rows, header = HEADER) => {
  const cols = header.split(',');
  return [header, ...rows.map((r) => cols.map((c) => csvCell(r[c] === undefined ? '' : r[c])).join(','))].join('\r\n');
};

const makeFake = () => {
  let n = 0;
  return {
    name: 'fake',
    isConfigured: () => true,
    upload: jest.fn(async () => { n += 1; return { key: `bulk-${n}`, resourceType: 'raw' }; }),
    signedUrl: jest.fn(async (doc) => `https://signed.example.test/${doc.key}`),
    remove: jest.fn(async () => {}),
  };
};

// Let the index builds finish first, so none is still running when the
// database is dropped at the end (that left a request hanging until the socket timed out).
beforeAll(async () => {
  await Promise.all([EvidenceFile, EvidenceFolder, ChangeLog, InteractionLog, Investor].map((M) => M.init()));
});

beforeEach(async () => {
  lines = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-cli-'));
  await Promise.all([
    EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({}), ChangeLog.collection.deleteMany({}),
  ]);
  fake = makeFake();
  documentStorage.__setProviderForTests(fake);
  dg = await User.findOne({ email: 'dg@example.com' });
  investorA = await Investor.create({ investorName: 'Synthetic A', sector: 'Agro', countryOfOrigin: 'NG' });
  investorB = await Investor.create({ investorName: 'Synthetic B', sector: 'Agro', countryOfOrigin: 'NG' });
  const project = await InvestmentProject.create({ projectTitle: 'Synthetic B plant', investor: investorB._id, lifecycleStatus: (await mongoose.model('LifecycleStatus').findOne())._id });
  const mk = (ref, target) => InteractionLog.create({
    ...target, loggedBy: dg._id, description: `Synthetic ${ref}`, category: 'Imported record', importRef: ref,
  });
  for (let i = 1; i <= 6; i += 1) await mk(`INT-SYN-${i}`, { investor: investorA._id });
  await mk('INT-SYN-7', { project: project._id });
  // Story 11.10: the fixtures above wrote audit create rows; start empty.
  await ChangeLog.collection.deleteMany({});
});

afterEach(() => {
  jest.restoreAllMocks();
  documentStorage.__setProviderForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const go = (csv, opts = {}) => run({
  rows: parseManifest(csv), baseDir: dir, log, ...opts,
});

describe('CSV parser', () => {
  it('handles quotes, commas, doubled quotes, line breaks in quoted fields, BOM and CRLF', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n,,\r\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['', '', '']]);
  });

  it('reads columns by header name, not by position', () => {
    const header = 'attach,file,fileName,folderKey,folderName,parentKey,parentName,parentDescription,interactionRef';
    const [r] = parseManifest(`${header}\nyes,a.pdf,a.pdf,top/sub,Sub,top,Top,Top desc,INT-1`);
    expect(r).toMatchObject({
      row: 2, attach: 'yes', file: 'a.pdf', folderKey: 'top/sub', parentDescription: 'Top desc', interactionRef: 'INT-1',
    });
  });

  it('a missing required column is an error', () => {
    expect(() => parseManifest('folderKey,file\nx,y')).toThrow(/missing column/);
  });
});

describe('attach-documents CLI', () => {
  it('parses args: dry run by default; --apply needs --as', () => {
    expect(parseArgs(['--manifest', 'm.csv'])).toMatchObject({ manifest: 'm.csv', apply: false, uriEnv: 'MONGO_URI' });
    expect(() => parseArgs(['--manifest', 'm.csv', '--apply'])).toThrow(/--as/);
    expect(() => parseArgs([])).toThrow(/--manifest/);
  });

  it('dry run: counts only, nothing written or uploaded', async () => {
    const csv = toCsv([
      row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf', interactionRef: 'INT-SYN-1' }),
      row({ file: write('b.jpg', 'jpg-b'), fileName: 'b.jpg', folderKey: 'programmes/forum', folderName: 'Forum', parentKey: 'programmes', parentName: 'Programmes and events' }),
      row({ file: write('c.pdf', '%PDF-c'), fileName: 'c.pdf', attach: 'no', reason: 'held back' }),
    ]);
    const { plan } = await go(csv);
    expect(plan.counts).toMatchObject({
      rows: 3, attachRows: 2, notAttached: 1, rowsLoaded: 2, foldersToCreate: 4, filesToUpload: 2, linksToAdd: 1, untaggedFiles: 1, skipped: 0,
    });
    expect(await EvidenceFolder.countDocuments()).toBe(0);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(await ChangeLog.countDocuments()).toBe(0);
    expect(fake.upload).not.toHaveBeenCalled();
    const out = lines.join('\n');
    expect(out).toContain('DRY RUN');
    expect(out).toContain('Files to upload: 2');
    // No investor names in the output.
    expect(out).not.toContain('Synthetic A');
  });

  it('dry run needs no storage credentials', async () => {
    documentStorage.__setProviderForTests({ ...makeFake(), isConfigured: () => false });
    const csv = toCsv([row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf' })]);
    const { plan } = await go(csv);
    expect(plan.counts.filesToUpload).toBe(1);
  });

  it('apply: folders, files, links and audit rows; a repeat uploads 0 and links 0', async () => {
    write('pmdc.pdf', '%PDF-pmdc register');
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row({
      file: 'pmdc.pdf', fileName: 'pmdc.pdf', folderKey: 'mda-records/pmdc', folderName: 'PMDC', parentKey: 'mda-records', parentName: 'MDA records', interactionRef: `INT-SYN-${i}`,
    }));
    rows.push(row({ file: write('untagged.png', 'png'), fileName: 'untagged.png' }));
    const csv = toCsv(rows);

    const first = await go(csv, { apply: true, actor: dg });
    expect(first.result.counts).toMatchObject({ foldersCreated: 4, filesUploaded: 2, linksAdded: 7 });
    expect(first.result.errors).toEqual([]);
    expect(fake.upload).toHaveBeenCalledTimes(2);

    // Same file, many rows: 1 stored, 7 links (INT-SYN-7 via its project's investor).
    const pmdc = await EvidenceFile.findOne({ fileName: 'pmdc.pdf' }).lean();
    expect(pmdc.links).toHaveLength(7);
    const seventh = pmdc.links.find((l) => String(l.investor) === String(investorB._id));
    expect(seventh).toBeTruthy();
    expect(pmdc.importBatchId).toBe(first.result.batchId);
    expect(pmdc.uploadedBy.toString()).toBe(dg._id.toString());

    // Untagged file: stored in its folder with no link.
    const untagged = await EvidenceFile.findOne({ fileName: 'untagged.png' }).populate('folder').lean();
    expect(untagged.links).toHaveLength(0);
    expect(untagged.folder.key).toBe('engagements-2025/delegation-jan');

    // Top folders: name from parentName, description from parentDescription.
    const top = await EvidenceFolder.findOne({ key: 'engagements-2025' }).lean();
    expect(top).toMatchObject({ name: 'Engagements 2025', description: 'Engagements with investors in 2025: posts, photos, memos.', parent: null, order: 0 });
    const sub = await EvidenceFolder.findOne({ key: 'engagements-2025/delegation-jan' }).lean();
    expect(String(sub.parent)).toBe(String(top._id));
    expect(sub.name).toBe('Delegation, January');

    // Audit: 4 folders + 2 files (import) + 7 links.
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, action: 'import', entity: 'EvidenceFolder' })).toBe(4);
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, action: 'import', entity: 'EvidenceFile' })).toBe(2);
    expect(await ChangeLog.countDocuments({ batchId: first.result.batchId, action: 'link' })).toBe(7);

    // Repeat-safe.
    fake.upload.mockClear();
    const second = await go(csv, { apply: true, actor: dg });
    expect(second.plan.counts).toMatchObject({ foldersToCreate: 0, filesToUpload: 0, filesAlreadyStored: 2, linksToAdd: 0, linksExisting: 7 });
    expect(second.result.counts).toMatchObject({ foldersCreated: 0, filesUploaded: 0, linksAdded: 0, auditRows: 0 });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(await EvidenceFile.countDocuments()).toBe(2);
  });

  it('bad rows are skipped and reported, never thrown; an unknown ref is reported and the file still stored', async () => {
    process.env.DOCUMENT_MAX_MB = '0.001'; // ~1 KB
    try {
      const csv = toCsv([
        row({ file: 'missing.pdf', fileName: 'missing.pdf' }),
        row({ file: write('clip.mp4', 'video'), fileName: 'clip.mp4' }),
        row({ file: write('song.mp3', 'audio'), fileName: 'song.mp3' }),
        row({ file: write('big.pdf', Buffer.alloc(5000, 1)), fileName: 'big.pdf' }),
        row({ file: write('future.pdf', '%PDF-f'), fileName: 'future.pdf', documentDate: '2999-01-01' }),
        row({ file: write('ref.pdf', '%PDF-r'), fileName: 'ref.pdf', interactionRef: 'INT-NOPE' }),
      ]);
      const { plan, result } = await go(csv, { apply: true, actor: dg });
      expect(plan.counts).toMatchObject({ skipped: 5, rowsLoaded: 1, refErrors: 1, filesToUpload: 1 });
      expect(plan.skipped.map((s) => s.row)).toEqual([2, 3, 4, 5, 6]);
      expect(plan.skipped[0].reason).toBe('file not found');
      expect(plan.skipped[1].reason).toMatch(/type not allowed/);
      expect(plan.skipped[3].reason).toMatch(/larger than/);
      expect(plan.refErrors).toEqual([{
        row: 7, fileName: 'ref.pdf', ref: 'INT-NOPE', reason: 'no interaction with this importRef',
      }]);
      expect(result.counts.filesUploaded).toBe(1);
      expect((await EvidenceFile.findOne({ fileName: 'ref.pdf' }).lean()).links).toHaveLength(0);
      const out = lines.join('\n');
      expect(out).toContain('SKIPPED row 3 "clip.mp4"');
      expect(out).toContain('REF ERROR row 7 "ref.pdf": INT-NOPE');
    } finally {
      delete process.env.DOCUMENT_MAX_MB;
    }
  });

  it('a per-file upload failure is reported and the run continues', async () => {
    fake.upload.mockImplementationOnce(async () => { throw new Error('network'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const csv = toCsv([
      row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf' }),
      row({ file: write('b.pdf', '%PDF-b'), fileName: 'b.pdf' }),
    ]);
    const { result } = await go(csv, { apply: true, actor: dg });
    expect(result.errors).toEqual([{ row: 2, fileName: 'a.pdf', stage: 'upload' }]);
    expect(result.counts.filesUploaded).toBe(1);
    console.error.mockRestore();
  });

  it('a save failure → stage "save", the stored copy removed, its link rows reported', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(EvidenceFile, 'create').mockRejectedValueOnce(new Error('db down'));
    const csv = toCsv([row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf', interactionRef: 'INT-SYN-1' })]);
    const { result } = await go(csv, { apply: true, actor: dg });
    expect(result.errors).toEqual([
      { row: 2, fileName: 'a.pdf', stage: 'save' },
      { row: 2, fileName: 'a.pdf', stage: 'file not stored' },
    ]);
    expect(fake.remove).toHaveBeenCalledWith(expect.objectContaining({ key: 'bulk-1' }));
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(await ChangeLog.countDocuments({ entity: 'EvidenceFile' })).toBe(0);
  });

  it('an audit failure after the save undoes the file (row deleted, stored copy removed)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const realInsert = ChangeLog.insertMany.bind(ChangeLog);
    jest.spyOn(ChangeLog, 'insertMany').mockImplementation(async (rows, ...rest) => {
      if (rows[0].entity === 'EvidenceFile') throw new Error('audit down');
      return realInsert(rows, ...rest);
    });
    const csv = toCsv([row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf' })]);
    const { result } = await go(csv, { apply: true, actor: dg });
    expect(result.errors).toEqual([{ row: 2, fileName: 'a.pdf', stage: 'audit' }]);
    expect(await EvidenceFile.countDocuments()).toBe(0);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('a file changed after the plan is not stored (stage "changed")', async () => {
    const name = write('a.pdf', '%PDF-a');
    const { plan } = await go(toCsv([row({ file: name, fileName: 'a.pdf' })]));
    fs.writeFileSync(path.join(dir, name), '%PDF-other content');
    const { applyEvidenceImport } = require('../src/services/evidenceImport');
    const result = await applyEvidenceImport(plan, dg);
    expect(result.errors).toEqual([{ row: 2, fileName: 'a.pdf', stage: 'changed' }]);
    expect(fake.upload).not.toHaveBeenCalled();
    expect(await EvidenceFile.countDocuments()).toBe(0);
  });

  it('fileName and file of different types are skipped; the type comes from file', async () => {
    const csv = toCsv([
      row({ file: write('real.pdf', '%PDF-a'), fileName: 'shown.jpg' }),
      row({ file: write('photo.png', 'png'), fileName: 'photo.PNG' }),
    ]);
    const { plan } = await go(csv);
    expect(plan.skipped).toEqual([{ row: 2, fileName: 'shown.jpg', reason: 'fileName and file have different types' }]);
    expect(plan.files[0].mimeType).toBe('image/png');
  });

  it('row numbers are CSV lines: blank lines and multi-line quoted fields are counted', () => {
    const csv = `${HEADER}

k,"Name
on two lines",,,top,Top,,a.pdf,a.pdf,,,,yes,
k,N,,,top,Top,,b.pdf,b.pdf,,,,yes,`;
    expect(parseManifest(csv).map((r) => r.row)).toEqual([3, 5]);
  });

  it('the same file in two folders: one copy, a warning, and no empty folder', async () => {
    write('same.pdf', '%PDF-same');
    const csv = toCsv([
      row({ file: 'same.pdf', fileName: 'same.pdf' }),
      row({
        file: 'same.pdf', fileName: 'same.pdf', folderKey: 'programmes/forum', folderName: 'Forum', parentKey: 'programmes', parentName: 'Programmes and events',
      }),
    ]);
    const { plan, result } = await go(csv, { apply: true, actor: dg });
    expect(plan.warnings).toEqual([{ row: 3, fileName: 'same.pdf', message: 'same file as row 2; stored in engagements-2025/delegation-jan' }]);
    expect(result.counts).toMatchObject({ filesUploaded: 1, foldersCreated: 2 });
    expect(await EvidenceFolder.exists({ key: 'programmes/forum' })).toBeNull();
    expect(await EvidenceFolder.exists({ key: 'programmes' })).toBeNull();
    expect(lines.join(' ')).toContain('WARNING row 3 "same.pdf"');
  });

  it('an importRef shared by several interactions is a ref error, not a link', async () => {
    // The unique index stops two logs sharing a ref, so the lookup is stubbed.
    const shared = [
      { _id: new mongoose.Types.ObjectId(), importRef: 'INT-SHARED', investor: investorA._id },
      { _id: new mongoose.Types.ObjectId(), importRef: 'INT-SHARED', investor: investorA._id },
    ];
    jest.spyOn(InteractionLog, 'find').mockReturnValue({ select: () => ({ lean: async () => shared }) });
    const csv = toCsv([row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf', interactionRef: 'INT-SHARED' })]);
    const { plan } = await go(csv);
    expect(plan.refErrors).toEqual([{
      row: 2, fileName: 'a.pdf', ref: 'INT-SHARED', reason: '2 interactions share this importRef',
    }]);
    expect(plan.counts.linksToAdd).toBe(0);
  });

  it('--apply needs an active DG/Admin actor', async () => {
    const revoked = await User.create({ name: 'R', email: 'r.cli@example.com', password: 'password123', role: 'Director-General', status: 'revoked' });
    await expect(go(toCsv([]), { apply: true, actor: revoked })).rejects.toThrow(/active Director-General/);
  });

  it('--apply needs a DG/Admin actor', async () => {
    const staff = await User.create({ name: 'S', email: 's.cli@example.com', password: 'password123', role: 'Staff' });
    const csv = toCsv([row({ file: write('a.pdf', '%PDF-a'), fileName: 'a.pdf' })]);
    await expect(go(csv, { apply: true, actor: staff })).rejects.toThrow(/Director-General or Portal-Admin/);
    expect(await EvidenceFile.countDocuments()).toBe(0);
  });

  it('refuses the live database name without --allow-live', async () => {
    const realName = mongoose.connection.name;
    let err;
    try {
      mongoose.connection.name = 'test';
      await go(toCsv([])).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(err && err.message).toMatch(/allow-live/);
  });
});
