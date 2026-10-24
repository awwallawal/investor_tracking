#!/usr/bin/env node
// migrate-issue-refs.js — story 11.7b one-off (repeat-safe).
//
// Gives every InvestorIssue a readable `reference` (ISS-NN):
// - a loaded issue whose importRef is ISS-NN and free gets reference = importRef;
// - every other issue without a reference gets the next free number, oldest
//   createdAt first (after the highest ISS-NN in use).
// An issue that already has a reference is never changed, so a second run
// changes 0. Only `reference` is written (raw collection), updatedAt is kept.
//
// References are stored in the canonical form (ISS-5 → ISS-05); a reference
// that is '' or null counts as missing.
//
// Run right after deploying 11.7b; if a row reports FAILED, run it again.
//
// Prints counts, issue ids and references only: never investor names or other
// field values.
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
//
// Usage (from oysipa-backend/):
//   npm run migrate:issue-refs -- --uri-env MONGO_URI                         # dry run
//   npm run migrate:issue-refs -- --uri-env MONGO_URI --apply --as <email>    # write
//   npm run migrate:issue-refs -- --uri-env MONGO_URI_LIVE --allow-live [--apply --as <email>]
//
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   Values are loaded from oysipa-backend/.env if present; the URI
//                   itself is never printed.
// --apply           write the changes (otherwise dry run).
// --allow-live      required to run against the live database (named "test").
// --as <email>      required with --apply: the active Director-General / Portal-Admin
//                   user the run is recorded as. Each changed record gets a ChangeLog
//                   update row (reason "migration: migrate-issue-refs", one batchId per run).
// Exit codes: 0 = done, 1 = error (bad args, missing env, connect failure,
// live database refused).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const InvestorIssue = require('../src/models/InvestorIssue');
const { canonicalReference, formatReference, referenceNumber } = require('../src/services/issueRegister');
const {
  parseArgs, assertDbAllowed, assertActor, resolveActor, auditMigrationRow,
} = require('./migrate-interaction-investor');
const { newBatchId } = require('../src/utils/recordDeletion');

const DEPLOY_NOTE = 'Run right after deploying 11.7b; if a row reports FAILED, run it again.';
const REASON = 'migration: migrate-issue-refs';
const hasReference = (i) => typeof i.reference === 'string' && i.reference !== '';
const MISSING_REFERENCE = { $or: [{ reference: { $exists: false } }, { reference: null }, { reference: '' }] };

// Plans the references for the issues that have none. Returns
// { alreadySet, plan: [{ _id, reference, source: 'importRef' | 'next', note? }] }.
const planReferences = (issues) => {
  const used = new Set(issues.filter(hasReference).map((i) => canonicalReference(i.reference) || i.reference));
  const missing = issues.filter((i) => !hasReference(i));
  const plan = [];
  const rest = [];
  // 1. Loaded issues keep their own number.
  missing.forEach((i) => {
    const own = canonicalReference(i.importRef);
    if (own && !used.has(own)) {
      used.add(own);
      plan.push({ _id: i._id, importRef: i.importRef, reference: own, source: 'importRef' });
    } else {
      rest.push(i);
    }
  });
  // 2. The others take the next free numbers, oldest first.
  let max = [...used].reduce((n, r) => Math.max(n, referenceNumber(r)), 0);
  rest.forEach((i) => {
    max += 1;
    plan.push({
      _id: i._id,
      importRef: i.importRef,
      reference: formatReference(max),
      source: 'next',
      ...(canonicalReference(i.importRef) && { note: `importRef ${i.importRef} is already used` }),
    });
  });
  return { alreadySet: issues.length - missing.length, plan };
};

// Runs on the current mongoose connection. Returns the summary counts.
const migrate = async ({
  apply = false, allowLive = false, actor = null, batchId = newBatchId(), log = console.log,
} = {}) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  assertActor(apply, actor);
  log(DEPLOY_NOTE);
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`);

  const issues = await InvestorIssue.collection
    .find({}, { projection: { _id: 1, importRef: 1, reference: 1, createdAt: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const { alreadySet, plan } = planReferences(issues);

  const summary = {
    total: issues.length,
    alreadySet,
    fromImportRef: plan.filter((p) => p.source === 'importRef').length,
    nextFree: plan.filter((p) => p.source === 'next').length,
    wouldSet: 0,
    set: 0,
    failed: 0,
    auditRows: 0,
    auditFailed: 0,
  };

  // The unique index must exist before writing, so a clash is refused.
  if (apply && plan.length) await InvestorIssue.init();

  for (const p of plan) {
    const label = `Issue ${p._id}${p.importRef ? ` (${p.importRef})` : ''}`;
    const how = p.source === 'importRef' ? 'from importRef' : `next free${p.note ? `; ${p.note}` : ''}`;
    if (!apply) {
      summary.wouldSet += 1;
      log(`  ${label}: would set ${p.reference} (${how})`);
      continue;
    }
    try {
      // The full stored issue, for the ChangeLog snapshot.
      // eslint-disable-next-line no-await-in-loop
      const before = await InvestorIssue.collection.findOne({ _id: p._id });
      // eslint-disable-next-line no-await-in-loop
      const res = await InvestorIssue.collection.updateOne(
        { _id: p._id, ...MISSING_REFERENCE },
        { $set: { reference: p.reference } },
      );
      if (res.modifiedCount === 1) {
        summary.set += 1;
        log(`  ${label}: set ${p.reference} (${how})`);
        // eslint-disable-next-line no-await-in-loop
        await auditMigrationRow({
          actor,
          entity: 'InvestorIssue',
          snapshot: before || { _id: p._id },
          changes: [{ field: 'reference', old: before ? before.reference : null, new: p.reference }],
          reason: REASON,
          batchId,
          label,
          log,
          summary,
        });
      } else {
        log(`  ${label}: unchanged (a reference was set since it was read)`);
      }
    } catch (err) {
      summary.failed += 1;
      log(`  ${label}: FAILED to set ${p.reference}${err && err.code === 11000 ? ' (already used)' : ''}`);
    }
  }

  log(`Issues: ${summary.total}; already have a reference: ${summary.alreadySet}; from importRef: ${summary.fromImportRef}; next free number: ${summary.nextFree}`);
  log(apply ? `Set: ${summary.set}; failed: ${summary.failed}; ChangeLog rows: ${summary.auditRows}${summary.auditFailed ? `; audit rows FAILED: ${summary.auditFailed}` : ''}` : `Would set: ${summary.wouldSet} (dry run)`);
  if (summary.failed) log(DEPLOY_NOTE);
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
    // Data changed but an audit row is missing: fail the run so it is noticed.
    if (summary.auditFailed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`migrate-issue-refs failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { migrate, planReferences };
