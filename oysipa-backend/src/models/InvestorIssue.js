const mongoose = require('mongoose');
const auditPlugin = require('../utils/auditPlugin');
const {
  ISSUE_STATUSES, DEFAULT_ISSUE_STATUS, ISSUE_CATEGORIES, REPORTED_VIA,
} = require('../constants/issueFields');
const { MDA_CODES } = require('../constants/mdas');

// Investor issues register (story 11.7, SABER DLR 4.5). Field names are kept
// compatible with the parked v2 Grievance Redress epic so the data can migrate.
//
// Server-owned: reference, dateRegistered, resolvedDate, actions[].recordedBy/recordedAt,
// importRef, importBatchId, createdAt/updatedAt. Never taken from the client.
const IssueActionSchema = new mongoose.Schema({
  // Happened date of the action (officer-entered, never in the future).
  date: { type: Date, required: true },
  // Who took the action (free text, e.g. "OYSIPA desk", "Ministry of Lands").
  by: { type: String, trim: true },
  note: { type: String, required: true, trim: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordedAt: { type: Date, required: true },
});

const InvestorIssueSchema = new mongoose.Schema({
  investor: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentProject' },
  // Free-text project, for loaded issues (the loader never guesses a project).
  projectText: { type: String, trim: true },
  // Server time the issue was registered. Never editable.
  dateRegistered: { type: Date, required: true, immutable: true },
  // Happened date: when the investor reported it. Metrics count by this date.
  dateReported: { type: Date, required: true },
  reportedVia: {
    type: String,
    enum: { values: REPORTED_VIA, message: 'Invalid "reported via": {VALUE}' },
  },
  // MDA codes (constants/mdas.js); screens show the names.
  mdaResponsible: {
    type: [{ type: String, enum: { values: MDA_CODES, message: 'Invalid MDA: {VALUE}' } }],
    default: [],
  },
  category: {
    type: String,
    required: true,
    enum: { values: ISSUE_CATEGORIES, message: 'Invalid category: {VALUE}' },
  },
  description: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: { values: ISSUE_STATUSES, message: 'Invalid status: {VALUE}' },
    default: DEFAULT_ISSUE_STATUS,
  },
  actions: { type: [IssueActionSchema], default: [] },
  resolution: { type: String, trim: true },
  // Server time the issue was set to Resolved; cleared when it leaves Resolved.
  resolvedDate: { type: Date },
  // Readable number officers quote (story 11.7b): ISS- plus at least 2 digits
  // (ISS-09, ISS-100). Set by the server once (create, loader or the
  // migrate:issue-refs backfill) and never changed.
  reference: { type: String, trim: true, immutable: true },
  // Import stamps (loader). importRef is the file's id (e.g. ISS-05).
  importRef: { type: String, trim: true },
  importBatchId: { type: String },
  // The import file's own note on the issue (kept so nothing is lost).
  importNote: { type: String, trim: true },
}, {
  timestamps: true,
});

InvestorIssueSchema.index({ investor: 1 });
InvestorIssueSchema.index({ dateReported: 1 });
InvestorIssueSchema.index({ status: 1 });
InvestorIssueSchema.index({ importRef: 1 }, { unique: true, sparse: true });
InvestorIssueSchema.index({ reference: 1 }, { unique: true, sparse: true });

// Story 11.10: ChangeLog create/update rows with old/new values.
InvestorIssueSchema.plugin(auditPlugin, { entity: 'InvestorIssue' });

module.exports = mongoose.model('InvestorIssue', InvestorIssueSchema);
