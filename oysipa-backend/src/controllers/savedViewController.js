// Saved list views (story 11.15). Every role keeps its own views; DG /
// Portal-Admin can share a view with everyone, and can unshare or delete any
// shared view. Staff can never share (403).
//
// GET    /api/views?list=      mine plus shared ones
// POST   /api/views            { list, name, query, shared? }
// PUT    /api/views/:id        { name?, query?, shared? }
// DELETE /api/views/:id
const mongoose = require('mongoose');
const SavedView = require('../models/SavedView');
const { isAdminRole, hasOperatorKey } = require('../middleware/accessHelpers');

const SHARE_DENIED = 'Forbidden: only the Director-General or a Portal-Admin can share a view';
const CHANGELOG_DENIED = 'Forbidden: the change log is for the Director-General and Portal-Admin';
const MAX_VIEWS_PER_LIST = 50;
// Lists a role may keep views of: the change log only for DG / Portal-Admin.
const listAllowed = (list, user) => list !== 'changelog' || isAdminRole(user.role);
const OWNER_DENIED = 'Forbidden: you can only change your own views';

const isOwner = (view, user) => String(view.owner && view.owner._id ? view.owner._id : view.owner) === String(user._id);

// The rules PUT / DELETE apply (canEdit / canShare / canDelete say the same):
// - name / query: the owner, unless the view is shared and they are no longer
//   DG / Portal-Admin (a demoted owner cannot keep editing a shared view);
// - shared: DG / Portal-Admin, on their own views or any shared view;
// - delete: the owner, or DG / Portal-Admin when the view is shared.
const rights = (view, user) => {
  const admin = isAdminRole(user.role);
  const mine = isOwner(view, user);
  return {
    mine,
    canEdit: mine && (admin || !view.shared),
    canShare: admin && (mine || !!view.shared),
    canDelete: mine || (admin && !!view.shared),
  };
};

const viewJson = (view, user) => {
  const r = rights(view, user);
  return {
    _id: view._id,
    list: view.list,
    name: view.name,
    query: view.query || '',
    shared: !!view.shared,
    owner: view.owner && view.owner._id ? { _id: view.owner._id, name: view.owner.name || null } : { _id: view.owner, name: null },
    mine: r.mine,
    canEdit: r.canEdit,
    canShare: r.canShare,
    canDelete: r.canDelete,
    createdAt: view.createdAt,
  };
};

const readName = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Name is required.' };
  const value = raw.trim();
  if (value.length > SavedView.MAX_NAME) return { error: `Name is too long (at most ${SavedView.MAX_NAME} characters).` };
  return { value };
};

const readQuery = (raw) => {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'query must be text.' };
  const value = raw.trim().replace(/^\?/, '');
  if (value.length > SavedView.MAX_QUERY) return { error: 'The view is too long to save.' };
  return { value };
};

const readShared = (raw) => {
  if (raw === undefined) return { value: undefined };
  if (typeof raw !== 'boolean') return { error: 'shared must be true or false.' };
  return { value: raw };
};

const handleError = (res, error) => {
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Server Error' });
};

exports.listViews = async (req, res) => {
  try {
    const { list } = req.query || {};
    if (typeof list !== 'string' || !SavedView.LISTS.includes(list)) return res.status(400).json({ message: 'Choose a list.' });
    if (!listAllowed(list, req.user)) return res.status(403).json({ msg: CHANGELOG_DENIED });
    const views = await SavedView.find({ list, $or: [{ owner: req.user._id }, { shared: true }] })
      .populate('owner', 'name')
      .lean();
    const json = views.map((v) => viewJson(v, req.user))
      .sort((a, b) => (Number(b.mine) - Number(a.mine)) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return res.status(200).json(json);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createView = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    if (typeof body.list !== 'string' || !SavedView.LISTS.includes(body.list)) return res.status(400).json({ message: 'Choose a list.' });
    if (!listAllowed(body.list, req.user)) return res.status(403).json({ msg: CHANGELOG_DENIED });
    const name = readName(body.name);
    if (name.error) return res.status(400).json({ message: name.error });
    const query = readQuery(body.query);
    if (query.error) return res.status(400).json({ message: query.error });
    const shared = readShared(body.shared);
    if (shared.error) return res.status(400).json({ message: shared.error });
    if (shared.value && !isAdminRole(req.user.role)) return res.status(403).json({ msg: SHARE_DENIED });
    if (await SavedView.countDocuments({ owner: req.user._id, list: body.list }) >= MAX_VIEWS_PER_LIST) {
      return res.status(400).json({ message: `You can keep at most ${MAX_VIEWS_PER_LIST} views of this list. Delete one first.` });
    }
    const view = await SavedView.create({
      owner: req.user._id, list: body.list, name: name.value, query: query.value, shared: !!shared.value,
    });
    await view.populate('owner', 'name');
    return res.status(201).json(viewJson(view.toObject(), req.user));
  } catch (error) {
    return handleError(res, error);
  }
};

const loadView = async (id) => (mongoose.isValidObjectId(id) ? SavedView.findById(id) : null);

exports.updateView = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const view = await loadView(req.params.id);
    const mine = view && isOwner(view, req.user);
    // A view the user cannot see (another user's unshared view) is not found.
    if (!view || (!mine && !view.shared)) return res.status(404).json({ message: 'View not found.' });
    const shared = readShared(body.shared);
    if (shared.error) return res.status(400).json({ message: shared.error });
    const r = rights(view, req.user);
    const editsContent = body.name !== undefined || body.query !== undefined;
    // Sending the current shared value changes nothing and needs no right.
    const changesShared = shared.value !== undefined && shared.value !== !!view.shared;
    if (!editsContent && !changesShared) {
      if (!r.canEdit && !r.canShare) return res.status(403).json({ msg: OWNER_DENIED });
    }
    if (editsContent && !r.canEdit) return res.status(403).json({ msg: OWNER_DENIED });
    if (changesShared && !r.canShare) return res.status(403).json({ msg: SHARE_DENIED });
    if (body.name !== undefined) {
      const name = readName(body.name);
      if (name.error) return res.status(400).json({ message: name.error });
      view.name = name.value;
    }
    if (body.query !== undefined) {
      const query = readQuery(body.query);
      if (query.error) return res.status(400).json({ message: query.error });
      view.query = query.value;
    }
    if (changesShared) view.shared = shared.value;
    await view.save();
    await view.populate('owner', 'name');
    return res.status(200).json(viewJson(view.toObject(), req.user));
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteView = async (req, res) => {
  try {
    const view = await loadView(req.params.id);
    const mine = view && isOwner(view, req.user);
    if (!view || (!mine && !view.shared)) return res.status(404).json({ message: 'View not found.' });
    if (!rights(view, req.user).canDelete) return res.status(403).json({ msg: OWNER_DENIED });
    await SavedView.deleteOne({ _id: view._id });
    return res.status(200).json({ deleted: 1 });
  } catch (error) {
    return handleError(res, error);
  }
};
