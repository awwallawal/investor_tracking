const mongoose = require('mongoose');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestmentProject = require('../models/InvestmentProject');
const { recordDeletions } = require('../utils/recordDeletion');

// Create and update rows are written by the audit plugin on the model; the
// delete writes its own ChangeLog row first (like the other deletes).
const DUPLICATE_MSG = 'A status with this name already exists.';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Another status with this name, ignoring case (the unique index is
// case-sensitive, so this check is what stops "planning" next to "Planning").
const nameTaken = (name, exceptId) => LifecycleStatus.exists({
  name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  ...(exceptId && { _id: { $ne: exceptId } }),
});

const isDuplicateKey = (err) => err && err.code === 11000;

// Returns the trimmed name, or null when it is not a non-blank string.
const cleanName = (name) => (typeof name === 'string' && name.trim() ? name.trim() : null);

const serverError = (res, err) => {
  console.error(err);
  return res.status(500).json({ message: 'Server Error' });
};

// @desc    Get all lifecycle statuses
// @route   GET /api/lifecycle-statuses
// @access  Public
const getAllLifecycleStatuses = async (req, res) => {
  try {
    const statuses = await LifecycleStatus.find().sort('order');
    res.json(statuses);
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Create a lifecycle status (order = highest + 1; body order ignored)
// @route   POST /api/lifecycle-statuses
// @access  Private (DG / Portal-Admin)
const createLifecycleStatus = async (req, res) => {
  const { description } = req.body || {};
  const name = cleanName((req.body || {}).name);
  if (!name) return res.status(400).json({ message: 'Name is required.' });
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ message: 'Description must be text.' });
  }

  try {
    if (await nameTaken(name)) return res.status(409).json({ message: DUPLICATE_MSG });

    const lastStatus = await LifecycleStatus.findOne().sort({ order: -1 });
    const newOrder = lastStatus ? lastStatus.order + 1 : 1;

    const status = await new LifecycleStatus({
      name,
      ...(typeof description === 'string' && { description }),
      order: newOrder,
    }).save();
    return res.status(201).json(status);
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ message: DUPLICATE_MSG });
    return serverError(res, err);
  }
};

// @desc    Update a lifecycle status (name, description). Order changes only
//          through reorder; an order in the body is ignored.
// @route   PUT /api/lifecycle-statuses/:id
// @access  Private (DG / Portal-Admin)
const updateLifecycleStatus = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid status id.' });
  const body = req.body || {};

  const fields = {};
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    fields.name = name;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return res.status(400).json({ message: 'Description must be text.' });
    }
    fields.description = body.description || '';
  }

  try {
    const status = await LifecycleStatus.findById(id);
    if (!status) return res.status(404).json({ message: 'Lifecycle status not found.' });

    if (fields.name && await nameTaken(fields.name, status._id)) {
      return res.status(409).json({ message: DUPLICATE_MSG });
    }

    status.set(fields);
    await status.save();
    return res.json(status);
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ message: DUPLICATE_MSG });
    return serverError(res, err);
  }
};

// @desc    Delete a lifecycle status no project uses. ChangeLog delete row
//          first; if that write fails nothing is deleted.
// @route   DELETE /api/lifecycle-statuses/:id
// @access  Private (DG / Portal-Admin)
const deleteLifecycleStatus = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid status id.' });

  try {
    const status = await LifecycleStatus.findById(id).lean();
    if (!status) return res.status(404).json({ message: 'Lifecycle status not found.' });

    const used = await InvestmentProject.countDocuments({ lifecycleStatus: status._id });
    if (used > 0) {
      return res.status(409).json({ message: `This status is used by ${used} project(s); move them to another status first.` });
    }

    try {
      await recordDeletions(req, 'LifecycleStatus', [status]);
    } catch (auditError) {
      console.error('ChangeLog write failed; lifecycle status not deleted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }

    await LifecycleStatus.findByIdAndDelete(status._id);
    return res.json({ message: 'Lifecycle status removed.' });
  } catch (err) {
    return serverError(res, err);
  }
};

// @desc    Reorder lifecycle statuses. orderedIds must list every status once.
//          Orders are numbered from 1, as create does (highest + 1).
// @route   PUT /api/lifecycle-statuses/reorder
// @access  Private (DG / Portal-Admin)
const reorderLifecycleStatuses = async (req, res) => {
  const { orderedIds } = req.body || {};
  const invalid = (message) => res.status(400).json({ message });

  if (!Array.isArray(orderedIds)) return invalid('orderedIds must be an array of status ids.');
  if (!orderedIds.every((id) => typeof id === 'string' && mongoose.isValidObjectId(id))) {
    return invalid('orderedIds holds an invalid id.');
  }
  if (new Set(orderedIds).size !== orderedIds.length) return invalid('orderedIds lists a status twice.');

  try {
    const existing = await LifecycleStatus.find().select('_id').lean();
    const existingIds = new Set(existing.map((s) => String(s._id)));
    if (existingIds.size !== orderedIds.length || !orderedIds.every((id) => existingIds.has(id))) {
      return invalid('orderedIds must list every status exactly once. Reload and try again.');
    }

    // One updateOne each (audited by the plugin; bulkWrite is refused there).
    await Promise.all(orderedIds.map((id, index) => LifecycleStatus.updateOne({ _id: id }, { $set: { order: index + 1 } })));

    return res.json({ message: 'Lifecycle statuses reordered successfully.' });
  } catch (err) {
    return serverError(res, err);
  }
};

module.exports = {
  getAllLifecycleStatuses,
  createLifecycleStatus,
  updateLifecycleStatus,
  deleteLifecycleStatus,
  reorderLifecycleStatuses,
};
