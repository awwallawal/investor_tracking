// Story 11.11 CLI: same service as the dialog; dry run by default; counts and keys only.
// Synthetic fixture only.
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Investor = require('../src/models/InvestorModel');
const InteractionLog = require('../src/models/InteractionLog');
const LifecycleStatus = require('../src/models/LifecycleStatusModel');
const ChangeLog = require('../src/models/ChangeLog');
const { parseArgs, run } = require('./import-investors');

const file = () => Buffer.from(JSON.stringify({
  records: [
    {
      key: 'cli alpha', action: 'create',
      investor: { investorName: 'CLI Alpha Ltd', email: 'cli.alpha@example.test', phoneNumber: '0800 111 2222', sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other' },
      project: { projectTitle: 'CLI Plant', lifecycleStatusName: 'Idea' },
    },
    { key: 'cli missing', action: 'update-existing', existingAppNames: ['CLI Missing Co'], investor: {} },
  ],
  interactions: [{ id: 'CLI-1', date: '2025-01-01', investorName: 'CLI Alpha Ltd', description: 'Synthetic', serviceCodes: ['M4'] }],
}));

let lines;
const log = (l) => lines.push(l);
let dg;

beforeEach(async () => {
  lines = [];
  await ChangeLog.collection.deleteMany({});
  dg = await User.findOne({ email: 'dg@example.com' });
  expect(await LifecycleStatus.exists({ name: 'Idea' })).toBeTruthy();
});

describe('import-investors CLI', () => {
  it('dry run writes nothing and prints counts and keys only', async () => {
    const before = await Investor.countDocuments();
    const { report } = await run({ input: file(), log });
    expect(report.counts).toMatchObject({ create: 1, errors: 1, interactionsToCreate: 1 });
    expect(await Investor.countDocuments()).toBe(before);
    expect(await ChangeLog.countDocuments()).toBe(0);
    const out = lines.join('\n');
    expect(out).toContain('DRY RUN');
    expect(out).toContain('To create: 1');
    expect(out).toContain('key "cli missing"');
    ['CLI Alpha Ltd', 'CLI Missing Co', 'cli.alpha@example.test', '0800 111 2222'].forEach((pii) => expect(out).not.toContain(pii));
  });

  it('--apply writes; a second apply creates 0', async () => {
    const first = await run({ input: file(), apply: true, actor: dg, log });
    expect(first.result.counts).toMatchObject({ created: 1, projectsCreated: 1, interactionsCreated: 1 });
    expect(await InteractionLog.countDocuments({ importRef: 'CLI-1' })).toBe(1);
    const second = await run({ input: file(), apply: true, actor: dg, log });
    expect(second.result.counts).toMatchObject({ created: 0, projectsCreated: 0, interactionsCreated: 0 });
    expect(lines.join('\n')).not.toContain('cli.alpha@example.test');
  });

  it('refuses the live database name without --allow-live', async () => {
    const realName = mongoose.connection.name;
    let err;
    try {
      mongoose.connection.name = 'test';
      await run({ input: file(), apply: true, actor: dg, log }).catch((e) => { err = e; });
    } finally {
      mongoose.connection.name = realName;
    }
    expect(err && err.message).toMatch(/allow-live/);
    expect(await Investor.exists({ investorName: 'CLI Alpha Ltd' })).toBeNull();
  });

  it('refuses a Staff (or missing) actor before writing anything', async () => {
    const staff = await User.create({ name: 'CLI Staff', email: 'cli.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
    const before = await Investor.countDocuments();
    for (const actor of [staff, null]) {
      let err;
      await run({ input: file(), apply: true, actor, log }).catch((e) => { err = e; });
      expect(err && err.message).toMatch(/Director-General or Portal-Admin/);
    }
    expect(await Investor.countDocuments()).toBe(before);
    expect(await ChangeLog.countDocuments()).toBe(0);
    expect(await InteractionLog.countDocuments({ importRef: 'CLI-1' })).toBe(0);
  });

  it('parses args', () => {
    expect(parseArgs(['--file', 'x.json'])).toEqual({ file: 'x.json', uriEnv: 'MONGO_URI', apply: false, allowLive: false, as: null });
    expect(parseArgs(['--file=x.json', '--uri-env', 'MONGO_URI_TEST', '--apply', '--as', 'dg@example.com', '--allow-live']))
      .toEqual({ file: 'x.json', uriEnv: 'MONGO_URI_TEST', apply: true, allowLive: true, as: 'dg@example.com' });
    expect(() => parseArgs([])).toThrow(/--file/);
    expect(() => parseArgs(['--file', 'x.json', '--apply'])).toThrow(/--as/);
    expect(() => parseArgs(['--file', 'x.json', '--force'])).toThrow(/Unknown argument/);
  });
});
