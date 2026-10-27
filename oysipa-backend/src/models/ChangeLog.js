const mongoose = require('mongoose');

// Append-only audit trail (first slice of story 11.10). Rows are only ever
// inserted; the hooks below refuse the Mongoose model/query/document update and
// delete paths (and bulkWrite ops other than insertOne). Raw driver calls
// (ChangeLog.collection.*) are NOT covered. There is no API to change it either.
const ENTITIES = ['Investor', 'InvestmentProject', 'InteractionLog', 'EvidenceFolder', 'EvidenceFile', 'InvestorIssue', 'InvestmentAnnouncement', 'Setting', 'LifecycleStatus', 'ChangeLog'];
// 'ChangeLog' (story 11.15): only for `export` rows of the change log viewer.
// upload: a file added in the Evidence library screen; link/unlink: a library
// file linked to (or unlinked from) an investor / interaction.
// create/update (story 11.10): written by the audit plugin (utils/auditPlugin.js)
// and by migrations, with field-level `changes`.
// export (story 11.15): a CSV export of a list view (snapshot: list, filters, rowCount).
const ACTIONS = ['delete', 'import', 'upload', 'link', 'unlink', 'create', 'update', 'export'];

// byName of a row written with no user in the request context (e.g. a write
// from a script that did not call runAs). Only these rows may have a null `by`.
const SYSTEM_ACTOR_NAME = 'system (no user context)';

const ChangeSchema = new mongoose.Schema({
  field: { type: String, required: true },
  old: { type: mongoose.Schema.Types.Mixed, default: null },
  new: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false, minimize: false });

const ChangeLogSchema = new mongoose.Schema({
  entity: { type: String, enum: ENTITIES, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, enum: ACTIONS, required: true },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [function byRequired() { return this.byName !== SYSTEM_ACTOR_NAME; }, 'by is required'],
  },
  byName: { type: String },
  role: { type: String },
  reason: { type: String, default: null },
  // The full document as it was just before the change (create rows: the new
  // document).
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  // Field-level old/new values (update rows; top-level paths).
  changes: { type: [ChangeSchema], default: undefined },
  // Shared by every row written for one request (e.g. one investor cascade).
  batchId: { type: String, required: true },
}, {
  timestamps: true, // server createdAt (evidence) — never taken from the client
  minimize: false,
});

ChangeLogSchema.index({ entity: 1, entityId: 1 });
// The viewer lists newest first, optionally by entity / action.
ChangeLogSchema.index({ createdAt: -1 });
ChangeLogSchema.index({ entity: 1, createdAt: -1 });
ChangeLogSchema.index({ action: 1, createdAt: -1 });

const APPEND_ONLY_MSG = 'ChangeLog is append-only: rows cannot be updated or deleted.';
const refuse = () => { throw new Error(APPEND_ONLY_MSG); };

const QUERY_WRITES = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
];
QUERY_WRITES.forEach((op) => ChangeLogSchema.pre(op, { query: true, document: false }, refuse));
// doc.deleteOne() / doc.updateOne()
ChangeLogSchema.pre('deleteOne', { document: true, query: false }, refuse);
ChangeLogSchema.pre('updateOne', { document: true, query: false }, refuse);
// Model.bulkWrite: only insertOne ops are allowed.
ChangeLogSchema.pre('bulkWrite', function refuseBulkChanges(next, ops) {
  if ((ops || []).some((op) => Object.keys(op || {}).some((k) => k !== 'insertOne'))) refuse();
  next();
});
// doc.save() on an existing row
ChangeLogSchema.pre('save', function refuseResave() {
  if (!this.isNew) refuse();
});

const ChangeLog = mongoose.model('ChangeLog', ChangeLogSchema);
ChangeLog.APPEND_ONLY_MSG = APPEND_ONLY_MSG;
ChangeLog.ENTITIES = ENTITIES;
ChangeLog.ACTIONS = ACTIONS;
ChangeLog.SYSTEM_ACTOR_NAME = SYSTEM_ACTOR_NAME;

module.exports = ChangeLog;
