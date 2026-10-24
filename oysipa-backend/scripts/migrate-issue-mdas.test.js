// Story 11.7c migration: issue MDA names → codes. Synthetic data only.
// Runs on the jest test connection (database name ends in _test/healthcheck).
const mongoose = require('mongoose');
const InvestorIssue = require('../src/models/InvestorIssue');
const { migrate } = require('./migrate-issue-mdas');

// The 11.7 hand-written names, as stored before 11.7c.
const OLD_NAMES = [
  'Ministry of Lands, Housing and Urban Development',
  'Ministry of Trade, Investment and Cooperatives',
  'Ministry of Environment and Natural Resources',
  'Oyo State Internal Revenue Service (OYSIRS)',
  'Office of the Surveyor-General',
  'Ministry of Agriculture / OYSADA',
  'Ministry of Culture and Tourism',
  'Ministry of Public Works and Transport',
  'Ministry of Energy and Mineral Resources',
  'Ministry of Finance',
  'Ministry of Justice',
  'Local Government',
  'OYSIPA',
  'Other',
];

let lines;
const log = (line) => lines.push(line);
const raw = () => InvestorIssue.collection.find({}).sort({ _id: 1 }).toArray();
const past = new Date('2026-01-02T00:00:00.000Z');
const insert = (ref, mdaResponsible) => InvestorIssue.collection.insertOne({
  investor: new mongoose.Types.ObjectId(),
  dateRegistered: past,
  dateReported: past,
  category: 'other',
  description: 'Synthetic',
  status: 'Open',
  importRef: ref,
  ...(mdaResponsible !== undefined && { mdaResponsible }),
  createdAt: past,
  updatedAt: past,
}).then((r) => r.insertedId);

let oldId;
let codeId;
let badId;
let qualId;

beforeAll(() => InvestorIssue.init());
beforeEach(async () => {
  lines = [];
  await InvestorIssue.deleteMany({});
  oldId = await insert('ISS-M1', OLD_NAMES);
  codeId = await insert('ISS-M2', ['TRADE', 'BIR']);
  badId = await insert('ISS-M3', ['Ministry of Finance', 'Ministry of Magic']);
  qualId = await insert('ISS-M4', ['OYSIPA (BOI and finance linkage)']);
});

describe('migrate-issue-mdas', () => {
  it('dry run writes nothing and reports counts and unresolved values', async () => {
    const before = await raw();
    const s = await migrate({ apply: false, log });
    expect(await raw()).toEqual(before);
    expect(s).toMatchObject({
      total: 4, alreadyCodes: 1, wouldChange: 2, changed: 0, unresolvedIssues: 1, qualified: 1,
    });
    expect(s.unresolvedValues).toEqual(['"Ministry of Magic"']);
    const out = lines.join('\n');
    expect(out).toContain('DRY RUN');
    expect(out).toContain(String(badId));
  });

  it('apply converts every old name, leaves other fields and unresolved issues untouched; a second run changes 0', async () => {
    const before = await raw();
    const s = await migrate({ apply: true, log });
    expect(s.changed).toBe(2);

    const old = await InvestorIssue.collection.findOne({ _id: oldId });
    expect(old.mdaResponsible).toEqual([
      'LANDS AND HOUSING', 'TRADE', 'ENVIRONMENT', 'BIR', 'SURVEYOR GENERAL', 'AGRICULTURE', 'OYSADA',
      'CULTURE AND TOURISM', 'WORKS AND TRANSPORT', 'ENERGY RESOURCES', 'FINANCE', 'JUSTICE',
      'LOCAL GOVERNMENT', 'OYSIPA', 'OTHER',
    ]);
    const strip = (doc) => {
      const copy = { ...doc };
      delete copy.mdaResponsible;
      return copy;
    };
    // updatedAt and every other field kept
    expect(strip(old)).toEqual(strip(before.find((i) => String(i._id) === String(oldId))));
    expect((await InvestorIssue.collection.findOne({ _id: qualId })).mdaResponsible).toEqual(['OYSIPA']);
    expect((await InvestorIssue.collection.findOne({ _id: codeId })).mdaResponsible).toEqual(['TRADE', 'BIR']);
    expect((await InvestorIssue.collection.findOne({ _id: badId })).mdaResponsible).toEqual(['Ministry of Finance', 'Ministry of Magic']);
    // The converted issue now passes the model's code enum.
    await expect(InvestorIssue.hydrate(old).validate()).resolves.toBeUndefined();

    const snap = await raw();
    const second = await migrate({ apply: true, log });
    expect(second.changed).toBe(0);
    expect(second.alreadyCodes).toBe(3);
    expect(await raw()).toEqual(snap);
  });

  it('missing, null or empty → "no MDA"; a non-list value is unresolved and left untouched', async () => {
    const missingId = await insert('ISS-M5', undefined);
    const nullId = await insert('ISS-M6', null);
    const emptyId = await insert('ISS-M7', []);
    const stringId = await insert('ISS-M8', 'Ministry of Finance');
    const before = await raw();
    const s = await migrate({ apply: true, log });
    expect(s).toMatchObject({
      total: 8, noMda: 3, alreadyCodes: 1, changed: 2, unresolvedIssues: 2,
    });
    expect(s.unresolvedValues).toEqual(expect.arrayContaining(['"Ministry of Magic"', '"Ministry of Finance"']));
    const after = await raw();
    [missingId, nullId, emptyId, stringId].forEach((id) => {
      const find = (list) => list.find((i) => String(i._id) === String(id));
      expect(find(after)).toEqual(find(before));
    });
    expect(lines.some((l) => l.includes(String(stringId)) && l.includes('SKIP'))).toBe(true);
  });

  it('states the deploy-order note in the output', async () => {
    await migrate({ apply: false, log });
    expect(lines).toContain('Run this right after deploying 11.7c: until it runs, issues still holding MDA names cannot have their status changed.');
  });

  it('refuses the live database name', async () => {
    const realName = mongoose.connection.name;
    let err;
    try {
      mongoose.connection.name = 'test';
      await migrate({ apply: true, log }).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(err && err.message).toMatch(/allow-live/);
  });
});
