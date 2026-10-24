#!/usr/bin/env node
// migrate-interaction-investor.js — story 11.4 back-fill (idempotent).
//
// Sets InteractionLog.investor from each log's project, only where investor is
// missing. Logs whose project no longer exists (or has no investor) are logged
// and skipped. No service codes are set: the category → code mapping table is
// empty by owner decision (18 Oct 2026); officers tag codes via "Tag services".
// updatedAt is left as it was (the back-fill is not an officer edit).
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
//
// Usage (from oysipa-backend/):
//   npm run migrate:interactions -- --uri-env MONGO_URI_TEST            # dry run
//   npm run migrate:interactions -- --uri-env MONGO_URI_TEST --apply --as <email>    # write
//   npm run migrate:interactions -- --uri-env MONGO_URI_LIVE --allow-live [--apply --as <email>]
//
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   Values are loaded from oysipa-backend/.env if present; the URI
//                   itself is never printed.
// --apply           write the changes (otherwise dry run).
// --allow-live      required to run against the live database (named "test").
// --as <email>      required with --apply: the active Director-General / Portal-Admin
//                   user the run is recorded as. Each changed log gets a ChangeLog
//                   update row (reason "migration: migrate-interaction-investor",
//                   one batchId per run).
// Exit codes: 0 = done (dry run or apply), 1 = error (bad args, missing env,
// connect failure, live database refused).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const InteractionLog = require('../src/models/InteractionLog');
const InvestmentProject = require('../src/models/InvestmentProject');
const User = require('../src/models/User');
const { recordUpdates, newBatchId } = require('../src/utils/recordDeletion');
const { runAs } = require('../src/utils/auditContext');
const { recordFailure } = require('../src/utils/auditPlugin');

const LIVE_DB_NAME = 'test';

// Legacy category → SABER service code. Empty on purpose: no codes are guessed.
const CATEGORY_CODE_MAPPING = {};

const ADMIN_ROLES = ['Director-General', 'Portal-Admin'];
const AS_REQUIRED_MSG = '--apply needs --as <email> (a Director-General or Portal-Admin user)';
const BAD_ACTOR_MSG = '--as must be the email of an active Director-General or Portal-Admin user';

const parseArgs = (argv) => {
  let uriEnv = 'MONGO_URI';
  let apply = false;
  let allowLive = false;
  let as = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--uri-env') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('--uri-env needs a variable name');
      uriEnv = next;
      i += 1;
    } else if (argv[i].startsWith('--uri-env=')) {
      uriEnv = argv[i].slice('--uri-env='.length);
    } else if (argv[i] === '--apply') {
      apply = true;
    } else if (argv[i] === '--allow-live') {
      allowLive = true;
    } else if (argv[i] === '--as') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('--as needs an email');
      as = next;
      i += 1;
    } else if (argv[i].startsWith('--as=')) {
      as = argv[i].slice('--as='.length);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!uriEnv) throw new Error('--uri-env needs a variable name');
  if (apply && !as) throw new Error(AS_REQUIRED_MSG);
  return {
    uriEnv, apply, allowLive, as,
  };
};

const assertDbAllowed = (dbName, allowLive) => {
  if (dbName === LIVE_DB_NAME && !allowLive) {
    throw new Error(`Refusing to run against database "${LIVE_DB_NAME}" (live) without --allow-live`);
  }
};

// Story 11.10 helpers shared by the migration scripts.
const isAdminActor = (actor) => !!(actor && actor._id && ADMIN_ROLES.includes(actor.role) && actor.status === 'active');

// --as email -> the active DG / Portal-Admin user (throws otherwise).
const resolveActor = async (email) => {
  if (!email) throw new Error(AS_REQUIRED_MSG);
  const actor = await User.findOne({ email: String(email).trim().toLowerCase(), status: 'active' }).select('-password');
  if (!isAdminActor(actor)) throw new Error(BAD_ACTOR_MSG);
  return actor;
};

// An apply run must say who it is recorded as.
const assertActor = (apply, actor) => {
  if (apply && !isAdminActor(actor)) throw new Error(actor ? BAD_ACTOR_MSG : AS_REQUIRED_MSG);
};

// Writes one ChangeLog update row for a changed document. A failed write is
// logged and counted (summary.auditFailed); the data change stands.
const auditMigrationRow = async ({
  actor, entity, snapshot, changes, reason, batchId, label, log, summary,
}) => {
  try {
    await recordUpdates(actor, entity, [{ snapshot, changes }], { reason, batchId });
    if (summary) summary.auditRows = (summary.auditRows || 0) + 1;
  } catch (error) {
    if (summary) summary.auditFailed = (summary.auditFailed || 0) + 1;
    // Logged as '[audit] ChangeLog write failed' and counted (Setting auditFailures).
    await recordFailure([{ entity, entityId: snapshot && snapshot._id, action: 'update' }], error);
    log(`  ${label}: audit row FAILED (logged on the server)`);
  }
};

