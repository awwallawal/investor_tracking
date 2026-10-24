#!/usr/bin/env node
// import-announcements.js — story 11.8 loader for the content studio's
// investment announcements JSON (DLR 4.4). Service logic:
// src/services/announcementImport.js.
//
// DRY RUN BY DEFAULT. Nothing is written or uploaded unless --apply is given.
// A dry run needs no storage credentials. Prints counts, refs, file numbers and
// reasons only: never names. Loaded announcements that differ from the file are
// listed by ref with the names of the differing fields only; the loader never
// overwrites them.
//
// Bower's Tower is NOT in this file: the owner enters it in the live system.
//
// Usage (from oysipa-backend/):
//   npm run import:announcements -- --file <json> --files-root <dir> --uri-env MONGO_URI                 # dry run
//   npm run import:announcements -- --file <json> --files-root <dir> --uri-env MONGO_URI --apply --as <email>
//   npm run import:announcements -- --file <json> --files-root <dir> --uri-env MONGO_URI_LIVE --allow-live [--apply --as <email>]
//
// --file <json>       the announcements file (keep it outside the repo).
// --files-root <dir>  folder the relative archivedFiles paths resolve against
//                     (default: the file's folder).
// --uri-env <NAME>    environment variable holding the MongoDB URI (default MONGO_URI).
//                     The URI itself is never printed.
// --apply             write (otherwise dry run).
// --as <email>        with --apply: the active Director-General / Portal-Admin
//                     user the run is recorded as (ChangeLog `by`, createdBy, files).
// --allow-live        required to run against the live database (named "test").
// Exit codes: 0 = done, 1 = error.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const {
  parseAnnouncementsFile, planAnnouncementImport, applyAnnouncementImport,
} = require('../src/services/announcementImport');
const { assertDbAllowed } = require('./migrate-interaction-investor');
const { parseArgs } = require('./import-issues');
const { newBatchId } = require('../src/utils/recordDeletion');

const ADMIN_ROLES = ['Director-General', 'Portal-Admin'];

const printPlan = (plan, log) => {
  const c = plan.counts;
  log(`Announcements in file: ${c.announcements}`);
  log(`Announcements to create: ${c.toCreate}; already loaded: ${c.existing}`);
  log(`Supporting interaction links (new announcements): ${c.interactionLinks}`);
  log(`Files referenced: ${c.files} (file errors: ${c.fileErrors})`);
  log(`Files to upload: ${c.filesToUpload}; already stored: ${c.filesAlreadyStored}`);
  log(`Links to add: ${c.linksToAdd}; already linked: ${c.linksExisting}`);
  log(`${c.changed} loaded announcements differ from the file (a difference can also be an edit made in the app since loading; never overwritten; field names only)`);
  (plan.changes || []).forEach((d) => log(`  ${d.ref}: ${d.fields.join(', ')}`));
  log(`Errors: ${c.errors}; warnings: ${c.warnings}`);
  plan.errors.forEach((e) => log(`  ERROR row ${e.row} ${e.ref}: ${e.reason}`));
  plan.warnings.forEach((w) => log(`  WARNING row ${w.row} ${w.ref}: ${w.message}`));
};

// Runs on the current mongoose connection.
const run = async ({
  data, filesRoot, apply = false, allowLive = false, actor = null, log = console.log,
}) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  if (apply && !(actor && ADMIN_ROLES.includes(actor.role) && actor.status === 'active')) {
    throw new Error('--as must be the email of an active Director-General or Portal-Admin user');
  }
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written, nothing uploaded)'}`);
  const plan = await planAnnouncementImport(data, { filesRoot });
  printPlan(plan, log);
  if (!apply) return { plan };
  // The batch id is printed before anything is written, so a run that stops
  // part-way can still be found in the ChangeLog.
  const batchId = newBatchId();
  log(`Batch: ${batchId}`);
  const result = await applyAnnouncementImport(plan, actor, { batchId });
  const r = result.counts;
  log(`Announcements created: ${r.announcementsCreated}; folders created: ${r.foldersCreated}; files uploaded: ${r.filesUploaded}; links added: ${r.linksAdded}; audit rows: ${r.auditRows}`);
  log(`Write errors: ${result.errors.length}`);
  result.errors.forEach((e) => log(`  WRITE ERROR ${e.ref}${e.file ? ` file #${e.file}` : ''}: ${e.stage}`));
  return { plan, result };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env[args.uriEnv];
  if (!uri) throw new Error(`Environment variable ${args.uriEnv} is not set`);
  const filePath = path.resolve(args.file);
  const data = parseAnnouncementsFile(fs.readFileSync(filePath));
  const filesRoot = args.filesRoot ? path.resolve(args.filesRoot) : path.dirname(filePath);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${args.uriEnv})`);
    assertDbAllowed(mongoose.connection.name, args.allowLive);
    let actor = null;
    if (args.apply) actor = await User.findOne({ email: args.as.toLowerCase(), status: 'active' });
    await run({
      data, filesRoot, apply: args.apply, allowLive: args.allowLive, actor,
    });
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`import-announcements failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, run, printPlan };
