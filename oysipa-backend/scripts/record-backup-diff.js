#!/usr/bin/env node
// record-backup-diff.js — story 11.10: ChangeLog rows for data fixes that ran
// before the audit trail existed (repeat-safe).
//
// Reads one collection's JSON export from a backup folder (written by
// investor_tracking_backups/backup-live-db.js: <db>.<collection>.json, Extended
// JSON, <db> = the connected database's name), compares the listed fields with
// the documents in the database now, and writes one ChangeLog `update` row per
// document that differs: changes = the differing fields (old = backup value,
// new = current value), snapshot = the backup document, the given reason, one
// batchId per run. Each row's time is when it is written (nothing is backdated).
//
// A document that already has a ChangeLog row with the same reason is skipped,
// so a second run writes 0. A backup document no longer in the database is
// reported and skipped.
//
// Prints counts, ids, refs and field names only: never field values.
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
//
// Usage (from oysipa-backend/):
//   node scripts/record-backup-diff.js --backup <dir> --entity InvestorIssue \
//     --fields mdaResponsible --reason "migration: migrate-issue-mdas" \
//     [--ref-field importRef --refs ISS-01,ISS-02] --uri-env MONGO_URI_LIVE \
//     --as <email> [--allow-live] [--apply]
//
// --backup <dir>     the backup folder (e.g. ...\investor_tracking_backups\db-<stamp>).
// --entity <name>    Investor, InvestmentProject, InteractionLog, InvestorIssue,
//                    InvestmentAnnouncement or Setting.
// --fields <a,b>     top-level fields to compare.
// --reason <text>    must start with "migration: ".
// --refs <a,b>       only the backup documents whose --ref-field (default
//                    importRef) is one of these.
// --uri-env <NAME>   environment variable holding the MongoDB URI (default MONGO_URI).
//                    Values are loaded from oysipa-backend/.env if present; the URI
//                    itself is never printed.
// --as <email>       the active Director-General / Portal-Admin user the rows are
//                    recorded as (required with --apply).
// --allow-live       required to run against the live database (named "test").
// --apply            write the rows (otherwise dry run).
// Exit codes: 0 = done, 1 = error.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const ChangeLog = require('../src/models/ChangeLog');
const { recordUpdates, newBatchId } = require('../src/utils/recordDeletion');
const { diffDocs, recordFailure } = require('../src/utils/auditPlugin');
const {
  assertDbAllowed, assertActor, resolveActor, AS_REQUIRED_MSG,
} = require('./migrate-interaction-investor');

const MODELS = {
  Investor: () => require('../src/models/InvestorModel'), // eslint-disable-line global-require
  InvestmentProject: () => require('../src/models/InvestmentProject'), // eslint-disable-line global-require
  InteractionLog: () => require('../src/models/InteractionLog'), // eslint-disable-line global-require
  InvestorIssue: () => require('../src/models/InvestorIssue'), // eslint-disable-line global-require
  InvestmentAnnouncement: () => require('../src/models/InvestmentAnnouncement'), // eslint-disable-line global-require
  Setting: () => require('../src/models/Setting'), // eslint-disable-line global-require
};
const REASON_PREFIX = 'migration: ';
// Server bookkeeping is never recorded as a change; only top-level fields.
const FORBIDDEN_FIELDS = new Set(['_id', 'createdAt', 'updatedAt', '__v']);

// Returns an error message for a bad field list, or null.
const fieldsError = (fields) => {
  if (!Array.isArray(fields) || !fields.length) return '--fields is required';
  const bad = fields.filter((f) => FORBIDDEN_FIELDS.has(f) || f.includes('.') || f.startsWith('$'));
  return bad.length ? `--fields cannot include ${bad.join(', ')} (only top-level fields other than _id, createdAt, updatedAt, __v)` : null;
};
const { EJSON } = mongoose.mongo.BSON;

const list = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);

const parseArgs = (argv) => {
  const out = {
    backup: null, entity: null, fields: [], reason: null, refField: null, refs: null, uriEnv: 'MONGO_URI', as: null, allowLive: false, apply: false,
  };
  const value = (i, flag) => {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  const withValue = {
    '--backup': (v) => { out.backup = v; },
    '--entity': (v) => { out.entity = v; },
    '--fields': (v) => { out.fields = list(v); },
    '--reason': (v) => { out.reason = v; },
    '--ref-field': (v) => { out.refField = v; },
    '--refs': (v) => { out.refs = list(v); },
    '--uri-env': (v) => { out.uriEnv = v; },
    '--as': (v) => { out.as = v; },
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    if (withValue[flag]) {
      if (eq > 0) withValue[flag](a.slice(eq + 1));
      else { withValue[flag](value(i, a)); i += 1; }
    } else if (a === '--apply') out.apply = true;
    else if (a === '--allow-live') out.allowLive = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.backup) throw new Error('--backup is required');
  if (!out.entity || !MODELS[out.entity]) throw new Error(`--entity must be one of ${Object.keys(MODELS).join(', ')}`);
  const badFields = fieldsError(out.fields);
  if (badFields) throw new Error(badFields);
  if (!out.reason || !out.reason.startsWith(REASON_PREFIX) || out.reason.trim() === REASON_PREFIX.trim()) {
    throw new Error('--reason is required and must start with "migration: "');
  }
  if (out.refField && !out.refs) throw new Error('--ref-field needs --refs');
  if (out.refs && !out.refs.length) throw new Error('--refs must list at least one ref');
  if (out.refs && !out.refField) out.refField = 'importRef';
  if (!out.uriEnv) throw new Error('--uri-env needs a variable name');
  if (out.apply && !out.as) throw new Error(AS_REQUIRED_MSG);
  return out;
};

// The backup's export of this collection for the connected database.
const readBackup = (backupDir, dbName, collectionName) => {
  const file = path.join(backupDir, `${dbName}.${collectionName}.json`);
  if (!fs.existsSync(file)) throw new Error(`Backup file not found: ${file}`);
  // relaxed: numbers come back as plain numbers (canonical files hold
  // {"$numberInt": ...}); ObjectIds and dates keep their types.
  const docs = EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: true });
  if (!Array.isArray(docs)) throw new Error(`Backup file is not a list: ${file}`);
  return { file, docs };
};

