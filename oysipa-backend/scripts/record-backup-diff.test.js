// Story 11.10: ChangeLog rows for past data fixes, from a backup folder.
// Synthetic backup folder (os.tmpdir) and synthetic data only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const InvestorIssue = require('../src/models/InvestorIssue');
const InvestmentAnnouncement = require('../src/models/InvestmentAnnouncement');
const InvestmentProject = require('../src/models/InvestmentProject');
const ChangeLog = require('../src/models/ChangeLog');
const { parseArgs, run } = require('./record-backup-diff');

const { EJSON } = mongoose.mongo.BSON;

let dir;
let lines;
let actor;
const log = (l) => lines.push(l);
const past = new Date('2026-10-20T10:00:00.000Z');

const rawIssue = (fields) => ({
  _id: new mongoose.Types.ObjectId(),
  investor: new mongoose.Types.ObjectId(),
  dateRegistered: past,
  dateReported: past,
  category: 'other',
  description: 'Synthetic issue',
  status: 'Open',
  mdaResponsible: [],
  actions: [],
  createdAt: past,
  updatedAt: past,
  ...fields,
});

// Writes <db>.<collection>.json the way backup-live-db.js does (canonical EJSON).
const writeBackup = (collectionName, docs) => {
  const file = path.join(dir, `${mongoose.connection.name}.${collectionName}.json`);
  fs.writeFileSync(file, `[\n${docs.map((d) => EJSON.stringify(d, { relaxed: false })).join(',\n')}\n]\n`);
};