const REASON = 'migration: migrate-interaction-investor';

const missingInvestor = { $or: [{ investor: { $exists: false } }, { investor: null }] };

// Runs on the current mongoose connection. Returns the summary counts.
const migrate = async ({
  apply = false, allowLive = false, actor = null, batchId = newBatchId(), log = console.log,
} = {}) => {
  const dbName = mongoose.connection.name;
  assertDbAllowed(dbName, allowLive);
  assertActor(apply, actor);

  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`);
  log('Category -> service code mapping table:');
  const mappingRows = Object.entries(CATEGORY_CODE_MAPPING);
  if (mappingRows.length === 0) {
    log('  (empty) - no codes set');
  } else {
    mappingRows.forEach(([category, codes]) => log(`  ${category} -> ${codes.join(', ')}`));
  }

  const total = await InteractionLog.countDocuments();
  const candidates = await InteractionLog.find(missingInvestor).select('_id project').sort({ _id: 1 }).lean();

  const summary = {
    total, missingInvestor: candidates.length, changed: 0, wouldChange: 0, skippedOrphan: 0, skippedNoProject: 0, auditRows: 0, auditFailed: 0,
  };

  for (const rec of candidates) {
    if (!rec.project) {
      summary.skippedNoProject += 1;
      log(`  ${rec._id}: SKIP - no project and no investor`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const project = await InvestmentProject.findById(rec.project).select('investor').lean();
    if (!project || !project.investor) {
      summary.skippedOrphan += 1;
      log(`  ${rec._id}: SKIP - project ${rec.project} ${project ? 'has no investor' : 'not found'} (orphan)`);
      continue;
    }
    if (!apply) {
      summary.wouldChange += 1;
      log(`  ${rec._id}: would set investor ${project.investor} (from project ${rec.project})`);
      continue;
    }
    // The full stored document, for the ChangeLog snapshot.
    // eslint-disable-next-line no-await-in-loop
    const before = await InteractionLog.collection.findOne({ _id: rec._id });
    // Filter re-checks "missing" so a concurrent/second run cannot overwrite.
    // The audit plugin is suppressed: this script writes its own row below.
    // exec() runs the query inside runAs (a Query is lazy).
    // eslint-disable-next-line no-await-in-loop
    const res = await runAs(actor, () => InteractionLog.updateOne(
      { _id: rec._id, ...missingInvestor },
      { $set: { investor: project.investor } },
      { timestamps: false },
    ).exec(), { batchId, reason: REASON, suppress: ['create', 'update'] });
    if (res.modifiedCount === 1) {
      summary.changed += 1;
      log(`  ${rec._id}: set investor ${project.investor} (from project ${rec.project})`);
      // eslint-disable-next-line no-await-in-loop
      await auditMigrationRow({
        actor,
        entity: 'InteractionLog',
        snapshot: before,
        changes: [{ field: 'investor', old: before ? before.investor : null, new: project.investor }],
        reason: REASON,
        batchId,
        label: String(rec._id),
        log,
        summary,
      });
    } else {
      log(`  ${rec._id}: unchanged (investor already set)`);
    }
  }

  log(`Interaction logs total: ${summary.total}`);
  log(`Missing investor: ${summary.missingInvestor}`);
  if (apply) {
    log(`Changed: ${summary.changed}`);
    log(`ChangeLog rows: ${summary.auditRows}${summary.auditFailed ? `; audit rows FAILED: ${summary.auditFailed}` : ''}`);
  }
  else log(`Would change: ${summary.wouldChange} (changed: 0, dry run)`);
  log(`Skipped (orphan project): ${summary.skippedOrphan}`);
  log(`Skipped (no project): ${summary.skippedNoProject}`);
  log('Service codes set: 0 (no codes set)');
  return summary;
};

const main = async () => {
  const {
    uriEnv, apply, allowLive, as,
  } = parseArgs(process.argv.slice(2));
  const uri = process.env[uriEnv];
  if (!uri) throw new Error(`Environment variable ${uriEnv} is not set`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${uriEnv})`);
    assertDbAllowed(mongoose.connection.name, allowLive);
    const actor = apply ? await resolveActor(as) : null;
    const summary = await migrate({ apply, allowLive, actor });
    if (summary.auditFailed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`migrate-interaction-investor failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs, assertDbAllowed, migrate, CATEGORY_CODE_MAPPING,
  resolveActor, assertActor, auditMigrationRow, isAdminActor, AS_REQUIRED_MSG, BAD_ACTOR_MSG,
};
