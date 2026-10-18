const mongoose = require('mongoose');

// Append-only audit trail (first slice of story 11.10). Rows are only ever
// inserted; the hooks below refuse the Mongoose model/query/document update and
// delete paths (and bulkWrite ops other than insertOne). Raw driver calls
// (ChangeLog.collection.*) are NOT covered. There is no API to change it either.
const ENTITIES = ['Investor', 'InvestmentProject', 'InteractionLog'];
const ACTIONS = ['delete'];

const ChangeLogSchema = new mongoose.Schema({
  entity: { type: String, enum: ENTITIES, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, enum: ACTIONS, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  byName: { type: String },
  role: { type: String },
  reason: { type: String, default: null },
  // The full document as it was just before the change.
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  // Shared by every row written for one request (e.g. one investor cascade).
  batchId: { type: String, required: true },
}, {
  timestamps: true, // server createdAt (evidence) — never taken from the client
  minimize: false,
});

ChangeLogSchema.index({ entity: 1, entityId: 1 });

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

module.exports = ChangeLog;
