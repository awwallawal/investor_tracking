#!/usr/bin/env node
// check-orphan-projects.js — READ-ONLY pre-deploy check.
//
// Counts investment projects whose investor reference is missing (no investor
// field, or it points to an investor that does not exist). Prints only counts
// and project ids. It never writes, updates or deletes anything.
//
// Usage (from the repo root or oysipa-backend/):
//   node oysipa-backend/scripts/check-orphan-projects.js                       # uses MONGO_URI
//   node oysipa-backend/scripts/check-orphan-projects.js --uri-env MONGO_URI_TEST
//
// --uri-env <NAME>  name of the environment variable holding the MongoDB URI
//                   (default MONGO_URI). Values are loaded from oysipa-backend/.env
//                   if present; the URI itself is never printed.
// Exit codes: 0 = no orphans, 2 = orphans found, 1 = error (bad args, missing env, connect failure).
// Also available as: cd oysipa-backend && npm run check:orphans -- --uri-env <NAME>

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const Investor = require('../src/models/InvestorModel');
const InvestmentProject = require('../src/models/InvestmentProject');

const parseArgs = (argv) => {
  let uriEnv = 'MONGO_URI';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--uri-env') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('--uri-env needs a variable name');
      uriEnv = next;
      i += 1;
    } else if (argv[i].startsWith('--uri-env=')) {
      uriEnv = argv[i].slice('--uri-env='.length);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!uriEnv) throw new Error('--uri-env needs a variable name');
  return { uriEnv };
};

const main = async () => {
  const { uriEnv } = parseArgs(process.argv.slice(2));
  const uri = process.env[uriEnv];
  if (!uri) throw new Error(`Environment variable ${uriEnv} is not set`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    console.log(`Database: ${mongoose.connection.name} (from ${uriEnv})`);

    // Aggregation with $lookup is read-only (no $out / $merge).
    const orphans = await InvestmentProject.aggregate([
      { $lookup: { from: Investor.collection.name, localField: 'investor', foreignField: '_id', as: 'inv' } },
      { $match: { inv: { $size: 0 } } },
      { $project: { _id: 1 } },
    ]);
    const total = await InvestmentProject.countDocuments();

    console.log(`Projects total: ${total}`);
    console.log(`Orphan projects (investor missing): ${orphans.length}`);
    orphans.forEach((p) => console.log(`  ${p._id}`));
    if (orphans.length > 0) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(`check-orphan-projects failed: ${err.message}`);
  process.exit(1);
});
