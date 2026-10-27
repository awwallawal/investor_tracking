// Announcements register (story 11.8, SABER DLR 4.4).
//
// Access (same as issues): every role reads; every role registers, edits,
// links interactions and attaches files, Staff only on projects whose investor
// is assigned to them. Delete is DG/Admin only, with a reason.
//
// Server-owned: createdBy, import stamps and timestamps. The investor is the
// project's investor. Archived copies live in the Evidence library
// (announcements/<id>), linked to the investor and the announcement.
const mongoose = require('mongoose');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const InvestmentProject = require('../models/InvestmentProject');
const EvidenceFile = require('../models/EvidenceFile');
const documentStorage = require('../services/documentStorage');
const { recordActionGroups } = require('../utils/recordDeletion');
const { parseHappenedDate } = require('../utils/happenedDate');
const { isAdminRole, isAssignedTo, hasOperatorKey } = require('../middleware/accessHelpers');
const {
  sha256, findLinksTo, unlinkSnapshots, pullLinks,
} = require('../services/evidenceLibrary');
const { ensureAnnouncementFolder, checkSupportingInteractions } = require('../services/announcementRegister');
const { MAX_URL_LENGTH } = require('../constants/announcementFields');
const { runAnnouncements, unfilteredTotal } = require('../services/listQueries');

const DENIED_MSG = 'Forbidden: You can only change investors assigned to you';
const MAX_TEXT = 5000;
const ROLE_REQUIRED_MSG = 'Say what the announcement says OYSIPA did (required when OYSIPA is named).';
const SCOPE_MSG = 'Only interactions of this project or its investor can be linked.';

const handleError = (res, error) => {
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Server Error' });
};

const canWriteInvestor = async (investorId, user) => {
  if (isAdminRole(user.role)) return true;
  if (user.role !== 'Staff') return false;
  return !!investorId && isAssignedTo(investorId, user._id);
};

// Text field: { value } (undefined = not sent, '' = cleared) or { error }.
const readText = (raw, label, { required = false } = {}) => {
  if (raw === undefined || raw === null) {
    return required ? { error: `${label} is required.` } : { value: undefined };
  }
  if (typeof raw !== 'string') return { error: `${label} must be text.` };
  const value = raw.trim();
  if (required && !value) return { error: `${label} is required.` };
  if (value.length > MAX_TEXT) return { error: `${label} is too long.` };
  return { value };
};

// http/https link: { value } (undefined = not sent, '' = cleared) or { error }.
const readUrl = (raw, label) => {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: `${label} must be text.` };
  const value = raw.trim();
  if (!value) return { value: '' };
  if (value.length > MAX_URL_LENGTH) return { error: `${label} is too long.` };
  let parsed;
  try { parsed = new URL(value); } catch (e) { parsed = null; }
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return { error: `${label} must be a link starting with http:// or https://.` };
  }
  return { value };
};

const readBool = (raw, label) => {
  if (raw === undefined) return { value: undefined };
  if (typeof raw !== 'boolean') return { error: `${label} must be true or false.` };
  return { value: raw };
};

const loadProject = async (raw) => {
  const id = raw && typeof raw === 'object' && raw._id ? raw._id : raw;
  if (!mongoose.isValidObjectId(id)) return null;
  return InvestmentProject.findById(id).select('investor projectTitle').lean();
};

const populateAnnouncement = (query) => query
  .populate({
    path: 'project',
    select: 'projectTitle investor',
    populate: { path: 'investor', select: 'investorName assignedTo organisationType' },
  })
  .populate({
    path: 'supportingInteractions',
    select: 'description category interactionDate createdAt project investor',
    populate: { path: 'project', select: 'projectTitle' },
  })
  .populate('createdBy', 'name');

// Library files linked to this announcement (no storage internals).
const announcementFiles = async (id) => {
  const files = await EvidenceFile.find({ 'links.announcement': id })
    .select('fileName mimeType size documentDate uploadedAt folder what')
    .lean();
  return files.sort((a, b) => (new Date(a.documentDate || a.uploadedAt) - new Date(b.documentDate || b.uploadedAt))
    || String(a.fileName).localeCompare(String(b.fileName)));
};

// The announcement as the detail page shows it: populated, with its files.
const detailJson = async (id) => {
  const doc = await populateAnnouncement(InvestmentAnnouncement.findById(id));
  if (!doc) return null;
  const json = doc.toJSON();
  json.supportingInteractions = (json.supportingInteractions || []).filter(Boolean)
    .sort((a, b) => new Date(a.interactionDate || a.createdAt) - new Date(b.interactionDate || b.createdAt));
  json.files = await announcementFiles(doc._id);
  return json;
};

