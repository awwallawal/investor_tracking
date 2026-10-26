// Story 11.14 data clean-up migration. Synthetic data only.
// Runs on the jest test connection (database name ends in _test/healthcheck).
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const Investor = require('../src/models/InvestorModel');
const InvestmentProject = require('../src/models/InvestmentProject');
const LifecycleStatus = require('../src/models/LifecycleStatusModel');
const Setting = require('../src/models/Setting');
const User = require('../src/models/User');
const ChangeLog = require('../src/models/ChangeLog');
const {
  migrate, parseArgs, assertBackup, REASON,
} = require('./migrate-data-cleanup');

let actor;
let lines;
const log = (line) => lines.push(line);
const out = () => lines.join('\n');
const past = new Date('2026-01-02T00:00:00.000Z');

const ids = {};
const raw = (Model) => Model.collection.find({}).sort({ _id: 1 }).toArray();

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});

beforeEach(async () => {
  lines = [];
  actor = await User.findOne({ email: 'dg@example.com' });
  await Promise.all([
    Investor.collection.deleteMany({}), InvestmentProject.collection.deleteMany({}),
    LifecycleStatus.collection.deleteMany({}), Setting.collection.deleteMany({}), ChangeLog.collection.deleteMany({}),
  ]);
  // Statuses as on live (raw inserts: names with the old typos).
  const names = ['Idea', 'Research', 'Planning', 'Execution', 'Monitoring', 'Closed', 'Test', 'Exisiting Investor',
    'Initial Lead', 'Initial Interest', 'Lead', 'Commitment', 'Expansion', 'Exisiting', 'Exit'];
  const st = await LifecycleStatus.collection.insertMany(names.map((name, i) => ({ name, order: i + 1 })));
  names.forEach((n, i) => { ids[n] = st.insertedIds[i]; });

  const inv = await Investor.collection.insertMany([
    { investorName: 'Old Agro', sector: 'Agriculture/Agribusiness', countryOfOrigin: 'Nigeria', createdAt: past, updatedAt: past },
    { investorName: 'Listed Waste', sector: 'Waste and circular economy', countryOfOrigin: 'Nigeria', createdAt: past, updatedAt: past },
    { investorName: 'Agritech Hub', sector: 'Intermediary (agritech)', countryOfOrigin: 'Nigeria Sovereign Investment Authority', createdAt: past, updatedAt: past },
    { investorName: 'Mystery', sector: 'Space mining', countryOfOrigin: 'Ghana', createdAt: past, updatedAt: past },
    { investorName: 'Unknown', sector: 'Not known', countryOfOrigin: 'Not stated', createdAt: past, updatedAt: past },
  ]);
  ids.oldAgro = inv.insertedIds[0];
  ids.listed = inv.insertedIds[1];
  ids.hub = inv.insertedIds[2];
  ids.mystery = inv.insertedIds[3];

  await InvestmentProject.collection.insertMany([
    { projectTitle: 'Farm', investor: ids.oldAgro, lifecycleStatus: ids.Exisiting, createdAt: past, updatedAt: past },
    { projectTitle: 'Plant', investor: ids.listed, lifecycleStatus: ids.Planning, currency: 'USD', sector: 'Manufacturing', createdAt: past, updatedAt: past },
    { projectTitle: 'Hub', investor: ids.hub, lifecycleStatus: ids['Exisiting Investor'], currency: 'NGN', createdAt: past, updatedAt: past },
  ]);
});

