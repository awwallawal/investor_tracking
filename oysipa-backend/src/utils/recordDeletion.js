const crypto = require('crypto');
const ChangeLog = require('../models/ChangeLog');

// `actor` is either the request (req.user is the DB user set by the auth
// middleware, so `role` is the stored role, not the token's) or a User document
// (e.g. the import CLI).
const actorUser = (actor) => (actor && actor.user ? actor.user : actor);

// Build ChangeLog rows for documents changed by `action`, with their snapshot.
const changeRows = (actor, action, entity, docs, { reason = null, batchId }) => {
  const user = actorUser(actor);
  return docs.map((doc) => ({
    entity,
    entityId: doc._id,
    action,
    by: user._id,
    byName: user.name,
    role: user.role,
    reason,
    snapshot: doc,
    batchId,
  }));
};

// Rows for documents about to be deleted.
const deletionRows = (req, entity, docs, opts) => changeRows(req, 'delete', entity, docs, opts);

const newBatchId = () => crypto.randomUUID();

// Writes audit rows for any action in one insertMany. Throws on failure.
// `groups` is [[entity, docs], ...].
const recordChanges = async (actor, action, groups, { reason = null, batchId = newBatchId() } = {}) => {
  const rows = groups.flatMap(([entity, docs]) => changeRows(actor, action, entity, docs, { reason, batchId }));
  if (rows.length === 0) return [];
  return ChangeLog.insertMany(rows, { ordered: true });
};

// Writes the audit rows in one insertMany. Throws on failure: callers must not
// delete anything unless this resolves.
// `groups` is [[entity, docs], ...] so one cascade is a single insert.
const recordDeletionGroups = (req, groups, opts = {}) => recordChanges(req, 'delete', groups, opts);

const recordDeletions = (req, entity, docs, opts = {}) => recordDeletionGroups(req, [[entity, docs]], opts);

// Rows of several actions in ONE insertMany, so either all are written or none.
// `groups` is [[action, entity, docs], ...]. Throws on failure.
const recordActionGroups = async (actor, groups, { reason = null, batchId = newBatchId() } = {}) => {
  const rows = groups.flatMap(([action, entity, docs]) => changeRows(actor, action, entity, docs, { reason, batchId }));
  if (rows.length === 0) return [];
  return ChangeLog.insertMany(rows, { ordered: true });
};

module.exports = {
  recordActionGroups, changeRows,
  recordDeletions, recordDeletionGroups, recordChanges, newBatchId, deletionRows,
};
