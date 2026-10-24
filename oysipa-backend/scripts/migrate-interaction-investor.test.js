// Story 11.4 migration: back-fill InteractionLog.investor from the project.
// Runs on the jest test connection (database name ends in _test/healthcheck).
const mongoose = require('mongoose');
const InteractionLog = require('../src/models/InteractionLog');
const {
  migrate, parseArgs, assertDbAllowed, CATEGORY_CODE_MAPPING, resolveActor, assertActor, BAD_ACTOR_MSG,
} = require('./migrate-interaction-investor');
const User = require('../src/models/User');
const ChangeLog = require('../src/models/ChangeLog');

// Story 11.10: an apply run is recorded as a DG / Portal-Admin user (jest.setup seeds dg@example.com).
let actor;
beforeEach(async () => {
  actor = await User.findOne({ email: 'dg@example.com' });
});


const ORPHAN_PROJECT = new mongoose.Types.ObjectId();

let ids;
let lines;
const log = (line) => lines.push(line);

// Insert raw so the model hook does not fill investor (old records).
const insertRaw = async (doc) => {
  const past = new Date(Date.now() - 86400000);
  const { insertedId } = await InteractionLog.collection.insertOne({
    loggedBy: new mongoose.Types.ObjectId(global.mockUserId), description: 'Old', category: 'Meeting', createdAt: past, updatedAt: past, ...doc,
  });
  return insertedId;
};

const snapshot = async () => (await InteractionLog.collection.find({}).sort({ _id: 1 }).toArray());

beforeEach(async () => {
  lines = [];
  ids = {
    old1: await insertRaw({ project: new mongoose.Types.ObjectId(global.mockProjectId) }),
    old2: await insertRaw({ project: new mongoose.Types.ObjectId(global.mockProjectId), category: 'Call' }),
    orphan: await insertRaw({ project: ORPHAN_PROJECT }),
    hasInvestor: (await InteractionLog.create({ investor: global.investorId, loggedBy: global.mockUserId, description: 'New', category: 'Email' }))._id,
  };
});

describe('migrate-interaction-investor', () => {
  it('dry run writes nothing and logs every candidate', async () => {
    const before = await snapshot();
    const summary = await migrate({ apply: false, log });
    expect(await snapshot()).toEqual(before);
    expect(summary).toMatchObject({ missingInvestor: 3, wouldChange: 2, changed: 0, skippedOrphan: 1 });
    expect(lines.some((l) => l.includes('DRY RUN'))).toBe(true);
    expect(lines.some((l) => l.includes(String(ids.old1)) && l.includes('would set investor'))).toBe(true);
    expect(lines.some((l) => l.includes(String(ids.orphan)) && l.includes('SKIP'))).toBe(true);
  });

  it('apply fills investor from the project, keeps updatedAt, sets no codes; second apply changes 0', async () => {
    const before = await InteractionLog.collection.findOne({ _id: ids.old1 });
    const first = await migrate({ apply: true, log, actor });
    expect(first.changed).toBe(2);
    expect(first.skippedOrphan).toBe(1);
    for (const id of [ids.old1, ids.old2]) {
      const rec = await InteractionLog.collection.findOne({ _id: id });
      expect(String(rec.investor)).toBe(global.investorId);
      expect(rec.serviceCodes).toBeUndefined();
      expect(rec.category).toBeDefined();
    }
    const after = await InteractionLog.collection.findOne({ _id: ids.old1 });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.category).toBe('Meeting');
    expect(lines.some((l) => l.includes(String(ids.old1)) && l.includes('set investor'))).toBe(true);

    // Orphan skipped and untouched
    const orphan = await InteractionLog.collection.findOne({ _id: ids.orphan });
    expect(orphan.investor).toBeUndefined();

    const snap = await snapshot();
    lines = [];
    const second = await migrate({ apply: true, log, actor });
    expect(second.changed).toBe(0);
    expect(await snapshot()).toEqual(snap);
    expect(lines).toContain('Changed: 0');
  });

  it('prints the empty mapping table and "no codes set"', async () => {
    expect(CATEGORY_CODE_MAPPING).toEqual({});
    await migrate({ apply: false, log });
    expect(lines.some((l) => l.includes('mapping table'))).toBe(true);
    expect(lines.some((l) => l.includes('no codes set'))).toBe(true);
  });

  it('refuses database "test" without --allow-live', () => {
    expect(() => assertDbAllowed('test', false)).toThrow(/allow-live/);
    expect(() => assertDbAllowed('test', true)).not.toThrow();
    expect(() => assertDbAllowed('oysipa_dev', false)).not.toThrow();
  });

  it('migrate() itself refuses when the connection is the live db name', async () => {
    const before = await snapshot();
    const realName = mongoose.connection.name;
    let err;
    try {
      // Pretend to be connected to the live db; migrate() checks the name first.
      mongoose.connection.name = 'test';
      await migrate({ apply: true, log, actor }).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(mongoose.connection.name).toBe(realName);
    expect(err && err.message).toMatch(/allow-live/);
    expect(await snapshot()).toEqual(before);
  });

  it('parses args: defaults, flags, and rejects unknown args', () => {
    expect(parseArgs([])).toEqual({
      uriEnv: 'MONGO_URI', apply: false, allowLive: false, as: null,
    });
    expect(parseArgs(['--uri-env', 'MONGO_URI_TEST', '--apply', '--as', 'dg@example.com'])).toEqual({
      uriEnv: 'MONGO_URI_TEST', apply: true, allowLive: false, as: 'dg@example.com',
    });
    expect(parseArgs(['--uri-env=MONGO_URI_LIVE', '--allow-live', '--as=pa@example.com'])).toEqual({
      uriEnv: 'MONGO_URI_LIVE', apply: false, allowLive: true, as: 'pa@example.com',
    });
    // Story 11.10: --apply without --as is refused.
    expect(() => parseArgs(['--apply'])).toThrow(/--apply needs --as/);
    expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--uri-env'])).toThrow();
  });
});

