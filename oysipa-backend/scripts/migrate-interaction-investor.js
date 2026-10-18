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
//   npm run migrate:interactions -- --uri-env MONGO_URI_TEST --apply    # write
//   npm run migrate:interactions -- --uri-env MONGO_URI_LIVE --allow-live [--apply]
//
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   Values are loaded from oysipa-backend/.env if present; the URI
//                   itself is never printed.
// --apply           write the changes (otherwise dry run).
// --allow-live      required to run against the live database (named "test").
// Exit codes: 0 = done (dry run or apply), 1 = error (bad args, missing env,
// connect failure, live database refused).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const InteractionLog = require('../src/models/InteractionLog');
const InvestmentProject = require('../src/models/InvestmentProject');

const LIVE_DB_NAME = 'test';

// Legacy category → SABER service code. Empty on purpose: no codes are guessed.
const CATEGORY_CODE_MAPPING = {};

const parseArgs = (argv) => {
  let uriEnv = 'MONGO_URI';
  let apply = false;
  let allowLive = false;
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
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!uriEnv) throw new Error('--uri-env needs a variable name');
  return { uriEnv, apply, allowLive };
};

const assertDbAllowed = (dbName, allowLive) => {
  if (dbName === LIVE_DB_NAME && !allowLive) {
    throw new Error(`Refusing to run against database "${LIVE_DB_NAME}" (live) without --allow-live`);
  }
};

const missingInvestor = { $or: [{ investor: { $exists: false } }, { investor: null }] };

// Runs on the current mongoose connection. Returns the summary counts.
const migrate = async ({ apply = false, allowLive = false, log = console.log } = {}) => {
  const dbName = mongoose.connection.name;
  assertDbAllowed(dbName, allowLive);

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

  const summary = { total, missingInvestor: candidates.length, changed: 0, wouldChange: 0, skippedOrphan: 0, skippedNoProject: 0 };

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
    // Filter re-checks "missing" so a concurrent/second run cannot overwrite.
    // eslint-disable-next-line no-await-in-loop
    const res = await InteractionLog.updateOne(
      { _id: rec._id, ...missingInvestor },
      { $set: { investor: project.investor } },
      { timestamps: false },
    );
    if (res.modifiedCount === 1) {
      summary.changed += 1;
      log(`  ${rec._id}: set investor ${project.investor} (from project ${rec.project})`);
    } else {
      log(`  ${rec._id}: unchanged (investor already set)`);
    }
  }

  log(`Interaction logs total: ${summary.total}`);
  log(`Missing investor: ${summary.missingInvestor}`);
  if (apply) log(`Changed: ${summary.changed}`);
  else log(`Would change: ${summary.wouldChange} (changed: 0, dry run)`);
  log(`Skipped (orphan project): ${summary.skippedOrphan}`);
  log(`Skipped (no project): ${summary.skippedNoProject}`);
  log('Service codes set: 0 (no codes set)');
  return summary;
};

const main = async () => {
  const { uriEnv, apply, allowLive } = parseArgs(process.argv.slice(2));
  const uri = process.env[uriEnv];
  if (!uri) throw new Error(`Environment variable ${uriEnv} is not set`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${uriEnv})`);
    await migrate({ apply, allowLive });
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

module.exports = { parseArgs, assertDbAllowed, migrate, CATEGORY_CODE_MAPPING };
