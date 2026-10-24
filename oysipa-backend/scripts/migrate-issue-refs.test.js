// Story 11.7b backfill: InvestorIssue.reference (ISS-NN). Synthetic data only.
// Runs on the jest test connection (database name ends in _test/healthcheck).
const mongoose = require('mongoose');
const InvestorIssue = require('../src/models/InvestorIssue');
const { migrate } = require('./migrate-issue-refs');
const User = require('../src/models/User');
const ChangeLog = require('../src/models/ChangeLog');

// Story 11.10: an apply run is recorded as a DG / Portal-Admin user (jest.setup seeds dg@example.com).
let actor;
beforeEach(async () => {
  actor = await User.findOne({ email: 'dg@example.com' });
});


let lines;
const log = (line) => lines.push(line);
const raw = () => InvestorIssue.collection.find({}).sort({ _id: 1 }).toArray();
const insert = (fields, createdAt) => InvestorIssue.collection.insertOne({
  investor: new mongoose.Types.ObjectId(),
  dateRegistered: createdAt,
  dateReported: createdAt,
  category: 'other',
  description: 'Synthetic',
  status: 'Open',
  mdaResponsible: [],
  createdAt,
  updatedAt: createdAt,
  ...fields,
}).then((r) => r.insertedId);
const day = (d) => new Date(`2026-${d}T00:00:00.000Z`);
const refOf = async (id) => (await InvestorIssue.collection.findOne({ _id: id })).reference;

beforeAll(() => InvestorIssue.init());
beforeEach(async () => {
  lines = [];
  await InvestorIssue.deleteMany({});
});

describe('migrate-issue-refs', () => {
  it('8 loaded issues: dry run writes nothing; apply sets reference = importRef; a second run changes 0', async () => {
    const ids = [];
    for (let n = 1; n <= 8; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      ids.push(await insert({ importRef: `ISS-0${n}` }, day('10-23')));
    }
    const before = await raw();
    const dry = await migrate({ apply: false, log });
    expect(dry).toMatchObject({
      total: 8, alreadySet: 0, fromImportRef: 8, nextFree: 0, wouldSet: 8, set: 0,
    });
    expect(await raw()).toEqual(before);
    expect(lines.join('\n')).toContain('DRY RUN');

    const applied = await migrate({ apply: true, log, actor });
    expect(applied).toMatchObject({ set: 8, failed: 0 });
    for (let n = 1; n <= 8; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await refOf(ids[n - 1])).toBe(`ISS-0${n}`);
    }
    // Only reference written: updatedAt and every other field kept.
    const after = await raw();
    after.forEach((doc, i) => {
      const { reference, ...rest } = doc;
      expect(rest).toEqual(before[i]);
    });

    const snap = await raw();
    const second = await migrate({ apply: true, log, actor });
    expect(second).toMatchObject({ alreadySet: 8, set: 0, wouldSet: 0 });
    expect(await raw()).toEqual(snap);
  });

  it('issues without an ISS-NN importRef get the next free numbers, oldest createdAt first; existing references are kept', async () => {
    const loaded = await insert({ importRef: 'ISS-02' }, day('03-01'));
    const kept = await insert({ reference: 'ISS-05' }, day('01-01'));
    const newer = await insert({}, day('06-01'));
    const older = await insert({ importRef: 'S-LEGACY' }, day('02-01'));
    const s = await migrate({ apply: true, log, actor });
    expect(s).toMatchObject({
      total: 4, alreadySet: 1, fromImportRef: 1, nextFree: 2, set: 3,
    });
    expect(await refOf(loaded)).toBe('ISS-02');
    expect(await refOf(kept)).toBe('ISS-05');
    expect(await refOf(older)).toBe('ISS-06');
    expect(await refOf(newer)).toBe('ISS-07');
  });

  it('an importRef already used as another issue\'s reference gets the next free number', async () => {
    await insert({ reference: 'ISS-01' }, day('01-01'));
    const clash = await insert({ importRef: 'ISS-01' }, day('02-01'));
    await migrate({ apply: true, log, actor });
    expect(await refOf(clash)).toBe('ISS-02');
    expect(lines.some((l) => l.includes('importRef ISS-01 is already used'))).toBe(true);
  });

  it("'' and null references count as missing and are written; ISS-5 references are compared canonically", async () => {
    const empty = await insert({ reference: '', importRef: 'ISS-5' }, day('01-01'));
    const nul = await insert({ reference: null }, day('02-01'));
    await insert({ reference: 'ISS-07' }, day('03-01'));
    const s = await migrate({ apply: true, log, actor });
    expect(s).toMatchObject({ alreadySet: 1, set: 2, failed: 0 });
    expect(await refOf(empty)).toBe('ISS-05');
    expect(await refOf(nul)).toBe('ISS-08');
    expect(lines).toContain('Run right after deploying 11.7b; if a row reports FAILED, run it again.');
    const second = await migrate({ apply: true, log, actor });
    expect(second.set).toBe(0);
  });

  it('prints ids, refs and counts only (no descriptions or other values)', async () => {
    await insert({ importRef: 'ISS-01', description: 'Very private synthetic text' }, day('01-01'));
    await migrate({ apply: false, log });
    expect(lines.join('\n')).not.toContain('Very private');
  });

  it('refuses the live database name', async () => {
    const realName = mongoose.connection.name;
    let err;
    try {
      mongoose.connection.name = 'test';
      await migrate({ apply: true, log, actor }).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(err && err.message).toMatch(/allow-live/);
  });
});

