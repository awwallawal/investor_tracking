// Audit plugin (story 11.10): writes a ChangeLog row with field-level old/new
// values for every create and update the app makes through Mongoose on the
// audited models (Investor, InvestmentProject, InteractionLog, InvestorIssue,
// InvestmentAnnouncement, Setting).
//
// Covered: doc.save() (create + update), Model.create, insertMany,
// findOneAndUpdate / findByIdAndUpdate, updateOne / updateMany (query).
// Refused (they throw): replaceOne, findOneAndReplace, bulkWrite, bulkSave.
// Not covered: deletes (the controllers write explicit delete rows first) and
// raw driver calls (Model.collection.*): migrations write their rows themselves.
//
// Old/new values are best-effort: the old values are read just before the
// write and the new ones just after it, so when two users write the same record
// at the same moment a row can show the other user's change as well.
//
// The actor, batchId, reason and suppressed actions come from the request
// context (utils/auditContext.js; one batchId per request). With no actor the
// row is still written, as "system (no user context)", and a warning is logged.
//
// If the audit insert fails the data change stands: the failure is logged with
// console.error('[audit] ChangeLog write failed', ...), counted in memory and
// (best effort) in the Setting `auditFailures`, served at
// GET /api/changelog/health. It is never dropped silently.
const crypto = require('crypto');
const mongoose = require('mongoose');
const ChangeLog = require('../models/ChangeLog');
const { getContext } = require('./auditContext');

// Paths never compared: server bookkeeping.
const IGNORED_PATHS = new Set(['_id', 'createdAt', 'updatedAt', '__v']);
const FAILURES_KEY = 'auditFailures';
const NOT_AUDITED_MSG = 'not audited: use save/updateOne/updateMany/findOneAndUpdate';

const health = { failedWrites: 0, lastFailureAt: null };
// Warn on a write with no user context. Off under jest (the test seed creates
// records directly); tests can switch it on.
const options = { warnNoActor: process.env.NODE_ENV !== 'test' };

const getAuditHealth = () => ({ ...health });
const resetAuditHealth = () => { health.failedWrites = 0; health.lastFailureAt = null; };

// Raw collection (no audit hooks, no model load-order dependency).
const settingsCollection = () => mongoose.connection.collection('settings');

// Persisted failure count: { count, lastAt, lastError } or null. Best effort.
const getPersistedFailures = async () => {
  const doc = await settingsCollection().findOne({ key: FAILURES_KEY });
  return doc && doc.value ? doc.value : null;
};

// Logs every failed row, counts it in memory and (best effort) in the Setting
// `auditFailures`. Never throws.
const recordFailure = async (rows, error) => {
  const list = rows.length ? rows : [{}];
  list.forEach((row) => {
    console.error('[audit] ChangeLog write failed', {
      entity: row.entity, entityId: row.entityId, action: row.action, error,
    });
  });
  const now = new Date();
  health.failedWrites += list.length;
  health.lastFailureAt = now;
  try {
    await settingsCollection().updateOne(
      { key: FAILURES_KEY },
      {
        $inc: { 'value.count': list.length },
        $set: { 'value.lastAt': now, 'value.lastError': String((error && error.message) || error).slice(0, 500), updatedAt: now },
      },
      { upsert: true },
    );
  } catch (persistError) {
    console.error('[audit] could not persist the failure count', persistError);
  }
};

const isSuppressed = (action) => {
  const ctx = getContext();
  return !!(ctx && Array.isArray(ctx.suppress) && ctx.suppress.includes(action));
};

const toPlain = (doc) => {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') return doc.toObject({ depopulate: true, virtuals: false, getters: false });
  return doc;
};

// Comparable form: null and undefined are the same; ObjectIds and dates as
// their JSON; object keys sorted (key order never counts as a change); arrays
// keep their order.
const sortKeys = (x) => {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') {
    return Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {});
  }
  return x;
};
const comparable = (v) => (v === undefined || v === null ? 'null' : JSON.stringify(sortKeys(JSON.parse(JSON.stringify(v)))));

// Top-level changed paths between two plain documents.
const diffDocs = (before, after) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  keys.forEach((field) => {
    if (IGNORED_PATHS.has(field)) return;
    const oldValue = before ? before[field] : undefined;
    const newValue = after ? after[field] : undefined;
    if (comparable(oldValue) !== comparable(newValue)) {
      changes.push({
        field,
        old: oldValue === undefined ? null : oldValue,
        new: newValue === undefined ? null : newValue,
      });
    }
  });
  return changes;
};

