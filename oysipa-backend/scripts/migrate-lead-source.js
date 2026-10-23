#!/usr/bin/env node
// migrate-lead-source.js — story 11.5 back-fill (additive, idempotent).
//
// Investors: sets leadSource = "Unknown (pre-T11)" where missing, and
// organisationType = "Investor" where missing. Projects: sets currency = "NGN"
// where missing. Only missing values are set (the filter re-checks "missing",
// so a second run changes nothing); no value is guessed. updatedAt is left as
// it was (the back-fill is not an officer edit). Each changed record is logged
// by id.
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
//
// Usage (from oysipa-backend/):
//   npm run migrate:lead-source -- --uri-env MONGO_URI_TEST            # dry run
//   npm run migrate:lead-source -- --uri-env MONGO_URI_TEST --apply    # write
//   npm run migrate:lead-source -- --uri-env MONGO_URI_LIVE --allow-live [--apply]
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
const Investor = require('../src/models/InvestorModel');
const InvestmentProject = require('../src/models/InvestmentProject');
const { UNKNOWN_LEAD_SOURCE, DEFAULT_ORGANISATION_TYPE, DEFAULT_CURRENCY } = require('../src/constants/investorFields');
const { parseArgs, assertDbAllowed } = require('./migrate-interaction-investor');

const missing = (field) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }] });

const STEPS = [
  { model: Investor, label: 'Investor', field: 'leadSource', value: UNKNOWN_LEAD_SOURCE },
  { model: Investor, label: 'Investor', field: 'organisationType', value: DEFAULT_ORGANISATION_TYPE },
  { model: InvestmentProject, label: 'Project', field: 'currency', value: DEFAULT_CURRENCY },
];

// Runs on the current mongoose connection. Returns { [field]: { missing, changed, wouldChange } }.
const migrate = async ({ apply = false, allowLive = false, log = console.log } = {}) => {
  assertDbAllowed(mongoose.connection.name, allowLive);
  log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}`);
  const summary = {};
  for (const step of STEPS) {
    const { model, label, field, value } = step;
    // Raw collection reads: Mongoose would fill the schema default on hydrate.
    // eslint-disable-next-line no-await-in-loop
    const candidates = await model.collection.find(missing(field), { projection: { _id: 1 } }).sort({ _id: 1 }).toArray();
    const s = { missing: candidates.length, changed: 0, wouldChange: 0 };
    log(`${label}.${field}: ${candidates.length} missing -> "${value}"`);
    for (const rec of candidates) {
      if (!apply) {
        s.wouldChange += 1;
        log(`  ${label} ${rec._id}: would set ${field} = "${value}"`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await model.collection.updateOne({ _id: rec._id, ...missing(field) }, { $set: { [field]: value } });
      if (res.modifiedCount === 1) {
        s.changed += 1;
        log(`  ${label} ${rec._id}: set ${field} = "${value}"`);
      } else {
        log(`  ${label} ${rec._id}: unchanged (already set)`);
      }
    }
    log(apply ? `  Changed: ${s.changed}` : `  Would change: ${s.wouldChange} (changed: 0, dry run)`);
    summary[field] = s;
  }
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
    console.error(`migrate-lead-source failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { migrate, STEPS };
