// Story 11.5 migration: leadSource / organisationType / currency back-fill.
// Runs on the jest test connection (database name ends in _test/healthcheck).
const mongoose = require('mongoose');
const Investor = require('../src/models/InvestorModel');
const InvestmentProject = require('../src/models/InvestmentProject');
const { migrate } = require('./migrate-lead-source');

let lines;
const log = (line) => lines.push(line);
const raw = async () => ({
  investors: await Investor.collection.find({}).sort({ _id: 1 }).toArray(),
  projects: await InvestmentProject.collection.find({}).sort({ _id: 1 }).toArray(),
});

let oldInv;
let setInv;
let oldProject;

beforeEach(async () => {
  lines = [];
  const past = new Date(Date.now() - 86400000);
  // Old records inserted raw (no schema defaults), like live data before 11.5.
  await Investor.collection.updateMany({}, { $unset: { organisationType: '' } });
  await InvestmentProject.collection.updateMany({}, { $unset: { currency: '' } });
  oldInv = (await Investor.collection.insertOne({ investorName: 'Old Co', sector: 'Agro', countryOfOrigin: 'NG', createdAt: past, updatedAt: past })).insertedId;
  setInv = (await Investor.create({ investorName: 'New Co', sector: 'Agro', countryOfOrigin: 'NG', leadSource: 'Other', organisationType: 'Intermediary' }))._id;
  oldProject = (await InvestmentProject.collection.insertOne({
    projectTitle: 'Old Project', investor: oldInv, lifecycleStatus: new mongoose.Types.ObjectId(), createdAt: past, updatedAt: past,
  })).insertedId;
  await InvestmentProject.create({ projectTitle: 'USD Project', investor: setInv, lifecycleStatus: new mongoose.Types.ObjectId(), currency: 'USD' });
});

describe('migrate-lead-source', () => {
  it('dry run writes nothing and logs each record', async () => {
    const before = await raw();
    const summary = await migrate({ apply: false, log });
    expect(await raw()).toEqual(before);
    // global seed investor + Old Co miss leadSource; both miss organisationType after the unset.
    expect(summary.leadSource).toMatchObject({ missing: 2, wouldChange: 2, changed: 0 });
    expect(summary.organisationType).toMatchObject({ missing: 2, wouldChange: 2 });
    expect(summary.currency).toMatchObject({ missing: 2, wouldChange: 2 });
    expect(lines.some((l) => l.includes(String(oldInv)) && l.includes('would set leadSource'))).toBe(true);
    expect(lines.some((l) => l.includes('DRY RUN'))).toBe(true);
  });

  it('apply sets only missing values, keeps updatedAt and set values; a second run changes 0', async () => {
    const first = await migrate({ apply: true, log });
    expect(first.leadSource.changed).toBe(2);
    expect(first.organisationType.changed).toBe(2);
    expect(first.currency.changed).toBe(2);

    const old = await Investor.collection.findOne({ _id: oldInv });
    expect(old.leadSource).toBe('Unknown (pre-T11)');
    expect(old.organisationType).toBe('Investor');
    expect(old.updatedAt.getTime()).toBe(old.createdAt.getTime());
    const kept = await Investor.collection.findOne({ _id: setInv });
    expect(kept.leadSource).toBe('Other');
    expect(kept.organisationType).toBe('Intermediary');
    expect((await InvestmentProject.collection.findOne({ _id: oldProject })).currency).toBe('NGN');
    expect((await InvestmentProject.collection.findOne({ projectTitle: 'USD Project' })).currency).toBe('USD');
    expect(lines.some((l) => l.includes(String(oldInv)) && l.includes('set leadSource'))).toBe(true);

    const snap = await raw();
    const second = await migrate({ apply: true, log });
    expect(second.leadSource.changed).toBe(0);
    expect(second.organisationType.changed).toBe(0);
    expect(second.currency.changed).toBe(0);
    expect(await raw()).toEqual(snap);
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