describe('migrate-issue-refs audit rows (story 11.10)', () => {
  it('--apply with an actor writes one update row per changed issue (reason, batchId, old/new); a second run writes none', async () => {
    const a = await insert({ importRef: 'ISS-01' }, day('01-01'));
    const b = await insert({}, day('02-01'));
    await insert({ reference: 'ISS-09' }, day('03-01'));
    await ChangeLog.collection.deleteMany({});
    const s = await migrate({ apply: true, log, actor });
    expect(s).toMatchObject({ set: 2, auditRows: 2, auditFailed: 0 });
    const rows = await ChangeLog.find({ reason: 'migration: migrate-issue-refs' }).sort({ createdAt: 1 }).lean();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
    rows.forEach((r) => {
      expect(r).toMatchObject({ entity: 'InvestorIssue', action: 'update', byName: 'DG User', role: 'Director-General' });
      expect(String(r.by)).toBe(String(actor._id));
      expect(r.createdAt).toBeInstanceOf(Date);
    });
    const rowA = rows.find((r) => String(r.entityId) === String(a));
    expect(rowA.changes).toEqual([{ field: 'reference', old: null, new: 'ISS-01' }]);
    expect(rowA.snapshot.importRef).toBe('ISS-01');
    const rowB = rows.find((r) => String(r.entityId) === String(b));
    expect(rowB.changes).toEqual([{ field: 'reference', old: null, new: 'ISS-10' }]);

    await migrate({ apply: true, log, actor });
    expect(await ChangeLog.countDocuments({ reason: 'migration: migrate-issue-refs' })).toBe(2);
  });

  it('--apply without an actor is refused and nothing is written', async () => {
    await insert({ importRef: 'ISS-01' }, day('01-01'));
    const before = await raw();
    await expect(migrate({ apply: true, log })).rejects.toThrow(/--apply needs --as/);
    expect(await raw()).toEqual(before);
    expect(await ChangeLog.countDocuments({ reason: 'migration: migrate-issue-refs' })).toBe(0);
  });

  it('a dry run writes no ChangeLog row', async () => {
    await insert({ importRef: 'ISS-01' }, day('01-01'));
    await migrate({ apply: false, log });
    expect(await ChangeLog.countDocuments({ reason: 'migration: migrate-issue-refs' })).toBe(0);
  });
});

describe('migrate-issue-refs when an audit write fails (story 11.10)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('the run continues, the data changes, auditFailed is 1 and FAILED is logged', async () => {
    const a = await insert({ importRef: 'ISS-01' }, day('01-01'));
    const b = await insert({ importRef: 'ISS-02' }, day('02-01'));
    await ChangeLog.collection.deleteMany({});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('audit store down'));
    const s = await migrate({ apply: true, log, actor });
    expect(s).toMatchObject({ set: 2, auditRows: 1, auditFailed: 1 });
    expect(await refOf(a)).toBe('ISS-01');
    expect(await refOf(b)).toBe('ISS-02');
    expect(lines.some((l) => l.includes('audit row FAILED'))).toBe(true);
    expect(lines.some((l) => l.includes('audit rows FAILED: 1'))).toBe(true);
    expect(errSpy).toHaveBeenCalledWith('[audit] ChangeLog write failed', expect.objectContaining({ entity: 'InvestorIssue', action: 'update' }));
    expect(await ChangeLog.countDocuments({ reason: 'migration: migrate-issue-refs' })).toBe(1);
  });
});