describe('migrate-data-cleanup', () => {
  it('dry run writes nothing and lists every change by kind, with counts and no names', async () => {
    const before = await Promise.all([raw(Investor), raw(InvestmentProject), raw(LifecycleStatus)]);
    const s = await migrate({ apply: false, log });
    expect(await Promise.all([raw(Investor), raw(InvestmentProject), raw(LifecycleStatus)])).toEqual(before);
    expect(await Setting.countDocuments()).toBe(0);
    expect(await ChangeLog.countDocuments()).toBe(0);
    expect(s).toMatchObject({
      investorSector: 4, // the listed one is never touched
      investorCountry: 1,
      projectSector: 2, // "Plant" already has one
      projectCurrency: 1,
      statusRenamed: 1,
      projectsMoved: 1,
      statusesDeleted: 6, // Exisiting + Idea, Research, Monitoring, Closed, Test (Planning in use)
      statusesKept: 1,
      fxSeeded: 3,
    });
    const text = out();
    expect(text).toContain('DRY RUN');
    expect(text).toContain('Investor sector: 4');
    expect(text).toContain('Project sector (from the investor): 2');
    expect(text).toContain('"Agriculture/Agribusiness" -> "Agribusiness": 1');
    expect(text).toContain('"Nigeria Sovereign Investment Authority" -> "Nigeria": 1');
    expect(text).toContain('rename "Exisiting Investor" -> "Existing investor"');
    expect(text).toContain('move 1 project(s) from "Exisiting" to "Existing investor"');
    expect(text).toContain('keep "Planning": used by 1 project(s); kept');
    expect(text).toContain('USD 1361.84 as of 2026-10-23 (CBN NFEM weighted average)');
    expect(text).toMatch(/Space mining.*not on the list/);
    ['Old Agro', 'Listed Waste', 'Agritech Hub', 'Mystery', 'Farm', 'Plant'].forEach((n) => expect(text).not.toContain(n));
  });

  it('apply makes the changes, audited with the migration reason; a second run changes 0', async () => {
    const s = await migrate({ apply: true, actor, log });
    expect(s.changes).toBeGreaterThan(0);
    expect(s.auditFailed).toBe(0);

    const inv = await Investor.collection.find({}).sort({ _id: 1 }).toArray();
    expect(inv.map((i) => i.sector)).toEqual(['Agribusiness', 'Waste and circular economy', 'Agribusiness', 'Other', 'Not recorded']);
    expect(inv[0].sectorDetail).toBe('Agriculture/Agribusiness');
    expect(inv[1].sectorDetail).toBeUndefined();
    expect(inv[2]).toMatchObject({ sectorDetail: 'Intermediary (agritech)', countryOfOrigin: 'Nigeria', countryDetail: 'Nigeria Sovereign Investment Authority' });
    expect(inv[3].sectorDetail).toBe('Space mining');
    expect(inv[4].countryOfOrigin).toBe('Not stated'); // not one of the fixes
    expect(inv[0].updatedAt).toEqual(past); // not an officer edit

    const projects = await InvestmentProject.collection.find({}).sort({ _id: 1 }).toArray();
    expect(projects.map((p) => p.sector)).toEqual(['Agribusiness', 'Manufacturing', 'Agribusiness']);
    expect(projects.map((p) => p.currency)).toEqual(['NGN', 'USD', 'NGN']);

    const statuses = await LifecycleStatus.find({}).sort({ order: 1 }).lean();
    expect(statuses.map((x) => x.name)).toEqual([
      'Initial Lead', 'Initial Interest', 'Lead', 'Commitment', 'Execution', 'Existing investor', 'Expansion', 'Exit', 'Planning',
    ]);
    const existing = statuses.find((x) => x.name === 'Existing investor');
    expect(String(existing._id)).toBe(String(ids['Exisiting Investor']));
    expect(String(projects[0].lifecycleStatus)).toBe(String(existing._id)); // moved from "Exisiting"

    const fx = await Setting.findOne({ key: 'fxRates' }).lean();
    expect(fx.value.map((r) => [r.currency, r.rate, r.asOf])).toEqual([
      ['USD', 1361.84, '2026-10-23'], ['EUR', 1525.12, '2026-10-25'], ['GBP', 1787.73, '2026-10-22'],
    ]);

    const rows = await ChangeLog.find({}).lean();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.reason === REASON && r.byName === 'DG User')).toBe(true);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
    const deletes = rows.filter((r) => r.action === 'delete').map((r) => r.snapshot.name).sort();
    expect(deletes).toEqual(['Closed', 'Exisiting', 'Idea', 'Monitoring', 'Research', 'Test']);
    expect(rows.filter((r) => r.entity === 'Investor' && r.action === 'update')).toHaveLength(5); // 4 sectors + 1 country
    expect(rows.find((r) => r.entity === 'Setting')).toMatchObject({ action: 'create' });

    lines = [];
    const again = await migrate({ apply: true, actor, log });
    expect(again.changes).toBe(0);
    expect(out()).toContain('rates already set; not seeded');
    expect(await ChangeLog.countDocuments()).toBe(rows.length);
  });

  it('a status in use is kept and reported, never deleted', async () => {
    await InvestmentProject.collection.insertOne({ projectTitle: 'Idea project', investor: ids.listed, lifecycleStatus: ids.Idea, sector: 'Other', currency: 'NGN' });
    const s = await migrate({ apply: true, actor, log });
    expect(out()).toContain('keep "Idea": used by 1 project(s); kept');
    expect(await LifecycleStatus.exists({ _id: ids.Idea })).not.toBeNull();
    expect(await LifecycleStatus.exists({ _id: ids.Planning })).not.toBeNull();
    expect(s.statusesKept).toBe(2);
  });

  it('existing rates are never overwritten by the seed', async () => {
    await Setting.create({ key: 'fxRates', value: [{ currency: 'USD', rate: 1500, asOf: '2026-10-01', source: 'Admin' }] });
    const s = await migrate({ apply: true, actor, log });
    expect(s.fxSeeded).toBe(0);
    const fx = await Setting.findOne({ key: 'fxRates' }).lean();
    expect(fx.value).toEqual([{ currency: 'USD', rate: 1500, asOf: '2026-10-01', source: 'Admin' }]);
  });

  it('both "Exisiting Investor" and "Existing investor": projects moved, the misspelt one deleted (ChangeLog row), orders unique', async () => {
    const target = await LifecycleStatus.collection.insertOne({ name: 'Existing investor', order: 16 });
    await InvestmentProject.collection.insertOne({ projectTitle: 'Already right', investor: ids.listed, lifecycleStatus: target.insertedId, sector: 'Other', currency: 'NGN' });
    const s = await migrate({ apply: true, actor, log });
    expect(s.statusRenamed).toBe(0);
    expect(s.projectsMoved).toBe(2); // Hub (Exisiting Investor) + Farm (Exisiting)
    expect(await LifecycleStatus.exists({ _id: ids['Exisiting Investor'] })).toBeNull();
    const projects = await InvestmentProject.collection.find({}).toArray();
    expect(projects.filter((p) => String(p.lifecycleStatus) === String(target.insertedId))).toHaveLength(3);
    const del = await ChangeLog.find({ action: 'delete', entity: 'LifecycleStatus' }).lean();
    expect(del.map((r) => r.snapshot.name)).toContain('Exisiting Investor');
    const statuses = await LifecycleStatus.find({}).sort({ order: 1 }).lean();
    expect(statuses.map((x) => x.name)).toEqual([
      'Initial Lead', 'Initial Interest', 'Lead', 'Commitment', 'Execution', 'Existing investor', 'Expansion', 'Exit', 'Planning',
    ]);
    expect(new Set(statuses.map((x) => x.order)).size).toBe(statuses.length);
  });

  it('a whitespace-only project sector is filled; a second run changes 0', async () => {
    await InvestmentProject.collection.insertOne({ projectTitle: 'Blank', investor: ids.listed, lifecycleStatus: ids.Lead, sector: '   ', currency: 'NGN' });
    await migrate({ apply: true, actor, log });
    expect((await InvestmentProject.collection.findOne({ projectTitle: 'Blank' })).sector).toBe('Waste and circular economy');
    const again = await migrate({ apply: true, actor, log });
    expect(again.changes).toBe(0);
  });

  it('a non-list project sector is resolved; an unknown currency is reported, not changed; totals count what was written', async () => {
    await InvestmentProject.collection.insertOne({ projectTitle: 'Odd', investor: ids.listed, lifecycleStatus: ids.Lead, sector: 'Hospitality', currency: 'NAIRA' });
    const dry = await migrate({ apply: false, log });
    expect(dry.projectSectorFixed).toBe(1);
    expect(out()).toMatch(/currency "NAIRA" is not one of/);
    const s = await migrate({ apply: true, actor, log });
    const odd = await InvestmentProject.collection.findOne({ projectTitle: 'Odd' });
    expect(odd).toMatchObject({ sector: 'Culture and tourism', sectorDetail: 'Hospitality', currency: 'NAIRA' });
    expect(s.changes).toBe(s.investorSector + s.investorCountry + s.projectSector + s.projectSectorFixed + s.projectCurrency
      + s.statusRenamed + s.projectsMoved + s.statusesDeleted + s.statusOrder + s.fxSeeded);
  });

  it('invalid stored rates are reported and never overwritten by the seed', async () => {
    await Setting.collection.insertOne({ key: 'fxRates', value: [{ currency: 'USD', rate: -1 }] });
    const s = await migrate({ apply: true, actor, log });
    expect(s.fxSeeded).toBe(0);
    expect(out()).toMatch(/exchange rates: 1 stored entry does not look right/);
    expect((await Setting.collection.findOne({ key: 'fxRates' })).value).toEqual([{ currency: 'USD', rate: -1 }]);
  });

  it('apply needs an admin actor', async () => {
    await expect(migrate({ apply: true, actor: null, log })).rejects.toThrow(/--as/);
  });
});

