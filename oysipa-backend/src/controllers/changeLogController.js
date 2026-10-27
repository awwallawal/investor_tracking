// Read-only ChangeLog viewer (story 11.10). DG / Portal-Admin only (route).
// There is no route to edit or delete a row: the ChangeLog is append-only.
//
// GET /api/changelog?entity=&action=&entityId=&by=&batchId=&from=&to=&page=
//   newest first (server createdAt), 50 per page → { rows, total, page, pageSize }.
//   from / to are calendar days (YYYY-MM-DD, Africa/Lagos), both inclusive.
// GET /api/changelog/health → audit write failures: the stored count (Setting
//   auditFailures) and the count since this server process started.
const mongoose = require('mongoose');
const ChangeLog = require('../models/ChangeLog');
const { getAuditHealth, getPersistedFailures } = require('../utils/auditPlugin');

const PAGE_SIZE = 50;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Storage internals of private documents (InteractionLog documents[]) never
// leave the API.
const INTERNAL_KEYS = ['provider', 'key', 'resourceType'];
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const MAX_BATCH_ID = 100;

// Start of a Lagos calendar day (UTC+1, no daylight saving) as an instant.
const lagosDayStart = (day) => {
  if (typeof day !== 'string' || !DAY_ONLY.test(day)) return null;
  const check = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== day) return null;
  return new Date(`${day}T00:00:00.000+01:00`);
};

// Only the entries of an InteractionLog's documents[] are stripped.
const stripDocuments = (value) => {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const copy = { ...entry };
    INTERNAL_KEYS.forEach((k) => { delete copy[k]; });
    return copy;
  });
};

const publicChange = (entity) => (c) => {
  const strip = entity === 'InteractionLog' && c.field === 'documents' ? stripDocuments : (v) => v;
  return { field: c.field, old: strip(c.old), new: strip(c.new) };
};

const publicRow = (row) => ({
  _id: row._id,
  createdAt: row.createdAt,
  by: row.by || null,
  byName: row.byName || null,
  role: row.role || null,
  entity: row.entity,
  entityId: row.entityId,
  action: row.action,
  reason: row.reason || null,
  batchId: row.batchId,
  changes: (row.changes || []).map(publicChange(row.entity)),
});

// The viewer's filters → { filter } or { error } (shared with the CSV export, story 11.15).
const changeLogFilter = (query = {}) => {
  const {
    entity, action, entityId, by, batchId, from, to,
  } = query;
  const filter = {};
  if (entity !== undefined && entity !== '') {
    if (typeof entity !== 'string' || !ChangeLog.ENTITIES.includes(entity)) return { error: 'Invalid entity.' };
    filter.entity = entity;
  }
  if (action !== undefined && action !== '') {
    if (typeof action !== 'string' || !ChangeLog.ACTIONS.includes(action)) return { error: 'Invalid action.' };
    filter.action = action;
  }
  if (entityId !== undefined && entityId !== '') {
    if (typeof entityId !== 'string' || !OBJECT_ID_RE.test(entityId)) return { error: 'Invalid record id.' };
    filter.entityId = new mongoose.Types.ObjectId(entityId);
  }
  if (by !== undefined && by !== '') {
    if (typeof by !== 'string' || !OBJECT_ID_RE.test(by)) return { error: 'Invalid user id.' };
    filter.by = new mongoose.Types.ObjectId(by);
  }
  if (batchId !== undefined && batchId !== '') {
    if (typeof batchId !== 'string' || batchId.length > MAX_BATCH_ID) return { error: 'Invalid batch id.' };
    filter.batchId = batchId;
  }
  const createdAt = {};
  if (from !== undefined && from !== '') {
    const start = lagosDayStart(from);
    if (!start) return { error: 'from must be a date (YYYY-MM-DD).' };
    createdAt.$gte = start;
  }
  if (to !== undefined && to !== '') {
    const start = lagosDayStart(to);
    if (!start) return { error: 'to must be a date (YYYY-MM-DD).' };
    createdAt.$lt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }
  if (createdAt.$gte && createdAt.$lt && createdAt.$gte >= createdAt.$lt) {
    return { error: 'from must not be after to.' };
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;
  return { filter };
};

const listChangeLog = async (req, res) => {
  try {
    const { page } = req.query || {};
    const built = changeLogFilter(req.query || {});
    if (built.error) return res.status(400).json({ message: built.error });
    const { filter } = built;

    let pageNo = 1;
    if (page !== undefined && page !== '') {
      pageNo = Number(page);
      if (typeof page !== 'string' || !Number.isInteger(pageNo) || pageNo < 1) return res.status(400).json({ message: 'Invalid page.' });
    }

    const [rows, total] = await Promise.all([
      ChangeLog.find(filter)
        .select('-snapshot')
        .sort({ createdAt: -1, _id: -1 })
        .skip((pageNo - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      ChangeLog.countDocuments(filter),
    ]);
    return res.json({
      rows: rows.map(publicRow), total, page: pageNo, pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

const changeLogHealth = async (req, res) => {
  const sinceRestart = getAuditHealth();
  let stored = null;
  try {
    stored = await getPersistedFailures();
  } catch (error) {
    console.error('[audit] could not read the stored failure count', error);
  }
  const failedWrites = Math.max(Number(stored && stored.count) || 0, sinceRestart.failedWrites);
  return res.json({
    ok: failedWrites === 0,
    failedWrites,
    lastFailureAt: (stored && stored.lastAt) || sinceRestart.lastFailureAt || null,
    lastError: (stored && stored.lastError) || null,
    sinceRestart: sinceRestart.failedWrites,
  });
};

module.exports = {
  listChangeLog, changeLogHealth, changeLogFilter, publicRow, PAGE_SIZE,
};