// @route GET /api/announcements — filters, search and sort from
// services/listQueries.js (story 11.15): q, year, oysipaNamed, project, from,
// to, sort=date|-date. Values not on a list are ignored. X-Total-Count = unfiltered total.
exports.listAnnouncements = async (req, res) => {
  try {
    const [{ docs }, total] = await Promise.all([
      runAnnouncements(req.query || {}, { user: req.user }),
      unfilteredTotal('announcements'),
    ]);
    res.set('X-Total-Count', String(total));
    return res.status(200).json(docs);
  } catch (error) {
    return handleError(res, error);
  }
};

// @route GET /api/announcements/:id — with supporting interactions and files.
exports.getAnnouncement = async (req, res) => {
  try {
    const json = mongoose.isValidObjectId(req.params.id) && await detailJson(req.params.id);
    if (!json) return res.status(404).json({ message: 'Announcement not found.' });
    return res.status(200).json(json);
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/announcements { project, announcementDate, outlet, url?,
//        archivedCopyUrl?, oysipaNamed?, oysipaRoleText?, supportingInteractions? }
exports.createAnnouncement = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const project = await loadProject(body.project);
    if (!project) return res.status(400).json({ message: 'Choose a project that exists.' });
    if (!(await canWriteInvestor(project.investor, req.user))) return res.status(403).json({ msg: DENIED_MSG });

    const date = parseHappenedDate(body.announcementDate, { required: true, label: 'Announcement date' });
    if (date.error) return res.status(400).json({ message: date.error });
    const outlet = readText(body.outlet, 'Outlet', { required: true });
    if (outlet.error) return res.status(400).json({ message: outlet.error });
    const url = readUrl(body.url, 'Link');
    if (url.error) return res.status(400).json({ message: url.error });
    const archived = readUrl(body.archivedCopyUrl, 'Archived copy link');
    if (archived.error) return res.status(400).json({ message: archived.error });
    const named = readBool(body.oysipaNamed, 'OYSIPA named');
    if (named.error) return res.status(400).json({ message: named.error });
    const role = readText(body.oysipaRoleText, 'OYSIPA role');
    if (role.error) return res.status(400).json({ message: role.error });
    if (named.value === true && !role.value) return res.status(400).json({ message: ROLE_REQUIRED_MSG });

    let supporting = [];
    if (body.supportingInteractions !== undefined && body.supportingInteractions !== null) {
      if (!Array.isArray(body.supportingInteractions)) return res.status(400).json({ message: 'supportingInteractions must be a list.' });
      const checked = await checkSupportingInteractions(body.supportingInteractions, project);
      if (checked.bad.length) return res.status(400).json({ message: SCOPE_MSG });
      supporting = checked.ok;
    }

    const created = await InvestmentAnnouncement.create({
      project: project._id,
      announcementDate: date.value,
      outlet: outlet.value,
      ...(url.value && { url: url.value }),
      ...(archived.value && { archivedCopyUrl: archived.value }),
      oysipaNamed: named.value === true,
      ...(role.value && { oysipaRoleText: role.value }),
      supportingInteractions: supporting,
      createdBy: req.user._id,
    });
    return res.status(201).json(await detailJson(created._id));
  } catch (error) {
    return handleError(res, error);
  }
};

// Loads the announcement and checks write access (404 before 403). Sets
// req.announcement and req.announcementProject.
exports.announcementWriteAccess = async (req, res, next) => {
  try {
    const announcement = mongoose.isValidObjectId(req.params.id) && await InvestmentAnnouncement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found.' });
    const project = await InvestmentProject.findById(announcement.project).select('investor projectTitle').lean();
    if (!(await canWriteInvestor(project && project.investor, req.user))) return res.status(403).json({ msg: DENIED_MSG });
    req.announcement = announcement;
    req.announcementProject = project;
    return next();
  } catch (error) {
    return handleError(res, error);
  }
};

// @route PUT /api/announcements/:id { project?, announcementDate?, outlet?, url?,
//        archivedCopyUrl?, oysipaNamed?, oysipaRoleText? }
// Runs after announcementWriteAccess. The project can change only to another
// project of the same investor (links and files stay valid). url and
// archivedCopyUrl: '' or null clears.
exports.updateAnnouncement = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const { announcement } = req;
    const current = req.announcementProject;

    let nextProject;
    if (body.project !== undefined && body.project !== null && body.project !== '') {
      const project = await loadProject(body.project);
      if (!project) return res.status(400).json({ message: 'Choose a project that exists.' });
      if (!current || String(project.investor) !== String(current.investor)) {
        return res.status(400).json({ message: 'The project can only change to another project of the same investor.' });
      }
      nextProject = project._id;
    }
    const date = parseHappenedDate(body.announcementDate, { label: 'Announcement date' });
    if (date.error) return res.status(400).json({ message: date.error });
    const outlet = readText(body.outlet, 'Outlet');
    if (outlet.error) return res.status(400).json({ message: outlet.error });
    if (outlet.value === '') return res.status(400).json({ message: 'Outlet is required.' });
    const url = readUrl(body.url, 'Link');
    if (url.error) return res.status(400).json({ message: url.error });
    const archived = readUrl(body.archivedCopyUrl, 'Archived copy link');
    if (archived.error) return res.status(400).json({ message: archived.error });
    const named = readBool(body.oysipaNamed, 'OYSIPA named');
    if (named.error) return res.status(400).json({ message: named.error });
    // null clears the role text, like ''.
    const role = body.oysipaRoleText === null ? { value: '' } : readText(body.oysipaRoleText, 'OYSIPA role');
    if (role.error) return res.status(400).json({ message: role.error });

    const nextNamed = named.value !== undefined ? named.value : announcement.oysipaNamed;
    const nextRole = role.value !== undefined ? role.value : (announcement.oysipaRoleText || '');
    if (nextNamed === true && !nextRole) return res.status(400).json({ message: ROLE_REQUIRED_MSG });

    if (nextProject) announcement.project = nextProject;
    if (date.value) announcement.announcementDate = date.value;
    if (outlet.value) announcement.outlet = outlet.value;
    if (url.value !== undefined) announcement.url = url.value || undefined;
    if (archived.value !== undefined) announcement.archivedCopyUrl = archived.value || undefined;
    if (named.value !== undefined) announcement.oysipaNamed = named.value;
    if (role.value !== undefined) announcement.oysipaRoleText = role.value || undefined;
    await announcement.save();
    return res.status(200).json(await detailJson(announcement._id));
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/announcements/:id/interactions { interactions: [id] }
// Runs after announcementWriteAccess. Only interactions of the project or its
// investor (400 otherwise, nothing linked). Already linked ones are not repeated.
exports.linkInteractions = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const raw = body.interactions;
    if (!Array.isArray(raw) || raw.length === 0) return res.status(400).json({ message: 'Choose at least one interaction to link.' });
    const project = req.announcementProject || { _id: req.announcement.project };
    const checked = await checkSupportingInteractions(raw, project);
    if (checked.bad.length) return res.status(400).json({ message: SCOPE_MSG });
    await InvestmentAnnouncement.updateOne(
      { _id: req.announcement._id },
      { $addToSet: { supportingInteractions: { $each: checked.ok } } },
    );
    return res.status(200).json(await detailJson(req.announcement._id));
  } catch (error) {
    return handleError(res, error);
  }
};

