#!/usr/bin/env node
// attach-documents.js — bulk load of evidence files into the Evidence library
// from the content studio's library manifest (CSV). Service logic:
// src/services/evidenceImport.js.
//
// DRY RUN BY DEFAULT. Nothing is written or uploaded unless --apply is given.
// A dry run needs no storage credentials. Prints counts, row numbers, file
// names and refs only.
//
// Usage (from oysipa-backend/):
//   npm run attach:documents -- --manifest <csv> --uri-env MONGO_URI                 # dry run
//   npm run attach:documents -- --manifest <csv> --uri-env MONGO_URI --apply --as <email>
//   npm run attach:documents -- --manifest <csv> --uri-env MONGO_URI_LIVE --allow-live [--apply --as <email>]
//
// --manifest <csv>  the library manifest (keep it outside the repo). Relative
//                   `file` paths resolve against the manifest's folder.
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   The URI itself is never printed.
// --apply           write (otherwise dry run).
// --as <email>      with --apply: the Director-General / Portal-Admin user the
//                   run is recorded as (ChangeLog `by`, uploadedBy, linkedBy).
// --allow-live      required to run against the live database (named "test").
// Exit codes: 0 = done, 1 = error.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { parseManifest, planEvidenceImport, applyEvidenceImport } = require('../src/services/evidenceImport');
const { assertDbAllowed } = require('./migrate-interaction-investor');

const ADMIN_ROLES = ['Director-General', 'Portal-Admin'];

const parseArgs = (argv) => {
  const out = {
    manifest: null, uriEnv: 'MONGO_URI', apply: false, allowLive: false, as: null,
  };
  const value = (i, flag) => {
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--manifest') { out.manifest = value(i, a); i += 1; } else if (a.startsWith('--manifest=')) out.manifest = a.slice(11);
    else if (a === '--uri-env') { out.uriEnv = value(i, a); i += 1; } else if (a.startsWith('--uri-env=')) out.uriEnv = a.slice(10);
    else if (a === '--as') { out.as = value(i, a); i += 1; } else if (a.startsWith('--as=')) out.as = a.slice(5);
    else if (a === '--apply') out.apply = true;
    else if (a === '--allow-live') out.allowLive = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.manifest) throw new Error('--manifest is required');
  if (!out.uriEnv) throw new Error('--uri-env needs a variable name');
  if (out.apply && !out.as) throw new Error('--apply needs --as <email> (a Director-General or Portal-Admin user)');
  return out;
};

const printPlan = (plan, log) => {
  const c = plan.counts;
  log(`Manifest rows: ${c.rows} (attach=yes: ${c.attachRows}; attach=no, not loaded: ${c.notAttached})`);
  log(`Rows loaded: ${c.rowsLoaded}; skipped: ${c.skipped}; warnings: ${c.warnings}`);
  log(`Folders to create: ${c.foldersToCreate}`);
  log(`Files to upload: ${c.filesToUpload}; already stored: ${c.filesAlreadyStored}`);
  log(`Links to add: ${c.linksToAdd}; already linked: ${c.linksExisting}`);
  log(`Untagged files (no link): ${c.untaggedFiles}`);
  log(`interactionRef errors: ${c.refErrors}`);
  plan.skipped.forEach((s) => log(`  SKIPPED row ${s.row} "${s.fileName}": ${s.reason}`));
  plan.warnings.forEach((w) => log(`  WARNING row ${w.row} "${w.fileName}": ${w.message}`));
  plan.refErrors.forEach((e) => log(`  REF ERROR row ${e.row} "${e.fileName}": ${e.ref}: ${e.reason} (file stored, not linked)`));
};

// Runs on the current mongoose connection.
const run = async ({
  rows, baseDir, apply = false, allowLive = false, actor = null, log = console.log,
}) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  if (apply && !(actor && ADMIN_ROLES.includes(actor.role) && actor.status === 'active')) {
    throw new Error('--as must be the email of an active Director-General or Portal-Admin user');
  }
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written, nothing uploaded)'}`);
  const plan = await planEvidenceImport(rows, { baseDir });
  printPlan(plan, log);
  if (!apply) return { plan };
  const result = await applyEvidenceImport(plan, actor);
  const r = result.counts;
  log(`Batch: ${result.batchId}`);
  log(`Folders created: ${r.foldersCreated}; files uploaded: ${r.filesUploaded}; links added: ${r.linksAdded}; audit rows: ${r.auditRows}`);
  log(`Write errors: ${result.errors.length}`);
  result.errors.forEach((e) => log(e.folderKey
    ? `  WRITE ERROR folder ${e.folderKey}: ${e.stage} failed`
    : `  WRITE ERROR row ${e.row} "${e.fileName}": ${e.stage === 'file not stored' ? 'not linked, file not stored' : `${e.stage} failed`}`));
  return { plan, result };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env[args.uriEnv];
  if (!uri) throw new Error(`Environment variable ${args.uriEnv} is not set`);
  const manifestPath = path.resolve(args.manifest);
  const rows = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${args.uriEnv})`);
    assertDbAllowed(mongoose.connection.name, args.allowLive);
    let actor = null;
    // Only an active DG/Admin account can be recorded as the actor.
    if (args.apply) actor = await User.findOne({ email: args.as.toLowerCase(), status: 'active' });
    await run({
      rows, baseDir: path.dirname(manifestPath), apply: args.apply, allowLive: args.allowLive, actor,
    });
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`attach-documents failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, run, printPlan };
