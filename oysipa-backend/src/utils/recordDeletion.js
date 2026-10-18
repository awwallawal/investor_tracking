const crypto = require('crypto');
const ChangeLog = require('../models/ChangeLog');

// Build ChangeLog rows for documents about to be deleted. `req.user` is the DB
// user set by the auth middleware, so `role` is the stored role, not the token's.
const deletionRows = (req, entity, docs, { reason = null, batchId }) => docs.map((doc) => ({
  entity,
  entityId: doc._id,
  action: 'delete',
  by: req.user._id,
  byName: req.user.name,
  role: req.user.role,
  reason,
  snapshot: doc,
  batchId,
}));

const newBatchId = () => crypto.randomUUID();

// Writes the audit rows in one insertMany. Throws on failure: callers must not
// delete anything unless this resolves.
// `groups` is [[entity, docs], ...] so one cascade is a single insert.
const recordDeletionGroups = async (req, groups, { reason = null, batchId = newBatchId() } = {}) => {
  const rows = groups.flatMap(([entity, docs]) => deletionRows(req, entity, docs, { reason, batchId }));
  if (rows.length === 0) return [];
  return ChangeLog.insertMany(rows, { ordered: true });
};

const recordDeletions = (req, entity, docs, opts = {}) => recordDeletionGroups(req, [[entity, docs]], opts);

module.exports = { recordDeletions, recordDeletionGroups, newBatchId };
