#!/usr/bin/env node
// import-investors.js — story 11.11 CLI for the content studio import file.
// Uses the same service as the Import investors dialog (src/services/investorImport.js).
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
// Prints counts, keys (normalised organisation names), file ids and field names:
// never emails, phones or contact names.
//
// Usage (from oysipa-backend/):
//   npm run import:investors -- --file <path> --uri-env MONGO_URI_TEST                 # dry run
//   npm run import:investors -- --file <path> --uri-env MONGO_URI_TEST --apply --as <email>
//   npm run import:investors -- --file <path> --uri-env MONGO_URI_LIVE --allow-live [--apply --as <email>]
//
// --file <path>     the import JSON (keep it outside the repo: personal data).
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   The URI itself is never printed.
// --apply           write the import (otherwise dry run).
// --as <email>      with --apply: the Director-General / Portal-Admin user the
//                   import is recorded as (ChangeLog `by`, interaction `loggedBy`).
// --allow-live      required to run against the live database (named "test").
// Exit codes: 0 = done, 1 = error.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { parseImportFile, planImport, applyImport } = require('../src/services/investorImport');
const { assertDbAllowed } = require('./migrate-interaction-investor');

const ADMIN_ROLES = ['Director-General', 'Portal-Admin'];

const parseArgs = (argv) => {
  const out = {
    file: null, uriEnv: 'MONGO_URI', apply: false, allowLive: false, as: null,
  };
  const value = (i, flag) => {
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file') { out.file = value(i, a); i += 1; } else if (a.startsWith('--file=')) out.file = a.slice(7);
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

// Report lines with no personal data: row numbers, keys, file ids, field names, reasons.
const printReport = (report, log) => {
  const c = report.counts;
  log(`Records: ${c.records}`);
  log(`To create: ${c.create}`);
  log(`To update: ${c.update} (fields to fill: ${c.fieldsToFill}; unchanged: ${c.unchanged})`);
  log(`Projects to create: ${c.projectsToCreate} (skipped, same title: ${c.projectsSkipped})`);
  log(`Duplicates skipped: ${c.duplicates}`);
  log(`Interactions to create: ${c.interactionsToCreate} of ${c.interactions} (duplicates: ${c.interactionDuplicates}; errors: ${c.interactionErrors})`);
  log(`Record errors: ${c.errors}`);
  log(`Warnings: ${c.warnings}`);
  // Errors: key or file id plus a reason class only (reasons may quote names).
  report.errors.forEach((e) => log(`  ERROR ${e.kind} row ${e.row} ${e.kind === 'interaction' ? `id ${e.id}` : `key "${e.key}"`}: ${e.missingStatus ? `lifecycle status "${e.missingStatus}" is not in the app` : e.message.split(':')[0].replace(/"[^"]*"/g, '"…"')}`));
  report.duplicates.forEach((d) => log(`  DUPLICATE ${d.kind} row ${d.row} ${d.kind === 'interaction' ? `id ${d.id}` : `key "${d.key}"`}`));
};

const run = async ({ input, apply = false, allowLive = false, actor = null, log = console.log }) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  // The import is recorded as a Director-General / Portal-Admin user only.
  if (apply && !(actor && ADMIN_ROLES.includes(actor.role))) {
    throw new Error('--as must be the email of a Director-General or Portal-Admin user');
  }
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`);
  const plan = await planImport(parseImportFile(input));
  printReport(plan.report, log);
  if (!apply) return { report: plan.report };
  const result = await applyImport(plan, actor);
  const r = result.counts;
  log(`Batch: ${result.batchId}`);
  log(`Created: ${r.created}; updated: ${r.updated} (fields filled: ${r.fieldsFilled}); projects: ${r.projectsCreated}; interactions: ${r.interactionsCreated}; audit rows: ${r.auditRows}`);
  log(`Write errors: ${result.errors.length}`);
  result.errors.forEach((e) => log(`  WRITE ERROR row ${e.row}${e.key ? ` key "${e.key}"` : ''}${e.id ? ` id ${e.id}` : ''}`));
  return { report: plan.report, result };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env[args.uriEnv];
  if (!uri) throw new Error(`Environment variable ${args.uriEnv} is not set`);
  const input = fs.readFileSync(path.resolve(args.file));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${args.uriEnv})`);
    assertDbAllowed(mongoose.connection.name, args.allowLive);
    let actor = null;
    if (args.apply) {
      actor = await User.findOne({ email: args.as.toLowerCase() });
    }
    await run({ input, apply: args.apply, allowLive: args.allowLive, actor });
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`import-investors failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, run, printReport };