// @route DELETE /api/announcements/:id/interactions/:interactionId
// Runs after announcementWriteAccess. Removes the link only.
exports.unlinkInteraction = async (req, res) => {
  try {
    const { interactionId } = req.params;
    if (!mongoose.isValidObjectId(interactionId)) return res.status(404).json({ message: 'Interaction not linked.' });
    const result = await InvestmentAnnouncement.updateOne(
      { _id: req.announcement._id, supportingInteractions: interactionId },
      { $pull: { supportingInteractions: interactionId } },
    );
    if (result.modifiedCount !== 1) return res.status(404).json({ message: 'Interaction not linked.' });
    return res.status(200).json(await detailJson(req.announcement._id));
  } catch (error) {
    return handleError(res, error);
  }
};

// @route GET /api/announcements/:id/files — library files linked to it.
// Open one through GET /api/evidence/files/:id/link (signed link).
exports.listFiles = async (req, res) => {
  try {
    const exists = mongoose.isValidObjectId(req.params.id) && await InvestmentAnnouncement.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ message: 'Announcement not found.' });
    return res.status(200).json(await announcementFiles(req.params.id));
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/announcements/:id/files (multipart `file`, optional `documentDate`, `what`)
// Runs after announcementWriteAccess, requireStorage, singleDocument. The file
// goes into the announcement's library subfolder, linked to the investor and
// the announcement. A file already in the library (same sha256) is linked, not
// stored again. Audit: `upload` (new file) and `link` rows; a failed audit undoes it.
exports.uploadFile = async (req, res) => {
  try {
    const { announcement } = req;
    const investorId = req.announcementProject && req.announcementProject.investor;
    if (!investorId) return res.status(400).json({ message: 'The project of this announcement has no investor.' });
    const date = parseHappenedDate(req.body && req.body.documentDate, { label: 'Document date' });
    if (date.error) return res.status(400).json({ message: date.error });
    const what = readText(req.body && req.body.what, 'What');
    if (what.error) return res.status(400).json({ message: what.error });

    const link = {
      _id: new mongoose.Types.ObjectId(),
      investor: investorId,
      announcement: announcement._id,
      serviceCodes: [],
      linkedBy: req.user._id,
      linkedAt: new Date(),
    };
    const { originalname, mimetype, size, buffer } = req.file;
    const hash = sha256(buffer);

    // Already in the library: link it to this announcement (once).
    const linkExisting = async (existing) => {
      const result = await EvidenceFile.updateOne(
        { _id: existing._id, links: { $not: { $elemMatch: { announcement: announcement._id } } } },
        { $push: { links: link } },
        { runValidators: true },
      );
      if (result.modifiedCount !== 1) {
        return res.status(409).json({ message: 'This file is already attached to this announcement.', fileId: existing._id });
      }
      try {
        await recordActionGroups(req, [['link', 'EvidenceFile', [{ _id: existing._id, link }]]]);
      } catch (auditError) {
        console.error('ChangeLog write failed; announcement file link undone:', auditError);
        await EvidenceFile.updateOne({ _id: existing._id }, { $pull: { links: { _id: link._id } } });
        return res.status(500).json({ message: 'Could not write the audit record. Nothing was saved.' });
      }
      const file = await EvidenceFile.findById(existing._id);
      return res.status(200).json({ ...file.toJSON(), linkedExisting: true });
    };

    const existing = await EvidenceFile.findOne({ sha256: hash }).select('_id').lean();
    if (existing) return linkExisting(existing);

    const { folder } = await ensureAnnouncementFolder(announcement);

    let stored;
    try {
      stored = await documentStorage.upload(buffer, { fileName: originalname, mimeType: mimetype });
    } catch (storageError) {
      if (storageError.code === 'STORAGE_NOT_CONFIGURED') {
        return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
      }
      console.error('Announcement file upload to storage failed:', storageError);
      return res.status(502).json({ message: 'The file could not be stored. Please try again.' });
    }

    const doc = {
      _id: new mongoose.Types.ObjectId(),
      folder: folder._id,
      fileName: originalname,
      mimeType: mimetype,
      size,
      sha256: hash,
      ...(date.value && { documentDate: date.value }),
      ...(what.value && { what: what.value }),
      provider: stored.provider,
      key: stored.key,
      resourceType: stored.resourceType,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      links: [link],
    };
    const removeStored = async () => {
      try { await documentStorage.remove(doc); } catch (cleanupError) {
        console.error('Could not remove the orphaned stored file:', doc.key, cleanupError);
      }
    };

    let created;
    try {
      created = await EvidenceFile.create(doc);
    } catch (dbError) {
      await removeStored();
      if (dbError && dbError.code === 11000) {
        const dup = await EvidenceFile.findOne({ sha256: hash }).select('_id').lean();
        if (dup) return linkExisting(dup);
      }
      console.error('Saving the announcement file failed; stored file removed:', dbError);
      return res.status(500).json({ message: 'Server Error' });
    }

    try {
      await recordActionGroups(req, [
        ['upload', 'EvidenceFile', [{ ...doc, links: [] }]],
        ['link', 'EvidenceFile', [{ _id: doc._id, link }]],
      ]);
    } catch (auditError) {
      console.error('ChangeLog write failed; announcement file upload undone:', auditError);
      try { await EvidenceFile.deleteOne({ _id: doc._id }); } catch (undoError) {
        console.error('Could not remove the unaudited evidence file row:', doc._id, undoError);
      }
      await removeStored();
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was saved.' });
    }
    return res.status(201).json(created.toJSON());
  } catch (error) {
    return handleError(res, error);
  }
};

// @route DELETE /api/announcements/:id { reason } (required)
// @access DG/Admin. ChangeLog rows first (delete + unlink of its files, one
// batch); the files stay in the library.
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = mongoose.isValidObjectId(req.params.id) && await InvestmentAnnouncement.findById(req.params.id).lean();
    if (!announcement) return res.status(404).json({ message: 'Announcement not found.' });
    const { reason } = req.body || {};
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) return res.status(400).json({ message: 'A reason is required to delete an announcement.' });

    const links = await findLinksTo({ announcementIds: [announcement._id] });
    try {
      await recordActionGroups(req, [
        ['delete', 'InvestmentAnnouncement', [announcement]],
        ['unlink', 'EvidenceFile', unlinkSnapshots(links)],
      ], { reason: trimmed });
    } catch (auditError) {
      console.error('ChangeLog write failed; announcement delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }
    await pullLinks(links);
    await InvestmentAnnouncement.deleteOne({ _id: announcement._id });
    return res.status(200).json({ deleted: { announcements: 1, ...(links.length > 0 && { evidenceLinks: links.length }) } });
  } catch (error) {
    return handleError(res, error);
  }
};
