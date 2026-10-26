#!/usr/bin/env node
// migrate-data-cleanup.js — story 11.14 data clean-up (repeat-safe).
//
// What it changes (and nothing else):
// - Investors: a sector that is not on the list (src/constants/sectors.js) →
//   resolveSector's sector; the old spelling goes into sectorDetail when that is
//   empty and the spelling differs. A sector already on the list is never
//   changed. Country "Nigeria Sovereign Investment Authority" → "Nigeria", the
//   old text kept in countryDetail.
// - Projects: sector set from the investor's (resolved) sector when empty;
//   currency set to NGN when missing.
// - Lifecycle statuses: "Exisiting Investor" renamed "Existing investor";
//   projects on "Exisiting" moved to "Existing investor", then "Exisiting" is
//   deleted; Idea, Research, Planning, Monitoring, Closed and Test deleted only
//   when no project uses them (otherwise reported and kept); order set to
//   Initial Lead, Initial Interest, Lead, Commitment, Execution, Existing
//   investor, Expansion, Exit, then every other status in its current order.
// - Exchange rates: the owner's seed rates (src/services/fxRates.js SEED_RATES)
//   are stored only when no rates exist.
//
// Every write goes through the Mongoose models inside runAs, so the 11.10 audit
// plugin writes the ChangeLog update/create rows; status deletes write their
// ChangeLog delete row first. All rows carry the reason
// "migration: data clean-up" and one batchId per run. updatedAt is left as it
// was (the clean-up is not an officer edit).
//
// Prints every change grouped by kind, with counts and record ids: never
// investor or contact names. A second run changes 0.
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
//
// Usage (from oysipa-backend/):
//   npm run migrate:data-cleanup -- --uri-env MONGO_URI                                  # dry run
//   npm run migrate:data-cleanup -- --uri-env MONGO_URI --apply --as <email>             # write (dev)
//   npm run migrate:data-cleanup -- --uri-env MONGO_URI_LIVE --allow-live                # live dry run
//   npm run migrate:data-cleanup -- --uri-env MONGO_URI_LIVE --allow-live --apply --as <email> \
//     --backup C:\Users\DELL\Desktop\investor_tracking_backups\db-<stamp>                  # live write
//
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   Values are loaded from oysipa-backend/.env if present; the URI
//                   itself is never printed.
// --apply           write the changes (otherwise dry run).
// --allow-live      required to run against the live database (named "test").
// --as <email>      required with --apply: the active Director-General / Portal-Admin
//                   user the run is recorded as.
// --backup <dir>    required with --apply on the live database: the folder written
//                   by investor_tracking_backups/backup-live-db.js just before the
//                   run (its manifest.json must list this database and be less than
//                   BACKUP_MAX_HOURS old). Take the backup first.
// Exit codes: 0 = done, 1 = error (bad args, missing env, connect failure, live
// database refused, no fresh backup, an audit row failed).

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const Investor = require('../src/models/InvestorModel');
const InvestmentProject = require('../src/models/InvestmentProject');
const LifecycleStatus = require('../src/models/LifecycleStatusModel');
const Setting = require('../src/models/Setting');
const { resolveSector, isSectorValue } = require('../src/constants/sectors');
const { CURRENCIES, DEFAULT_CURRENCY } = require('../src/constants/investorFields');
const { FX_KEY, SEED_RATES, validEntries } = require('../src/services/fxRates');
const { runAs } = require('../src/utils/auditContext');
const { recordChanges, newBatchId } = require('../src/utils/recordDeletion');
const { recordFailure } = require('../src/utils/auditPlugin');
const {
  parseArgs: parseBaseArgs, assertDbAllowed, assertActor, resolveActor,
} = require('./migrate-interaction-investor');

const REASON = 'migration: data clean-up';
const LIVE_DB_NAME = 'test';
const BACKUP_MAX_HOURS = 24;

const COUNTRY_FIXES = { 'nigeria sovereign investment authority': 'Nigeria' };

