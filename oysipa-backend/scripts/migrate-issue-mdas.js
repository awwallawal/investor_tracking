#!/usr/bin/env node
// migrate-issue-mdas.js — story 11.7c one-off (repeat-safe).
//
// Converts InvestorIssue.mdaResponsible from MDA names (the 11.7 list and the
// content studio's names) to MDA codes through resolveMda (src/constants/mdas.js).
// Only mdaResponsible is written; updatedAt is left as it was. An issue with any
// value that does not resolve is reported and left untouched. Codes already
// stored are kept, so a second run changes 0.
//
// Run this right after deploying 11.7c: until it runs, issues still holding MDA names cannot have their status changed.
//
// An issue with no MDA (missing, null or empty) is counted as "no MDA". A
// mdaResponsible that is not a list is reported as unresolved (untouched).
//
// Prints counts, issue ids / refs and the unresolved MDA values only: never
// investor names.
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
//
// Usage (from oysipa-backend/):
//   npm run migrate:issue-mdas -- --uri-env MONGO_URI                         # dry run
//   npm run migrate:issue-mdas -- --uri-env MONGO_URI --apply                 # write
//   npm run migrate:issue-mdas -- --uri-env MONGO_URI_LIVE --allow-live [--apply]
//
// --uri-env <NAME>  environment variable holding the MongoDB URI (default MONGO_URI).
//                   Values are loaded from oysipa-backend/.env if present; the URI
//                   itself is never printed.
// --apply           write the changes (otherwise dry run).
// --allow-live      required to run against the live database (named "test").
// Exit codes: 0 = done, 1 = error (bad args, missing env, connect failure,
// live database refused).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const InvestorIssue = require('../src/models/InvestorIssue');
const { MDA_CODES, resolveMda } = require('../src/constants/mdas');
const { parseArgs, assertDbAllowed } = require('./migrate-interaction-investor');

const DEPLOY_NOTE = 'Run this right after deploying 11.7c: until it runs, issues still holding MDA names cannot have their status changed.';

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// One issue's values → { codes } or { unresolved: [values] }. Exact codes are kept.
const convert = (values) => {
  const codes = [];
  const unresolved = [];
  let qualified = false;
  values.forEach((v) => {
    const got = typeof v === 'string' && MDA_CODES.includes(v) ? { codes: [v] } : resolveMda(v);
    if (got.error) {
      unresolved.push(v);
      return;
    }
    if (got.qualified) qualified = true;
    got.codes.forEach((c) => { if (!codes.includes(c)) codes.push(c); });
  });
  return unresolved.length ? { unresolved } : { codes, qualified };
};

// Runs on the current mongoose connection. Returns the summary counts.
const migrate = async ({ apply = false, allowLive = false, log = console.log } = {}) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  log(DEPLOY_NOTE);
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`);

  // Raw collection: the old names would fail the new enum on hydrate.
  const issues = await InvestorIssue.collection
    .find({}, { projection: { _id: 1, importRef: 1, mdaResponsible: 1 } })
    .sort({ _id: 1 })
    .toArray();

  const summary = {
    total: issues.length, noMda: 0, alreadyCodes: 0, wouldChange: 0, changed: 0, unresolvedIssues: 0, qualified: 0, unresolvedValues: [],
  };

  for (const issue of issues) {
    const label = `Issue ${issue._id}${issue.importRef ? ` (${issue.importRef})` : ''}`;
    const old = issue.mdaResponsible;
    if (old === undefined || old === null || (Array.isArray(old) && old.length === 0)) {
      summary.noMda += 1;
      continue;
    }
    const got = Array.isArray(old) ? convert(old) : { unresolved: [old] };
    if (got.unresolved) {
      summary.unresolvedIssues += 1;
      got.unresolved.forEach((v) => {
        const shown = JSON.stringify(v);
        if (!summary.unresolvedValues.includes(shown)) summary.unresolvedValues.push(shown);
      });
      log(`  ${label}: SKIP - unresolved ${got.unresolved.map((v) => JSON.stringify(v)).join(', ')}`);
      continue;
    }
    if (sameList(old, got.codes)) {
      summary.alreadyCodes += 1;
      continue;
    }
    if (got.qualified) summary.qualified += 1;
    if (!apply) {
      summary.wouldChange += 1;
      log(`  ${label}: would set ${got.codes.join(', ')}${got.qualified ? ' (qualifier dropped)' : ''}`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const res = await InvestorIssue.collection.updateOne(
      { _id: issue._id, mdaResponsible: old },
      { $set: { mdaResponsible: got.codes } },
    );
    if (res.modifiedCount === 1) {
      summary.changed += 1;
      log(`  ${label}: set ${got.codes.join(', ')}${got.qualified ? ' (qualifier dropped)' : ''}`);
    } else {
      log(`  ${label}: unchanged (changed since it was read)`);
    }
  }

  log(`Issues: ${summary.total}; no MDA: ${summary.noMda}; already codes: ${summary.alreadyCodes}; ${apply ? `changed: ${summary.changed}` : `would change: ${summary.wouldChange} (dry run)`}`);
  log(`Unresolved: ${summary.unresolvedIssues} issue(s)${summary.unresolvedValues.length ? ` - values ${summary.unresolvedValues.join(', ')}` : ''}`);
  if (summary.qualified) log(`Qualifier dropped on ${summary.qualified} issue(s)`);
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
    console.error(`migrate-issue-mdas failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { migrate, convert };
