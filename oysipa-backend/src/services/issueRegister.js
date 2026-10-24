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

// The issue's own subfolder: investor-issues/<importRef or id>.
const issueRef = (issue) => {
  const ref = issue.importRef && /^[A-Za-z0-9_-]{1,60}$/.test(issue.importRef) ? issue.importRef : null;
  return ref || String(issue._id);
};
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
  const sub = await findOrCreateFolder({
    key: issueFolderKey(issue),
    name: issue.importRef ? `Issue ${issue.importRef}` : `Issue ${String(issue._id).slice(-6)}`,
    description: `Files of investor issue ${issueRef(issue)}${issue.category ? ` (${issue.category})` : ''}.`,
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
  issueRef,
  issueFolderKey,
  ensureIssueFolder,
  parseYear,
  yearRange,
  issuesMetric,
};
