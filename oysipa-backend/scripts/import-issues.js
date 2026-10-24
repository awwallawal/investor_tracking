#!/usr/bin/env node
// import-issues.js — story 11.7 loader for the content studio's investor issues
// JSON. Service logic: src/services/issueImport.js.
//
// DRY RUN BY DEFAULT. Nothing is written or uploaded unless --apply is given.
// A dry run needs no storage credentials. Prints counts, issue refs (ISS-05),
// file numbers and reasons only: never names, emails or phones.
//
// Usage (from oysipa-backend/):
//   npm run import:issues -- --file <json> --files-root <dir> --uri-env MONGO_URI                 # dry run
//   npm run import:issues -- --file <json> --files-root <dir> --uri-env MONGO_URI --apply --as <email>
//   npm run import:issues -- --file <json> --files-root <dir> --uri-env MONGO_URI_LIVE --allow-live [--apply --as <email>]
//
// --file <json>       the issues file (keep it outside the repo: personal data).
// --files-root <dir>  folder the relative evidenceFiles paths resolve against
//                     (default: the file's folder).
// --uri-env <NAME>    environment variable holding the MongoDB URI (default MONGO_URI).
//                     The URI itself is never printed.
// --apply             write (otherwise dry run).
// --as <email>        with --apply: the active Director-General / Portal-Admin
//                     user the run is recorded as (ChangeLog `by`, actions, files).
// --allow-live        required to run against the live database (named "test").
// Exit codes: 0 = done, 1 = error.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { parseIssuesFile, planIssueImport, applyIssueImport } = require('../src/services/issueImport');
const { assertDbAllowed } = require('./migrate-interaction-investor');

const ADMIN_ROLES = ['Director-General', 'Portal-Admin'];

const parseArgs = (argv) => {
  const out = {
    file: null, filesRoot: null, uriEnv: 'MONGO_URI', apply: false, allowLive: false, as: null,
  };
  const value = (i, flag) => {
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file') { out.file = value(i, a); i += 1; } else if (a.startsWith('--file=')) out.file = a.slice(7);
    else if (a === '--files-root') { out.filesRoot = value(i, a); i += 1; } else if (a.startsWith('--files-root=')) out.filesRoot = a.slice(13);
    else if (a === '--uri-env') { out.uriEnv = value(i, a); i += 1; } else if (a.startsWith('--uri-env=')) out.uriEnv = a.slice(10);
    else if (a === '--as') { out.as = value(i, a); i += 1; } else if (a.startsWith('--as=')) out.as = a.slice(5);
    else if (a === '--apply') out.apply = true;
    else if (a === '--allow-live') out.allowLive = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.file) throw new Error('--file is required');
  if (!out.uriEnv) throw new Error('--uri-env needs a variable name');
  if (out.apply && !out.as) throw new Error('--apply needs --as <email> (a Director-General or Portal-Admin user)');
  return out;
};

const printPlan = (plan, log) => {
  const c = plan.counts;
  log(`Issues in file: ${c.issues}`);
  log(`Issues to create: ${c.toCreate}; already loaded: ${c.existing}`);
  log(`Files referenced: ${c.files} (file errors: ${c.fileErrors})`);
  log(`Files to upload: ${c.filesToUpload}; already stored: ${c.filesAlreadyStored}`);
  log(`Links to add: ${c.linksToAdd}; already linked: ${c.linksExisting}`);
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
  const plan = await planIssueImport(data, { filesRoot });
  printPlan(plan, log);
  if (!apply) return { plan };
  const result = await applyIssueImport(plan, actor);
  const r = result.counts;
  log(`Batch: ${result.batchId}`);
  log(`Issues created: ${r.issuesCreated}; folders created: ${r.foldersCreated}; files uploaded: ${r.filesUploaded}; links added: ${r.linksAdded}; audit rows: ${r.auditRows}`);
  log(`Write errors: ${result.errors.length}`);
  result.errors.forEach((e) => log(`  WRITE ERROR ${e.ref}${e.file ? ` file #${e.file}` : ''}: ${e.stage}`));
  return { plan, result };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env[args.uriEnv];
  if (!uri) throw new Error(`Environment variable ${args.uriEnv} is not set`);
  const filePath = path.resolve(args.file);
  const data = parseIssuesFile(fs.readFileSync(filePath));
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
    console.error(`import-issues failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, run, printPlan };