beforeEach(async () => {
  lines = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-diff-'));
  await InvestorIssue.collection.deleteMany({});
  await InvestmentAnnouncement.collection.deleteMany({});
  await ChangeLog.collection.deleteMany({});
  actor = await User.findOne({ email: 'dg@example.com' });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('record-backup-diff', () => {
  const setup = async () => {
    // Backup (before the fix) → database now (after the fix).
    const a = rawIssue({ importRef: 'ISS-01', mdaResponsible: ['Ministry of Lands'] });
    const b = rawIssue({ importRef: 'ISS-02', mdaResponsible: ['Ministry of Trade', 'Tax'] });
    const same = rawIssue({ importRef: 'ISS-03', mdaResponsible: ['BIR'] });
    const gone = rawIssue({ importRef: 'ISS-04', mdaResponsible: ['Tax'] });
    writeBackup('investorissues', [a, b, same, gone]);
    await InvestorIssue.collection.insertMany([
      { ...a, mdaResponsible: ['LANDS AND HOUSING'] },
      { ...b, mdaResponsible: ['TRADE', 'BIR'] },
      same,
    ]);
    return {
      a, b, same, gone,
    };
  };
  const args = (extra = {}) => ({
    backupDir: dir, entity: 'InvestorIssue', fields: ['mdaResponsible'], reason: 'migration: migrate-issue-mdas', log, ...extra,
  });

  it('dry run lists the differing documents and writes nothing', async () => {
    const { a, b, gone } = await setup();
    const s = await run(args());
    expect(s).toMatchObject({
      backup: 4, selected: 4, notInDb: 1, noDifference: 1, wouldRecord: 2, recorded: 0,
    });
    expect(await ChangeLog.countDocuments()).toBe(0);
    const out = lines.join('\n');
    expect(out).toContain('DRY RUN');
    expect(out).toContain(`${a._id} (ISS-01): would record mdaResponsible`);
    expect(out).toContain(`${b._id} (ISS-02): would record mdaResponsible`);
    expect(out).toContain(`${gone._id} (ISS-04): SKIP - not in the database now`);
    // Field names only, never values.
    expect(out).not.toContain('Ministry of Lands');
    expect(out).not.toContain('LANDS AND HOUSING');
  });

  it('apply writes one update row per differing document (old = backup, new = now, snapshot = backup); a repeat writes none', async () => {
    const { a, b } = await setup();
    const s = await run(args({ apply: true, actor }));
    expect(s).toMatchObject({ recorded: 2, failed: 0 });
    const rows = await ChangeLog.find({}).lean();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
    const rowA = rows.find((r) => String(r.entityId) === String(a._id));
    expect(rowA).toMatchObject({
      entity: 'InvestorIssue', action: 'update', reason: 'migration: migrate-issue-mdas', byName: 'DG User', role: 'Director-General',
    });
    expect(String(rowA.by)).toBe(String(actor._id));
    expect(rowA.changes).toEqual([{ field: 'mdaResponsible', old: ['Ministry of Lands'], new: ['LANDS AND HOUSING'] }]);
    expect(rowA.snapshot.mdaResponsible).toEqual(['Ministry of Lands']);
    expect(rowA.snapshot.createdAt.toISOString()).toBe(past.toISOString());
    // Row time is the server time it was written (not backdated).
    expect(rowA.createdAt.getTime()).toBeGreaterThan(Date.now() - 60000);
    const rowB = rows.find((r) => String(r.entityId) === String(b._id));
    expect(rowB.changes).toEqual([{ field: 'mdaResponsible', old: ['Ministry of Trade', 'Tax'], new: ['TRADE', 'BIR'] }]);

    lines = [];
    const again = await run(args({ apply: true, actor }));
    expect(again).toMatchObject({ alreadyRecorded: 2, recorded: 0 });
    expect(await ChangeLog.countDocuments()).toBe(2);
  });

  it('--refs limits the run to those documents; several fields are compared; unknown refs are reported', async () => {
    const a = rawIssue({ importRef: 'ISS-08', actions: [], description: 'Old' });
    const b = rawIssue({ importRef: 'ISS-09', actions: [], description: 'Old' });
    writeBackup('investorissues', [a, b]);
    const note = {
      _id: new mongoose.Types.ObjectId(), date: past, by: 'BOI', note: 'Synthetic note', recordedBy: actor._id, recordedAt: past,
    };
    await InvestorIssue.collection.insertMany([{ ...a, actions: [note] }, { ...b, actions: [note] }]);
    const s = await run(args({
      fields: ['actions', 'description'], refField: 'importRef', refs: ['ISS-08', 'ISS-77'], reason: 'migration: ISS-08 BOI note', apply: true, actor,
    }));
    expect(s).toMatchObject({ selected: 1, recorded: 1, missingRefs: ['ISS-77'] });
    const rows = await ChangeLog.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].entityId)).toBe(String(a._id));
    expect(rows[0].changes.map((c) => c.field)).toEqual(['actions']);
    expect(rows[0].changes[0].old).toEqual([]);
    expect(rows[0].changes[0].new[0].note).toBe('Synthetic note');
  });

  it('works for announcements (several fields)', async () => {
    const ann = {
      _id: new mongoose.Types.ObjectId(),
      project: new mongoose.Types.ObjectId(),
      announcementDate: past,
      outlet: 'Synthetic outlet',
      oysipaNamed: false,
      supportingInteractions: [],
      importRef: 'ANN-SYN-01',
      createdAt: past,
      updatedAt: past,
    };
    writeBackup('investmentannouncements', [ann]);
    await InvestmentAnnouncement.collection.insertOne({
      ...ann, oysipaNamed: true, oysipaRoleText: 'Synthetic role', importNote: 'Synthetic note',
    });
    const s = await run(args({
      entity: 'InvestmentAnnouncement', fields: ['oysipaNamed', 'oysipaRoleText', 'importNote'], reason: 'migration: ANN-SYN-01 OYSIPA named', refs: ['ANN-SYN-01'], refField: 'importRef', apply: true, actor,
    }));
    expect(s.recorded).toBe(1);
    const row = await ChangeLog.findOne({}).lean();
    expect(row.entity).toBe('InvestmentAnnouncement');
    expect(row.changes).toEqual([
      { field: 'oysipaNamed', old: false, new: true },
      { field: 'oysipaRoleText', old: null, new: 'Synthetic role' },
      { field: 'importNote', old: null, new: 'Synthetic note' },
    ]);
  });

  it('apply without an actor is refused; a missing backup file is an error; the live db is refused', async () => {
    await setup();
    await expect(run(args({ apply: true }))).rejects.toThrow(/--apply needs --as/);
    await expect(run(args({ entity: 'Setting', fields: ['value'] }))).rejects.toThrow(/Backup file not found/);
    const realName = mongoose.connection.name;
    let err;
    try {
      mongoose.connection.name = 'test';
      await run(args({ apply: true, actor })).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(err && err.message).toMatch(/allow-live/);
    expect(await ChangeLog.countDocuments()).toBe(0);
  });

  it('parses args', () => {
    const base = ['--backup', 'C:/b', '--entity', 'InvestorIssue', '--fields', 'mdaResponsible, reference', '--reason', 'migration: x'];
    expect(parseArgs(base)).toMatchObject({
      backup: 'C:/b', entity: 'InvestorIssue', fields: ['mdaResponsible', 'reference'], reason: 'migration: x', uriEnv: 'MONGO_URI', apply: false, refs: null,
    });
    expect(parseArgs([...base, '--refs', 'ISS-01,ISS-02', '--uri-env=MONGO_URI_LIVE', '--allow-live', '--apply', '--as', 'dg@example.com'])).toMatchObject({
      refs: ['ISS-01', 'ISS-02'], refField: 'importRef', uriEnv: 'MONGO_URI_LIVE', allowLive: true, apply: true, as: 'dg@example.com',
    });
    expect(() => parseArgs([...base, '--apply'])).toThrow(/--apply needs --as/);
    expect(() => parseArgs(base.map((a) => (a === 'migration: x' ? 'fix' : a)))).toThrow(/migration: /);
    expect(() => parseArgs([...base.slice(0, 2), '--entity', 'User', ...base.slice(4)])).toThrow(/--entity/);
    expect(() => parseArgs(['--backup', 'x'])).toThrow();
    expect(() => parseArgs([...base, '--force'])).toThrow(/Unknown argument/);
  });
});