// Top-level paths an update touches (e.g. 'links.$[l].investor' → 'links');
// null when they cannot be known (a pipeline update).
const touchedPaths = (update) => {
  if (!update || Array.isArray(update)) return null;
  const paths = new Set();
  Object.entries(update).forEach(([k, v]) => {
    if (k.startsWith('$')) {
      if (v && typeof v === 'object') Object.keys(v).forEach((p) => paths.add(p.split('.')[0]));
    } else {
      paths.add(k.split('.')[0]);
    }
  });
  paths.delete('_id');
  return [...paths];
};

const actorFields = (entity, entityId, action) => {
  const ctx = getContext();
  const user = ctx && ctx.actor;
  if (user && user._id) return { by: user._id, byName: user.name, role: user.role };
  if (options.warnNoActor) {
    console.warn('[audit] write with no user context', { entity, entityId, action });
  }
  return { by: null, byName: ChangeLog.SYSTEM_ACTOR_NAME, role: null };
};

const buildRow = (entity, action, snapshot, changes, batchId) => {
  const ctx = getContext();
  return {
    entity,
    entityId: snapshot._id,
    action,
    ...actorFields(entity, snapshot._id, action),
    reason: (ctx && ctx.reason) || null,
    snapshot,
    ...(changes && { changes }),
    batchId,
  };
};

const batchFor = () => {
  const ctx = getContext();
  return (ctx && ctx.batchId) || crypto.randomUUID();
};

// Never throws: a failure is logged and counted.
const writeRows = async (rows) => {
  if (!rows.length) return;
  try {
    await ChangeLog.insertMany(rows, { ordered: true });
  } catch (error) {
    await recordFailure(rows, error);
  }
};

const createRows = (entity, docs) => {
  const batchId = batchFor();
  return docs.filter(Boolean).map((d) => buildRow(entity, 'create', toPlain(d), null, batchId));
};

// [{ before, after }] → update rows for the documents that changed.
const updateRows = (entity, pairs) => {
  const batchId = batchFor();
  return pairs.flatMap(({ before, after }) => {
    if (!before || !after) return [];
    const changes = diffDocs(before, after);
    return changes.length ? [buildRow(entity, 'update', before, changes, batchId)] : [];
  });
};

// Runs a post hook; a failure is recorded with the real action and the record
// id (or the query filter). `describe` is called with the hook's this/args.
const safely = (entity, describe, fn) => async function auditHook(...args) {
  try {
    await fn.apply(this, args);
  } catch (error) {
    let info = {};
    try { info = describe.apply(this, args) || {}; } catch (e) { info = {}; }
    await recordFailure([{ entity, entityId: info.entityId, action: info.action }], error);
  }
};

const resultDoc = (res) => {
  if (!res) return null;
  if (res._id) return res;
  // includeResultMetadata / rawResult: { value, ok, lastErrorObject }
  if (res.value && res.value._id) return res.value;
  return null;
};

function describeQuery() {
  return { action: 'update', entityId: this.getFilter() };
}

