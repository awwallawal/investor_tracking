// Shared helpers for the investor issues register (story 11.7): the issue's
// Evidence library folder, the year filter and the resolved-share metric.
// Used by issueController, adminController and the import loader.
const mongoose = require('mongoose');
const EvidenceFolder = require('../models/EvidenceFolder');
const InvestorIssue = require('../models/InvestorIssue');
const { recordChanges } = require('../utils/recordDeletion');
const { topOrder } = require('./evidenceLibrary');
const { RESOLVED, WITHDRAWN, shareBand } = require('../constants/issueFields');

const ISSUES_TOP_KEY = 'investor-issues';
const ISSUES_TOP_NAME = 'Investor issues';
const ISSUES_TOP_DESCRIPTION = 'Files of investor issues (DLR 4.5), one subfolder per issue.';

// Readable issue reference (story 11.7b): ISS- plus a number padded to at least
// 2 digits. Server-owned; set once, never changed.
// ISS-5, ISS-05 and ISS-005 are the same number: references are always stored
// in the canonical form (canonicalReference). Number 0 is refused.
const REFERENCE_RE = /^ISS-(\d+)$/;
const formatReference = (n) => `ISS-${String(n).padStart(2, '0')}`;
// The number of an ISS-NN string; 0 when it is not one (or is ISS-0).
const referenceNumber = (s) => {
  const m = typeof s === 'string' ? REFERENCE_RE.exec(s) : null;
  const n = m ? Number(m[1]) : 0;
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
const isReference = (s) => referenceNumber(s) > 0;
// 'ISS-5' → 'ISS-05'; null when not a valid reference.
const canonicalReference = (s) => (isReference(s) ? formatReference(referenceNumber(s)) : null);

// The next number after the highest ISS-NN in use. Format importRefs count too,
// so an app issue never takes the number of a loaded issue that is not yet
// backfilled (migrate:issue-refs).
const nextReference = async () => {
  const rows = await InvestorIssue.collection.find(
    { $or: [{ reference: { $regex: REFERENCE_RE.source } }, { importRef: { $regex: REFERENCE_RE.source } }] },
    { projection: { reference: 1, importRef: 1 } },
  ).toArray();
  const max = rows.reduce((n, r) => Math.max(n, referenceNumber(r.reference), referenceNumber(r.importRef)), 0);
  return formatReference(max + 1);
};

const isReferenceDuplicate = (err) => !!(err && err.code === 11000
  && ((err.keyPattern && 'reference' in err.keyPattern) || (err.keyValue && 'reference' in err.keyValue)));

// Thrown when every retry hit a taken number.
const REFERENCE_EXHAUSTED = 'REFERENCE_EXHAUSTED';

// Creates an issue with the next free reference. Two creates at once can pick
// the same number: the unique index refuses the second, which recomputes and
// retries (up to `attempts` times). `doc.reference` is set on the doc passed in.
const createWithReference = async (doc, { attempts = 5 } = {}) => {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    doc.reference = await nextReference();
    try {
      // eslint-disable-next-line no-await-in-loop
      return await InvestorIssue.create(doc);
    } catch (err) {
      if (!isReferenceDuplicate(err)) throw err;
      lastError = err;
    }
  }
  const exhausted = new Error(`Could not assign an issue number after ${attempts} tries`);
  exhausted.code = REFERENCE_EXHAUSTED;
  exhausted.cause = lastError;
  throw exhausted;
};

// The issue's own subfolder: investor-issues/<reference or importRef or id>.
const SAFE_REF = /^[A-Za-z0-9_-]{1,60}$/;
const refCandidates = (issue) => [issue.reference, issue.importRef]
  .filter((r) => typeof r === 'string' && SAFE_REF.test(r));
const issueRef = (issue) => refCandidates(issue)[0] || String(issue._id);
const issueFolderKey = (issue) => `${ISSUES_TOP_KEY}/${issueRef(issue)}`;