const RENAME_STATUS = { from: 'Exisiting Investor', to: 'Existing investor' };
const MERGE_STATUS = 'Exisiting';
const UNUSED_STATUSES = ['Idea', 'Research', 'Planning', 'Monitoring', 'Closed', 'Test'];
const STATUS_ORDER = ['Initial Lead', 'Initial Interest', 'Lead', 'Commitment', 'Execution', 'Existing investor', 'Expansion', 'Exit'];

const key = (s) => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// --backup <dir> is ours; everything else goes to the shared parser.
const parseArgs = (argv) => {
  const rest = [];
  let backup = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--backup') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('--backup needs a folder');
      backup = next;
      i += 1;
    } else if (argv[i].startsWith('--backup=')) {
      backup = argv[i].slice('--backup='.length);
    } else {
      rest.push(argv[i]);
    }
  }
  return { ...parseBaseArgs(rest), backup };
};

// An apply on the live database needs a fresh backup of it.
const assertBackup = ({ apply, dbName, backup, now = new Date() }) => {
  if (!apply || dbName !== LIVE_DB_NAME) return null;
  if (!backup) throw new Error('--apply on the live database needs --backup <folder> (take a fresh backup first)');
  const manifestFile = path.join(backup, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`No manifest.json in the backup folder ${backup}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const takenAt = new Date(manifest.takenAt);
  if (Number.isNaN(takenAt.getTime())) throw new Error('The backup manifest has no takenAt time');
  const ageHours = (now - takenAt) / 3600000;
  // A manifest dated in the future (beyond a few minutes of clock skew) is not trusted.
  if (ageHours < -0.1) throw new Error('The backup manifest is dated in the future; check the backup');
  if (ageHours > BACKUP_MAX_HOURS) throw new Error(`The backup is ${Math.round(ageHours)} hours old; take a fresh one (at most ${BACKUP_MAX_HOURS} hours)`);
  const cols = manifest.databases && manifest.databases[dbName];
  if (!cols || !cols.investors || !cols.investmentprojects || !cols.lifecyclestatuses) {
    throw new Error(`The backup does not hold database "${dbName}" (investors, projects and statuses)`);
  }
  const bad = Object.entries(cols).filter(([, c]) => c && c.ok === false).map(([n]) => n);
  if (bad.length) throw new Error(`The backup reported mismatches for: ${bad.join(', ')}`);
  return { takenAt: takenAt.toISOString(), ageHours };
};

// ---------- planning (reads only) ----------

const planInvestors = (investors) => {
  const sector = [];
  const country = [];
  const warnings = [];
  investors.forEach((inv) => {
    if (!isSectorValue(inv.sector)) {
      const r = resolveSector(inv.sector);
      const set = { sector: r.sector };
      if (r.detail && isBlank(inv.sectorDetail)) set.sectorDetail = r.detail;
      sector.push({
        id: inv._id, from: inv.sector === undefined ? null : inv.sector, to: r.sector, set, match: { sector: inv.sector === undefined ? null : inv.sector },
      });
      if (r.warning) warnings.push({ id: inv._id, message: r.warning });
    }
    const fix = COUNTRY_FIXES[key(inv.countryOfOrigin)];
    if (fix) {
      const set = { countryOfOrigin: fix };
      if (isBlank(inv.countryDetail)) set.countryDetail = String(inv.countryOfOrigin).trim();
      country.push({
        id: inv._id, from: inv.countryOfOrigin, to: fix, set, match: { countryOfOrigin: inv.countryOfOrigin },
      });
    }
  });
  return { sector, country, warnings };
};

// Blank in the database: missing, null or whitespace only (repeat-safe filter).
const BLANK = (field) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: { $regex: /^\s*$/ } }] });

const planProjects = (projects, investorSector) => {
  const sector = [];
  const fixSector = [];
  const currency = [];
  const skipped = [];
  projects.forEach((p) => {
    if (isBlank(p.sector)) {
      // The investor's planned sector; an old spelling is resolved too.
      const raw = p.investor ? investorSector.get(String(p.investor)) : undefined;
      if (raw === undefined) skipped.push({ id: p._id, message: 'no investor found; sector left empty' });
      else {
        const s = isSectorValue(raw) ? raw : resolveSector(raw).sector;
        sector.push({ id: p._id, to: s, set: { sector: s }, match: BLANK('sector') });
      }
    } else if (!isSectorValue(p.sector)) {
      const r = resolveSector(p.sector);
      const set = { sector: r.sector };
      if (r.detail && isBlank(p.sectorDetail)) set.sectorDetail = r.detail;
      fixSector.push({ id: p._id, from: p.sector, to: r.sector, set, match: { sector: p.sector } });
      if (r.warning) skipped.push({ id: p._id, message: r.warning });
    }
    if (isBlank(p.currency)) {
      currency.push({ id: p._id, to: DEFAULT_CURRENCY, set: { currency: DEFAULT_CURRENCY }, match: BLANK('currency') });
    } else if (!CURRENCIES.includes(p.currency)) {
      skipped.push({ id: p._id, message: `currency ${JSON.stringify(p.currency)} is not one of ${CURRENCIES.join(', ')}; left as it is (fix by hand)` });
    }
  });
  return { sector, fixSector, currency, skipped };
};

// Order of the statuses that remain: the fixed list first, then the rest in
// their current order. Returns the changes (no two statuses share an order).
const planOrder = (remaining) => {
  const fixed = STATUS_ORDER.map((n) => remaining.find((s) => key(s.name) === key(n))).filter(Boolean);
  const fixedIds = new Set(fixed.map((s) => String(s._id)));
  const rest = remaining.filter((s) => !fixedIds.has(String(s._id))).sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
  const order = [];
  [...fixed, ...rest].forEach((s, i) => {
    if (s.order !== i + 1) order.push({ id: s._id, name: s.name, from: s.order, to: i + 1 });
  });
  return order;
};

const planStatuses = (statuses, usage) => {
  const byKey = new Map();
  const duplicates = [];
  statuses.forEach((s) => {
    const k = key(s.name);
    if (byKey.has(k)) duplicates.push({ name: s.name, other: byKey.get(k).name });
    else byKey.set(k, s);
  });
  const used = (s) => (s ? usage.get(String(s._id)) || 0 : 0);
  const plan = {
    rename: null, moves: [], deletes: [], kept: [], order: [], duplicates,
  };
  let target = byKey.get(key(RENAME_STATUS.to));
  const renameSource = statuses.find((s) => s.name === RENAME_STATUS.from || (key(s.name) === key(RENAME_STATUS.from) && s.name !== RENAME_STATUS.to));
  if (renameSource && !target) {
    plan.rename = { id: renameSource._id, from: renameSource.name, to: RENAME_STATUS.to };
    target = { ...renameSource, name: RENAME_STATUS.to };
  } else if (renameSource && target && String(renameSource._id) !== String(target._id)) {
    // Both exist: treat the misspelt one like "Exisiting" (move, then delete).
    plan.moves.push({ from: renameSource, to: target, count: used(renameSource) });
    plan.deletes.push({ status: renameSource, afterMove: true });
  }
  const merge = byKey.get(key(MERGE_STATUS));
  if (merge && target && String(merge._id) !== String(target._id)) {
    plan.moves.push({ from: merge, to: target, count: used(merge) });
    plan.deletes.push({ status: merge, afterMove: true });
  } else if (merge && !target) {
    plan.kept.push({ name: merge.name, count: used(merge), message: `no "${RENAME_STATUS.to}" status to move its projects to` });
  }
  UNUSED_STATUSES.forEach((name) => {
    const s = byKey.get(key(name));
    if (!s) return;
    const n = used(s);
    if (n === 0) plan.deletes.push({ status: s, afterMove: false });
    else plan.kept.push({ name: s.name, count: n, message: `used by ${n} project(s); kept` });
  });

  // Order of what remains: the fixed list first, then the rest in current order.
  const gone = new Set(plan.deletes.map((d) => String(d.status._id)));
  const remaining = statuses
    .filter((s) => !gone.has(String(s._id)))
    .map((s) => (plan.rename && String(s._id) === String(plan.rename.id) ? { ...s, name: plan.rename.to } : s));
  plan.order = planOrder(remaining);
  return plan;
};

// ---------- run ----------

const migrate = async ({
  apply = false, allowLive = false, actor = null, batchId = newBatchId(), log = console.log, backup = null, now = new Date(),
} = {}) => {
  const dbName = mongoose.connection.name;
  assertDbAllowed(dbName, allowLive);
  assertActor(apply, actor);
  const backupInfo = assertBackup({
    apply, dbName, backup, now,
  });
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`);
  if (backupInfo) log(`Backup checked: taken ${backupInfo.takenAt}`);

  // Raw reads: old values must load whatever they hold.
  const [investors, projects, statuses, fxSetting] = await Promise.all([
    Investor.collection.find({}, { projection: { sector: 1, sectorDetail: 1, countryOfOrigin: 1, countryDetail: 1 } }).sort({ _id: 1 }).toArray(),
    InvestmentProject.collection.find({}, { projection: { investor: 1, sector: 1, currency: 1, lifecycleStatus: 1 } }).sort({ _id: 1 }).toArray(),
    LifecycleStatus.collection.find({}).sort({ order: 1, _id: 1 }).toArray(),
    Setting.collection.findOne({ key: FX_KEY }),
  ]);

  const inv = planInvestors(investors);
  // The investor's sector after this run (planned value, else the stored one).
  const plannedSector = new Map(inv.sector.map((c) => [String(c.id), c.to]));
  const investorSector = new Map(investors.map((i) => [String(i._id), plannedSector.get(String(i._id)) || i.sector]));
  const proj = planProjects(projects, investorSector);
  const usage = new Map();
  projects.forEach((p) => {
    const k = String(p.lifecycleStatus);
    usage.set(k, (usage.get(k) || 0) + 1);
  });
  const st = planStatuses(statuses, usage);
  // Seed only when nothing is stored. Stored entries that do not look right are
  // reported and never overwritten (Admin fixes them).
  let storedFx = [];
  if (fxSetting && Array.isArray(fxSetting.value)) storedFx = fxSetting.value;
  else if (fxSetting && fxSetting.value !== undefined && fxSetting.value !== null) storedFx = [fxSetting.value];
  const invalidFx = storedFx.length - validEntries(storedFx).length;
  const seedFx = storedFx.length === 0;

  const summary = {
    investorSector: inv.sector.length,
    investorCountry: inv.country.length,
    projectSector: proj.sector.length,
    projectSectorFixed: proj.fixSector.length,
    projectCurrency: proj.currency.length,
    statusRenamed: st.rename ? 1 : 0,
    projectsMoved: st.moves.reduce((n, m) => n + m.count, 0),
    statusesDeleted: st.deletes.length,
    statusesKept: st.kept.length,
    statusOrder: st.order.length,
    fxSeeded: seedFx ? SEED_RATES.length : 0,
    warnings: inv.warnings.length + proj.skipped.length + st.duplicates.length + (invalidFx ? 1 : 0),
    changes: 0,
    auditFailed: 0,
  };
  const total = (x) => x.investorSector + x.investorCountry + x.projectSector + x.projectSectorFixed + x.projectCurrency
    + x.statusRenamed + x.projectsMoved + x.statusesDeleted + x.statusOrder + x.fxSeeded;
  summary.changes = total(summary);

  // ---- report, grouped by kind (values and ids, never names) ----
  const verb = apply ? 'set' : 'would set';
  // items are tally rows ({ k, ids }); the header counts the records.
  const group = (title, items, line) => {
    log(`\n${title}: ${items.reduce((n, t) => n + t.ids.length, 0)}`);
    items.forEach((i) => log(`  ${line(i)}`));
  };
  const tally = (items, fn) => {
    const m = new Map();
    items.forEach((i) => { const k = fn(i); m.set(k, (m.get(k) || []).concat(String(i.id))); });
    return [...m.entries()].map(([k, ids]) => ({ k, ids }));
  };
  group('Investor sector', tally(inv.sector, (c) => `${JSON.stringify(c.from)} -> "${c.to}"`), (t) => `${t.k}: ${t.ids.length} (${t.ids.join(', ')})`);
  group('Investor country', tally(inv.country, (c) => `${JSON.stringify(c.from)} -> "${c.to}"`), (t) => `${t.k}: ${t.ids.length} (${t.ids.join(', ')})`);
  group('Project sector (from the investor)', tally(proj.sector, (c) => `"${c.to}"`), (t) => `${verb} ${t.k}: ${t.ids.length} (${t.ids.join(', ')})`);
  group('Project sector (not on the list)', tally(proj.fixSector, (c) => `${JSON.stringify(c.from)} -> "${c.to}"`), (t) => `${t.k}: ${t.ids.length} (${t.ids.join(', ')})`);
  group('Project currency (missing)', tally(proj.currency, (c) => `"${c.to}"`), (t) => `${verb} ${t.k}: ${t.ids.length} (${t.ids.join(', ')})`);
  log('\nLifecycle statuses:');
  if (st.rename) log(`  rename "${st.rename.from}" -> "${st.rename.to}"`);
  st.moves.forEach((m) => log(`  move ${m.count} project(s) from "${m.from.name}" to "${m.to.name}"`));
  st.deletes.forEach((d) => log(`  delete "${d.status.name}"${d.afterMove ? ' (after the move)' : ' (0 projects)'}`));
  st.kept.forEach((k) => log(`  keep "${k.name}": ${k.message}`));
  st.order.forEach((o) => log(`  order "${o.name}": ${o.from} -> ${o.to}`));
  if (!st.rename && !st.moves.length && !st.deletes.length && !st.order.length) log('  no change');
  log(`\nExchange rates: ${seedFx ? `${apply ? 'seed' : 'would seed'} ${SEED_RATES.length} rate(s)` : 'rates already set; not seeded'}`);
  if (seedFx) SEED_RATES.forEach((r) => log(`  ${r.currency} ${r.rate} as of ${r.asOf} (${r.source})`));
  if (summary.warnings) {
    log('\nWarnings:');
    inv.warnings.forEach((w) => log(`  investor ${w.id}: ${w.message}`));
    proj.skipped.forEach((w) => log(`  project ${w.id}: ${w.message}`));
    st.duplicates.forEach((d) => log(`  status "${d.name}" has the same name as "${d.other}" (case or spaces); fix by hand`));
    if (invalidFx) log(`  exchange rates: ${invalidFx} stored entr${invalidFx === 1 ? 'y does' : 'ies do'} not look right; left as stored (fix in Admin)`);
  }

  if (!apply) {
    log(`\nTotal: ${summary.changes} change(s) would be made (dry run, nothing written)`);
    return summary;
  }

  // ---- apply ----
  const asActor = (fn) => runAs(actor, fn, { batchId, reason: REASON });
  const noStamp = { timestamps: false };
  // What was actually written (a record changed since it was read is skipped).
  const done = {
    investorSector: 0, investorCountry: 0, projectSector: 0, projectSectorFixed: 0, projectCurrency: 0,
    statusRenamed: 0, projectsMoved: 0, statusesDeleted: 0, statusOrder: 0, fxSeeded: 0,
  };
  // Each update re-checks the value it read, so a concurrent edit is never overwritten.
  const write = async (Model, kind, items) => {
    for (const c of items) {
      // eslint-disable-next-line no-await-in-loop
      const res = await Model.updateOne({ _id: c.id, ...c.match }, { $set: c.set }, noStamp).exec();
      if (res.modifiedCount === 1) done[kind] += 1;
      else log(`  ${c.id}: unchanged (changed since it was read)`);
    }
  };
  await asActor(async () => {
    await write(Investor, 'investorSector', inv.sector);
    await write(Investor, 'investorCountry', inv.country);
    await write(InvestmentProject, 'projectSector', proj.sector);
    await write(InvestmentProject, 'projectSectorFixed', proj.fixSector);
    await write(InvestmentProject, 'projectCurrency', proj.currency);
    if (st.rename) {
      const res = await LifecycleStatus.updateOne({ _id: st.rename.id, name: st.rename.from }, { $set: { name: st.rename.to } }).exec();
      done.statusRenamed += res.modifiedCount;
    }
    for (const m of st.moves) {
      // eslint-disable-next-line no-await-in-loop
      const ids = await InvestmentProject.find({ lifecycleStatus: m.from._id }).distinct('_id');
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        const res = await InvestmentProject.updateOne({ _id: id, lifecycleStatus: m.from._id }, { $set: { lifecycleStatus: m.to._id } }, noStamp).exec();
        done.projectsMoved += res.modifiedCount;
      }
    }
    for (const d of st.deletes) {
      // Never delete a status a project uses (re-checked now).
      // eslint-disable-next-line no-await-in-loop
      const inUse = await InvestmentProject.countDocuments({ lifecycleStatus: d.status._id });
      if (inUse > 0) {
        log(`  "${d.status.name}" is now used by ${inUse} project(s); not deleted`);
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await recordChanges(actor, 'delete', [['LifecycleStatus', [d.status]]], { reason: REASON, batchId });
      } catch (error) {
        summary.auditFailed += 1;
        // eslint-disable-next-line no-await-in-loop
        await recordFailure([{ entity: 'LifecycleStatus', entityId: d.status._id, action: 'delete' }], error);
        log(`  "${d.status.name}": audit row FAILED; not deleted`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await LifecycleStatus.deleteOne({ _id: d.status._id });
      done.statusesDeleted += res.deletedCount;
    }
    // Order worked out again from what is left (a skipped delete keeps its status).
    const remaining = await LifecycleStatus.collection.find({}).sort({ order: 1, _id: 1 }).toArray();
    for (const o of planOrder(remaining)) {
      // eslint-disable-next-line no-await-in-loop
      const res = await LifecycleStatus.updateOne({ _id: o.id }, { $set: { order: o.to } }).exec();
      done.statusOrder += res.modifiedCount;
    }
    // Seeds only when still absent (never overwrites rates saved meanwhile).
    if (seedFx && !(await Setting.exists({ key: FX_KEY }))) {
      await Setting.findOneAndUpdate(
        { key: FX_KEY },
        { $setOnInsert: { value: SEED_RATES.map((r) => ({ ...r })), ...(actor && { updatedBy: actor._id }) } },
        { upsert: true, new: true },
      );
      done.fxSeeded = SEED_RATES.length;
    }
  });
  Object.assign(summary, done);
  summary.changes = total(summary);
  log(`\nTotal: ${summary.changes} change(s) made; batch ${batchId}`);
  if (summary.auditFailed) log(`Audit rows FAILED: ${summary.auditFailed}`);
  return summary;
};

const main = async () => {
  const {
    uriEnv, apply, allowLive, as, backup,
  } = parseArgs(process.argv.slice(2));
  const uri = process.env[uriEnv];
  if (!uri) throw new Error(`Environment variable ${uriEnv} is not set`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${uriEnv})`);
    assertDbAllowed(mongoose.connection.name, allowLive);
    assertBackup({ apply, dbName: mongoose.connection.name, backup });
    const actor = apply ? await resolveActor(as) : null;
    const summary = await migrate({
      apply, allowLive, actor, backup,
    });
    if (summary.auditFailed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`migrate-data-cleanup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  migrate, parseArgs, assertBackup, planInvestors, planProjects, planStatuses, planOrder, REASON, STATUS_ORDER,
};