describe('record-backup-diff review follow-ups (story 11.10)', () => {
  afterEach(() => jest.restoreAllMocks());
  const base = (extra = {}) => ({
    backupDir: dir, entity: 'InvestorIssue', fields: ['mdaResponsible'], reason: 'migration: migrate-issue-mdas', log, ...extra,
  });

  it('an audit write failure is logged and counted; the run continues', async () => {
    const a = rawIssue({ importRef: 'ISS-01', mdaResponsible: ['Tax'] });
    const b = rawIssue({ importRef: 'ISS-02', mdaResponsible: ['Tax'] });
    writeBackup('investorissues', [a, b]);
    await InvestorIssue.collection.insertMany([{ ...a, mdaResponsible: ['BIR'] }, { ...b, mdaResponsible: ['BIR'] }]);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit store down'));
    const s = await run(base({ apply: true, actor }));
    expect(s).toMatchObject({ recorded: 1, failed: 1 });
    expect(lines.some((l) => l.includes('FAILED to record'))).toBe(true);
    expect(errSpy).toHaveBeenCalledWith('[audit] ChangeLog write failed', expect.objectContaining({ entity: 'InvestorIssue', action: 'update' }));
    expect(await ChangeLog.countDocuments()).toBe(1);
  });

  it('"already recorded" needs the same reason AND the same fields', async () => {
    const a = rawIssue({ importRef: 'ISS-01', mdaResponsible: ['Tax'], description: 'Old' });
    writeBackup('investorissues', [a]);
    await InvestorIssue.collection.insertOne({ ...a, mdaResponsible: ['BIR'], description: 'New' });
    await run(base({ apply: true, actor }));
    lines = [];
    const other = await run(base({ fields: ['description'], apply: true, actor }));
    expect(other).toMatchObject({ recorded: 1, alreadyRecorded: 0 });
    const again = await run(base({ fields: ['description'], apply: true, actor }));
    expect(again).toMatchObject({ recorded: 0, alreadyRecorded: 1 });
    expect(await ChangeLog.countDocuments()).toBe(2);
  });

  it('reads the backup as relaxed EJSON: canonical numbers equal to the stored numbers are no difference', async () => {
    const proj = {
      _id: new mongoose.Types.ObjectId(), projectTitle: 'Synthetic plant', investor: new mongoose.Types.ObjectId(), lifecycleStatus: new mongoose.Types.ObjectId(), estimatedValue: 5, estimatedNumberOfJobs: 12, createdAt: past, updatedAt: past,
    };
    writeBackup('investmentprojects', [proj]);
    await InvestmentProject.collection.insertOne({ ...proj, estimatedNumberOfJobs: 20 });
    const s = await run(base({ entity: 'InvestmentProject', fields: ['estimatedValue', 'estimatedNumberOfJobs'], reason: 'migration: synthetic', apply: true, actor }));
    expect(s.recorded).toBe(1);
    const row = await ChangeLog.findOne({}).lean();
    expect(row.changes).toEqual([{ field: 'estimatedNumberOfJobs', old: 12, new: 20 }]);
  });

  it('refuses bookkeeping or dotted fields and an empty --refs; --refs defaults the ref field to importRef', async () => {
    const args = ['--backup', 'x', '--entity', 'InvestorIssue', '--reason', 'migration: x'];
    ['_id', 'createdAt', 'updatedAt', '__v', 'actions.note'].forEach((f) => {
      expect(() => parseArgs([...args, '--fields', f])).toThrow(/--fields cannot include/);
    });
    expect(() => parseArgs([...args, '--fields', 'status', '--refs', ' , '])).toThrow(/at least one ref/);
    expect(parseArgs([...args, '--fields', 'status', '--refs', 'ISS-01']).refField).toBe('importRef');
    await expect(run(base({ fields: ['createdAt'] }))).rejects.toThrow(/--fields cannot include/);
    await expect(run(base({ refs: [] }))).rejects.toThrow(/at least one ref/);

    const a = rawIssue({ importRef: 'ISS-05', mdaResponsible: ['Tax'] });
    writeBackup('investorissues', [a, rawIssue({ importRef: 'ISS-06', mdaResponsible: ['Tax'] })]);
    await InvestorIssue.collection.insertOne({ ...a, mdaResponsible: ['BIR'] });
    const s = await run(base({ refs: ['ISS-05'] }));
    expect(s).toMatchObject({ selected: 1, wouldRecord: 1 });
  });
});