describe('migrate-interaction-investor audit rows (story 11.10)', () => {
  it('writes exactly one update row per changed log (no duplicate plugin row)', async () => {
    await ChangeLog.collection.deleteMany({});
    await migrate({ apply: true, log, actor });
    const rows = await ChangeLog.find({}).lean();
    expect(rows).toHaveLength(2);
    rows.forEach((r) => {
      expect(r).toMatchObject({ entity: 'InteractionLog', action: 'update', reason: 'migration: migrate-interaction-investor', byName: 'DG User' });
      expect(r.changes).toEqual([{ field: 'investor', old: null, new: new mongoose.Types.ObjectId(global.investorId) }]);
    });
    expect(rows.map((r) => String(r.entityId)).sort()).toEqual([String(ids.old1), String(ids.old2)].sort());
  });

  it('--apply without an actor is refused', async () => {
    await expect(migrate({ apply: true, log })).rejects.toThrow(/--apply needs --as/);
  });
});

describe('--as actor (story 11.10)', () => {
  it('Staff, an inactive DG and an unknown email are refused with BAD_ACTOR_MSG', async () => {
    await User.create({ name: 'Mig Staff', email: 'mig.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
    await User.create({ name: 'Old DG', email: 'old.dg@example.com', password: 'password123', role: 'Director-General', status: 'revoked' });
    await expect(resolveActor('mig.staff@example.com')).rejects.toThrow(BAD_ACTOR_MSG);
    await expect(resolveActor('old.dg@example.com')).rejects.toThrow(BAD_ACTOR_MSG);
    await expect(resolveActor('nobody@example.com')).rejects.toThrow(BAD_ACTOR_MSG);
  });

  it('a mixed-case, padded email of an active DG or Portal-Admin is accepted', async () => {
    expect((await resolveActor('  DG@Example.COM ')).name).toBe('DG User');
    expect((await resolveActor('Pa@example.com')).role).toBe('Portal-Admin');
  });

  it('assertActor(true, staff) throws; no actor on a dry run is fine', async () => {
    const staff = await User.create({ name: 'Mig Staff 2', email: 'mig.staff2@example.com', password: 'password123', role: 'Staff', status: 'active' });
    expect(() => assertActor(true, staff)).toThrow(BAD_ACTOR_MSG);
    expect(() => assertActor(true, null)).toThrow(/--apply needs --as/);
    expect(() => assertActor(false, null)).not.toThrow();
  });
});