// Find or create one folder by key. A folder created here can be audited
// (`audit` = { actor, batchId }: the loader records 'import' rows).
const findOrCreateFolder = async (spec, audit) => {
  const found = await EvidenceFolder.findOne({ key: spec.key }).select('_id key').lean();
  if (found) return { folder: found, created: false };
  const doc = { _id: new mongoose.Types.ObjectId(), ...spec };
  try {
    await EvidenceFolder.create(doc);
  } catch (err) {
    if (!(err && err.code === 11000)) throw err;
    // Created by another request meanwhile: use it.
    const again = await EvidenceFolder.findOne({ key: spec.key }).select('_id key').lean();
    if (!again) throw err;
    return { folder: again, created: false };
  }
  if (audit) {
    try {
      await recordChanges(audit.actor, 'import', [['EvidenceFolder', [doc]]], { batchId: audit.batchId });
    } catch (auditError) {
      await EvidenceFolder.deleteOne({ _id: doc._id });
      throw auditError;
    }
  }
  return { folder: doc, created: true };
};

// The issue's subfolder (and the top folder), created when missing.
// Returns { folder, created: <number of folders created> }.
const ensureIssueFolder = async (issue, audit) => {
  const top = await findOrCreateFolder({
    key: ISSUES_TOP_KEY,
    name: ISSUES_TOP_NAME,
    description: ISSUES_TOP_DESCRIPTION,
    parent: null,
    order: topOrder(ISSUES_TOP_KEY),
  }, audit);
  // A folder made before the issue had its reference (keyed by importRef or
  // id) is kept and used: existing folders are never renamed.
  const keys = [...new Set([...refCandidates(issue), String(issue._id)].map((r) => `${ISSUES_TOP_KEY}/${r}`))];
  const existing = await EvidenceFolder.find({ key: { $in: keys } }).select('_id key').lean();
  const found = keys.map((k) => existing.find((f) => f.key === k)).find(Boolean);
  const ref = issueRef(issue);
  const sub = found ? { folder: found, created: false } : await findOrCreateFolder({
    key: keys[0],
    name: refCandidates(issue).length ? `Issue ${ref}` : `Issue ${String(issue._id).slice(-6)}`,
    description: `Files of investor issue ${ref}${issue.category ? ` (${issue.category})` : ''}.`,
    ...(issue.dateReported && { folderDate: issue.dateReported }),
    parent: top.folder._id,
    order: 0,
  }, audit);
  return { folder: sub.folder, created: (top.created ? 1 : 0) + (sub.created ? 1 : 0) };
};

// dateReported is stored as the Lagos calendar day at 00:00Z, so a year is the
// UTC range [Y-01-01, Y+1-01-01). Returns null for a bad year.
const parseYear = (raw) => {
  if (typeof raw === 'number') raw = String(raw);
  if (typeof raw !== 'string' || !/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  if (y < 1990 || y > 2100) return null;
  return y;
};
const yearRange = (y) => ({
  $gte: new Date(`${y}-01-01T00:00:00.000Z`),
  $lt: new Date(`${y + 1}-01-01T00:00:00.000Z`),
});

// Resolved share for year Y (DLR 4.5): Resolved ÷ issues reported in Y by
// dateReported, Withdrawn left out. Never counted by createdAt.
const issuesMetric = async (year) => {
  const rows = await InvestorIssue.aggregate([
    { $match: { dateReported: yearRange(year) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const by = new Map(rows.map((r) => [r._id, r.count]));
  const all = rows.reduce((n, r) => n + r.count, 0);
  const withdrawn = by.get(WITHDRAWN) || 0;
  const resolved = by.get(RESOLVED) || 0;
  const total = all - withdrawn;
  const share = total > 0 ? resolved / total : null;
  return {
    year, total, resolved, withdrawn, share, band: shareBand(share),
  };
};

module.exports = {
  ISSUES_TOP_KEY,
  ISSUES_TOP_NAME,
  REFERENCE_RE,
  isReference,
  formatReference,
  referenceNumber,
  canonicalReference,
  REFERENCE_EXHAUSTED,
  nextReference,
  isReferenceDuplicate,
  createWithReference,
  issueRef,
  issueFolderKey,
  findOrCreateFolder,
  ensureIssueFolder,
  parseYear,
  yearRange,
  issuesMetric,
};