describe('arguments and the backup check', () => {
  it('parses --backup with the shared flags', () => {
    expect(parseArgs(['--uri-env', 'X', '--apply', '--as', 'dg@example.com', '--backup', 'C:\\b'])).toMatchObject({
      uriEnv: 'X', apply: true, as: 'dg@example.com', backup: 'C:\\b', allowLive: false,
    });
    expect(() => parseArgs(['--backup'])).toThrow(/--backup needs a folder/);
  });

  it('apply on live needs a fresh backup of that database; dev and dry runs do not', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-backup-'));
    const now = new Date('2026-10-26T12:00:00Z');
    const write = (manifest) => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    const cols = { investors: { ok: true }, investmentprojects: { ok: true }, lifecyclestatuses: { ok: true } };
    expect(assertBackup({ apply: false, dbName: 'test', backup: null, now })).toBeNull();
    expect(assertBackup({ apply: true, dbName: 'oysipa_dev', backup: null, now })).toBeNull();
    expect(() => assertBackup({ apply: true, dbName: 'test', backup: null, now })).toThrow(/needs --backup/);
    expect(() => assertBackup({ apply: true, dbName: 'test', backup: dir, now })).toThrow(/No manifest/);
    write({ takenAt: '2026-10-24T12:00:00Z', databases: { test: cols } });
    expect(() => assertBackup({ apply: true, dbName: 'test', backup: dir, now })).toThrow(/hours old/);
    write({ takenAt: '2026-10-26T11:00:00Z', databases: { oysipa: cols } });
    expect(() => assertBackup({ apply: true, dbName: 'test', backup: dir, now })).toThrow(/does not hold/);
    write({ takenAt: '2026-10-26T11:00:00Z', databases: { test: { ...cols, investors: { ok: false } } } });
    expect(() => assertBackup({ apply: true, dbName: 'test', backup: dir, now })).toThrow(/mismatches for: investors/);
    write({ takenAt: '2026-10-27T11:00:00Z', databases: { test: cols } });
    expect(() => assertBackup({ apply: true, dbName: 'test', backup: dir, now })).toThrow(/in the future/);
    write({ takenAt: '2026-10-26T11:00:00Z', databases: { test: cols } });
    expect(assertBackup({ apply: true, dbName: 'test', backup: dir, now })).toMatchObject({ takenAt: '2026-10-26T11:00:00.000Z' });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