module.exports = function auditPlugin(schema, { entity } = {}) {
  if (!entity || !ChangeLog.ENTITIES.includes(entity)) {
    throw new Error(`auditPlugin needs a ChangeLog entity, got ${entity}`);
  }
  const refuse = (op) => () => { throw new Error(`${entity}.${op} is ${NOT_AUDITED_MSG}`); };

  // ---- unaudited write paths are refused ----
  ['replaceOne', 'findOneAndReplace'].forEach((op) => schema.pre(op, { document: false, query: true }, refuse(op)));
  schema.pre('bulkWrite', refuse('bulkWrite'));
  schema.statics.bulkSave = async function refusedBulkSave() { refuse('bulkSave')(); };

  // ---- doc.save() / Model.create ----
  schema.pre('save', async function auditPreSave() {
    this.$locals.auditIsNew = this.isNew;
    this.$locals.auditBefore = undefined;
    this.$locals.auditPreError = undefined;
    if (this.isNew || isSuppressed('update')) return;
    try {
      // The stored state, re-read so the old values are what the database held.
      this.$locals.auditBefore = await this.constructor.findById(this._id).lean();
    } catch (error) {
      this.$locals.auditPreError = error;
    }
  });

  const describeSave = (doc) => ({ action: doc && doc.$locals && doc.$locals.auditIsNew ? 'create' : 'update', entityId: doc && doc._id });
  schema.post('save', safely(entity, describeSave, async function auditPostSave(doc) {
    const locals = doc.$locals || {};
    const { auditIsNew, auditBefore, auditPreError } = locals;
    locals.auditBefore = undefined;
    if (auditIsNew) {
      if (isSuppressed('create')) return;
      await writeRows(createRows(entity, [doc]));
      return;
    }
    if (isSuppressed('update')) return;
    if (auditPreError) throw auditPreError;
    if (!auditBefore) throw new Error('The stored document was not found before the save; old values unknown.');
    const after = await doc.constructor.findById(doc._id).lean();
    await writeRows(updateRows(entity, [{ before: auditBefore, after }]));
  }));

  // ---- Model.insertMany ----
  const describeInsert = (docs) => ({ action: 'create', entityId: (Array.isArray(docs) ? docs : [docs]).map((d) => d && d._id) });
  schema.post('insertMany', safely(entity, describeInsert, async function auditPostInsertMany(docs) {
    if (isSuppressed('create')) return;
    await writeRows(createRows(entity, Array.isArray(docs) ? docs : [docs]));
  }));

  // ---- findOneAndUpdate / findByIdAndUpdate ----
  schema.pre('findOneAndUpdate', async function auditPreFindOneAndUpdate() {
    this._auditBefore = undefined;
    this._auditPreError = undefined;
    if (isSuppressed('update') && isSuppressed('create')) return;
    try {
      const q = this.model.findOne(this.getFilter());
      const { sort } = this.getOptions() || {};
      if (sort) q.sort(sort);
      this._auditBefore = (await q.lean()) || null;
    } catch (error) {
      this._auditPreError = error;
    }
  });

  schema.post('findOneAndUpdate', safely(entity, describeQuery, async function auditPostFindOneAndUpdate(res) {
    if (this._auditPreError) throw this._auditPreError;
    const before = this._auditBefore;
    const doc = resultDoc(res);
    let after = null;
    const id = (before && before._id) || (doc && doc._id);
    if (id) {
      after = await this.model.findById(id).lean();
    } else if ((this.getOptions() || {}).upsert) {
      // Upsert with new:false returns null: find what it inserted.
      after = await this.model.findOne(this.getFilter()).lean();
    }
    if (!after) return;
    if (!before) {
      // Upsert inserted it.
      if (!isSuppressed('create')) await writeRows(createRows(entity, [after]));
      return;
    }
    if (!isSuppressed('update')) await writeRows(updateRows(entity, [{ before, after }]));
  }));

  // ---- updateOne / updateMany (query) ----
  const queryOnly = { document: false, query: true };
  schema.pre(['updateOne', 'updateMany'], queryOnly, async function auditPreUpdate() {
    this._auditBefore = undefined;
    this._auditPreError = undefined;
    this._auditProjection = undefined;
    if (isSuppressed('update') && isSuppressed('create')) return;
    try {
      const q = this.model.find(this.getFilter());
      if (this.op === 'updateOne') {
        const { sort } = this.getOptions() || {};
        if (sort) q.sort(sort);
        q.limit(1);
      } else {
        // updateMany: _id plus the top-level paths the update touches.
        const paths = touchedPaths(this.getUpdate());
        if (paths) {
          this._auditProjection = paths.reduce((p, k) => ({ ...p, [k]: 1 }), { _id: 1 });
          q.select(this._auditProjection);
        }
      }
      this._auditBefore = await q.lean();
    } catch (error) {
      this._auditPreError = error;
    }
  });

  schema.post(['updateOne', 'updateMany'], queryOnly, safely(entity, describeQuery, async function auditPostUpdate(result) {
    if (this._auditPreError) throw this._auditPreError;
    const before = this._auditBefore || [];
    const rows = [];
    if (before.length && !isSuppressed('update')) {
      const q = this.model.find({ _id: { $in: before.map((d) => d._id) } });
      if (this._auditProjection) q.select(this._auditProjection);
      const afterDocs = await q.lean();
      const byId = new Map(afterDocs.map((d) => [String(d._id), d]));
      rows.push(...updateRows(entity, before.map((b) => ({ before: b, after: byId.get(String(b._id)) }))));
    }
    const upsertedId = result && result.upsertedId;
    if (upsertedId && !isSuppressed('create')) {
      const created = await this.model.findById(upsertedId).lean();
      rows.push(...createRows(entity, [created]));
    }
    await writeRows(rows);
  }));
};

module.exports.diffDocs = diffDocs;
module.exports.touchedPaths = touchedPaths;
module.exports.getAuditHealth = getAuditHealth;
module.exports.resetAuditHealth = resetAuditHealth;
module.exports.getPersistedFailures = getPersistedFailures;
module.exports.recordFailure = recordFailure;
module.exports.options = options;
module.exports.IGNORED_PATHS = IGNORED_PATHS;
module.exports.FAILURES_KEY = FAILURES_KEY;
module.exports.NOT_AUDITED_MSG = NOT_AUDITED_MSG;