// Runs on the current mongoose connection. Returns the summary counts.
const run = async ({
  backupDir, entity, fields, reason, refField = null, refs = null,
  apply = false, allowLive = false, actor = null, batchId = newBatchId(), log = console.log,
}) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  assertActor(apply, actor);
  if (!MODELS[entity]) throw new Error(`Unknown entity: ${entity}`);
  if (!reason || !reason.startsWith(REASON_PREFIX)) throw new Error('reason must start with "migration: "');
  const badFields = fieldsError(fields);
  if (badFields) throw new Error(badFields);
  if (refs && !refs.length) throw new Error('--refs must list at least one ref');
  // eslint-disable-next-line no-param-reassign
  if (refs && !refField) refField = 'importRef';
  const model = MODELS[entity]();
  const { file, docs } = readBackup(backupDir, mongoose.connection.name, model.collection.collectionName);

  log(`Mode: ${apply ? 'APPLY (writing ChangeLog rows)' : 'DRY RUN (nothing written)'}`);
  log(`Backup: ${path.basename(path.dirname(file))}/${path.basename(file)} (${docs.length} documents)`);
  log(`Entity: ${entity}; fields: ${fields.join(', ')}; reason: "${reason}"`);

  let selected = docs;
  const summary = {
    backup: docs.length, selected: 0, missingRefs: [], notInDb: 0, noDifference: 0, alreadyRecorded: 0, wouldRecord: 0, recorded: 0, failed: 0,
  };
  if (refs) {
    const wanted = new Set(refs);
    selected = docs.filter((d) => wanted.has(d[refField]));
    const found = new Set(selected.map((d) => d[refField]));
    summary.missingRefs = refs.filter((r) => !found.has(r));
    if (summary.missingRefs.length) log(`  Not in the backup (${refField}): ${summary.missingRefs.join(', ')}`);
  }
  summary.selected = selected.length;

  for (const backupDoc of selected) {
    const ref = backupDoc[refField || 'importRef'];
    const label = `${entity} ${backupDoc._id}${typeof ref === 'string' && ref ? ` (${ref})` : ''}`;
    // eslint-disable-next-line no-await-in-loop
    const current = await model.collection.findOne({ _id: backupDoc._id });
    if (!current) {
      summary.notInDb += 1;
      log(`  ${label}: SKIP - not in the database now`);
      continue;
    }
    const pick = (doc) => Object.fromEntries(fields.map((f) => [f, doc[f]]));
    const changes = diffDocs(pick(backupDoc), pick(current));
    if (!changes.length) {
      summary.noDifference += 1;
      continue;
    }
    // Already recorded: a row with the same reason for these fields.
    // eslint-disable-next-line no-await-in-loop
    if (await ChangeLog.exists({
      entity, entityId: backupDoc._id, reason, 'changes.field': { $all: changes.map((c) => c.field) },
    })) {
      summary.alreadyRecorded += 1;
      log(`  ${label}: already recorded - skipped`);
      continue;
    }
    const changed = changes.map((c) => c.field).join(', ');
    if (!apply) {
      summary.wouldRecord += 1;
      log(`  ${label}: would record ${changed}`);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await recordUpdates(actor, entity, [{ snapshot: backupDoc, changes }], { reason, batchId });
      summary.recorded += 1;
      log(`  ${label}: recorded ${changed}`);
    } catch (error) {
      summary.failed += 1;
      // eslint-disable-next-line no-await-in-loop
      await recordFailure([{ entity, entityId: backupDoc._id, action: 'update' }], error);
      log(`  ${label}: FAILED to record (logged on the server)`);
    }
  }

  log(`Selected: ${summary.selected}; not in database: ${summary.notInDb}; no difference: ${summary.noDifference}; already recorded: ${summary.alreadyRecorded}`);
  log(apply ? `Recorded: ${summary.recorded}; failed: ${summary.failed}` : `Would record: ${summary.wouldRecord} (dry run)`);
  return summary;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env[args.uriEnv];
  if (!uri) throw new Error(`Environment variable ${args.uriEnv} is not set`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${args.uriEnv})`);
    assertDbAllowed(mongoose.connection.name, args.allowLive);
    const actor = args.apply ? await resolveActor(args.as) : null;
    const summary = await run({
      backupDir: path.resolve(args.backup),
      entity: args.entity,
      fields: args.fields,
      reason: args.reason,
      refField: args.refField,
      refs: args.refs,
      apply: args.apply,
      allowLive: args.allowLive,
      actor,
    });
    if (summary.failed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`record-backup-diff failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, run, readBackup };
