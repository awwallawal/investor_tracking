// Evidence library (spec-evidence-library-and-bulk-attach). Folders of privately
// stored files, each stored once (sha256) and linked to investors /
// interactions. Every upload, link, unlink and delete writes a ChangeLog row
// first; deletes then remove the stored file, then the database entry.
const mongoose = require('mongoose');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const Investor = require('../models/InvestorModel');
const InteractionLog = require('../models/InteractionLog');
const InvestmentProject = require('../models/InvestmentProject');
// Registered for populate('links.issue').
require('../models/InvestorIssue');
require('../models/InvestmentAnnouncement');
const documentStorage = require('../services/documentStorage');
const { recordChanges, recordDeletions } = require('../utils/recordDeletion');
const { parseHappenedDate } = require('../utils/happenedDate');
const { isAdminRole, isAssignedTo, hasOperatorKey } = require('../middleware/accessHelpers');
const {
  sha256, topOrder, compareTop, compareSub, parseFolderDate, parseLinkCodes,
} = require('../services/evidenceLibrary');
const { runEvidence, unfilteredTotal } = require('../services/listQueries');

const LINK_TTL_SECONDS = 5 * 60;
const DENIED_MSG = 'Forbidden: You can only change investors assigned to you';
const MAX_TEXT = 2000;
const MAX_NAME = 200;

// Folder name: required, trimmed, at most MAX_NAME characters. Returns { value } or { error }.
const folderName = (raw) => {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { error: 'Folder name is required.' };
  if (name.length > MAX_NAME) return { error: `Folder name is too long (at most ${MAX_NAME} characters).` };
  return { value: name };
};

const FOLDER_EXISTS_MSG = 'A folder with this key already exists. Please try again.';

const handleError = (res, error) => {
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Server Error' });
};

// Optional short text field. Returns { value } (undefined = not sent) or { error }.
const optionalText = (raw, label) => {
  if (raw === undefined || raw === null) return { value: undefined };
  if (typeof raw !== 'string') return { error: `${label} must be text.` };
  const value = raw.trim();
  if (value.length > MAX_TEXT) return { error: `${label} is too long.` };
  return { value };
};

const slugify = (s) => String(s || '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'folder';

const uniqueKey = async (base) => {
  let key = base;
  for (let n = 2; await EvidenceFolder.exists({ key }); n += 1) key = `${base}-${n}`;
  return key;
};

const folderJson = (f, counts) => {
  const c = counts.get(String(f._id)) || { files: 0, untagged: 0 };
  return {
    _id: f._id,
    key: f.key,
    name: f.name,
    description: f.description,
    folderDate: f.folderDate,
    parent: f.parent || null,
    order: f.order,
    fileCount: c.files,
    untaggedCount: c.untagged,
  };
};

const folderCounts = async (folderIds) => {
  const rows = await EvidenceFile.aggregate([
    ...(folderIds ? [{ $match: { folder: { $in: folderIds } } }] : []),
    {
      $group: {
        _id: '$folder',
        files: { $sum: 1 },
        untagged: { $sum: { $cond: [{ $eq: [{ $size: { $ifNull: ['$links', []] } }, 0] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { files: r.files, untagged: r.untagged }]));
};

// @route GET /api/evidence/folders — the tree with file and untagged counts.
// Top-level counts include their subfolders (totalFiles / totalUntagged).
exports.getFolders = async (req, res) => {
  try {
    const [folders, counts] = await Promise.all([EvidenceFolder.find({}).lean(), folderCounts()]);
    const tops = folders.filter((f) => !f.parent).map((f) => ({ ...folderJson(f, counts), children: [] }));
    const byId = new Map(tops.map((t) => [String(t._id), t]));
    folders.filter((f) => f.parent).forEach((f) => {
      const top = byId.get(String(f.parent));
      if (top) top.children.push(folderJson(f, counts));
    });
    tops.forEach((t) => {
      t.children.sort(compareSub);
      t.totalFiles = t.fileCount + t.children.reduce((s, c) => s + c.fileCount, 0);
      t.totalUntagged = t.untaggedCount + t.children.reduce((s, c) => s + c.untaggedCount, 0);
    });
    tops.sort(compareTop);
    return res.status(200).json(tops);
  } catch (error) {
    return handleError(res, error);
  }
};

// @route GET /api/evidence/untagged-count
exports.getUntaggedCount = async (req, res) => {
  try {
    const count = await EvidenceFile.countDocuments(EvidenceFile.UNTAGGED);
    return res.status(200).json({ count });
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/evidence/folders { name, description?, folderDate?, parent? }
// @access DG/Admin. The key is made from the name (and the parent's key).
exports.createFolder = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ message: 'Invalid request.' });
    const { parent } = body;
    const name = folderName(body.name);
    if (name.error) return res.status(400).json({ message: name.error });
    const description = optionalText(body.description, 'Description');
    if (description.error) return res.status(400).json({ message: description.error });
    const date = parseFolderDate(body.folderDate);
    if (date.error) return res.status(400).json({ message: date.error });

    let parentFolder = null;
    if (parent !== undefined && parent !== null && parent !== '') {
      parentFolder = mongoose.isValidObjectId(parent) && await EvidenceFolder.findById(parent).lean();
      if (!parentFolder) return res.status(400).json({ message: 'Parent folder not found.' });
      if (parentFolder.parent) return res.status(400).json({ message: 'Folders have two levels: a subfolder cannot hold folders.' });
    }

    const base = parentFolder ? `${parentFolder.key}/${slugify(name.value)}` : slugify(name.value);
    const key = await uniqueKey(base);
    const folder = await EvidenceFolder.create({
      key,
      name: name.value,
      ...(description.value && { description: description.value }),
      ...(date.value && { folderDate: date.value }),
      parent: parentFolder ? parentFolder._id : null,
      order: parentFolder ? 0 : topOrder(key),
    });
    return res.status(201).json(folder);
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ message: FOLDER_EXISTS_MSG });
    return handleError(res, error);
  }
};

// @route PUT /api/evidence/folders/:id { name?, description?, folderDate? }
// @access DG/Admin. Key and parent never change.
exports.updateFolder = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ message: 'Invalid request.' });
    const { id } = req.params;
    const folder = mongoose.isValidObjectId(id) && await EvidenceFolder.findById(id);
    if (!folder) return res.status(404).json({ message: 'Folder not found.' });

    if (body.name !== undefined) {
      const name = folderName(body.name);
      if (name.error) return res.status(400).json({ message: name.error });
      folder.name = name.value;
    }
    const description = optionalText(body.description, 'Description');
    if (description.error) return res.status(400).json({ message: description.error });
    if (description.value !== undefined) folder.description = description.value || undefined;
    if ('folderDate' in body) {
      const date = parseFolderDate(body.folderDate);
      if (date.error) return res.status(400).json({ message: date.error });
      folder.folderDate = date.value;
    }
    await folder.save();
    return res.status(200).json(folder);
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ message: FOLDER_EXISTS_MSG });
    return handleError(res, error);
  }
};

const populateFile = (query) => query
  .populate('links.investor', 'investorName')
  .populate('links.interaction', 'description category interactionDate createdAt')
  .populate('links.issue', 'importRef category status')
  .populate('links.announcement', 'announcementDate outlet')
  .populate('links.linkedBy', 'name')
  .populate('uploadedBy', 'name');

// @route GET /api/evidence/folders/:id/files — filters, search and sort from
// services/listQueries.js (story 11.15): q, untagged, type, from, to,
// sort=date|-date|name|-name. X-Total-Count = files in the folder.
exports.getFolderFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = mongoose.isValidObjectId(id) && await EvidenceFolder.findById(id).populate('parent', 'name key').lean();
    if (!folder) return res.status(404).json({ message: 'Folder not found.' });
    const [{ docs }, total] = await Promise.all([
      runEvidence(req.query || {}, { user: req.user, folder: folder._id }),
      unfilteredTotal('evidence', { folder: folder._id }),
    ]);
    // A top-level folder also lists its subfolders (with counts) to navigate to.
    const children = await EvidenceFolder.find({ parent: folder._id }).lean();
    const counts = children.length ? await folderCounts(children.map((c) => c._id)) : new Map();
    const subfolders = children.map((c) => folderJson(c, counts)).sort(compareSub);
    res.set('X-Total-Count', String(total));
    return res.status(200).json({ folder, subfolders, files: docs });
  } catch (error) {
    return handleError(res, error);
  }
};

// @route GET /api/evidence/files — library-wide file list (story 11.15), same
// filters as a folder's files; each file carries `folder` { _id, name }.
// X-Total-Count = every file in the library.
exports.getLibraryFiles = async (req, res) => {
  try {
    const query = { ...(req.query || {}) };
    delete query.folder;
    const [{ docs }, total] = await Promise.all([
      runEvidence(query, { user: req.user }, { withFolder: true }),
      unfilteredTotal('evidence'),
    ]);
    res.set('X-Total-Count', String(total));
    return res.status(200).json(docs);
  } catch (error) {
    return handleError(res, error);
  }
};

// Loads the folder for an upload (404 before the file is read). Sets req.evidenceFolder.
exports.loadFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const folder = mongoose.isValidObjectId(id) && await EvidenceFolder.findById(id).lean();
    if (!folder) return res.status(404).json({ message: 'Folder not found.' });
    req.evidenceFolder = folder;
    return next();
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/evidence/folders/:id/files (multipart `file`, optional
//        `documentDate`, `what`). Runs after loadFolder, requireStorage, singleDocument.
// @access DG/Admin. The same content (sha256) → 409 with the existing file id.
exports.uploadFile = async (req, res) => {
  try {
    const folder = req.evidenceFolder;
    const date = parseHappenedDate(req.body && req.body.documentDate, { label: 'Document date' });
    if (date.error) return res.status(400).json({ message: date.error });
    const what = optionalText(req.body && req.body.what, 'What');
    if (what.error) return res.status(400).json({ message: what.error });

    const { originalname, mimetype, size, buffer } = req.file;
    const hash = sha256(buffer);
    const existing = await EvidenceFile.findOne({ sha256: hash }).select('_id folder fileName').lean();
    if (existing) {
      return res.status(409).json({
        message: 'This file is already in the library. Tag the existing file instead.',
        fileId: existing._id,
        folderId: existing.folder,
      });
    }

    let stored;
    try {
      stored = await documentStorage.upload(buffer, { fileName: originalname, mimeType: mimetype });
    } catch (storageError) {
      if (storageError.code === 'STORAGE_NOT_CONFIGURED') {
        return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
      }
      console.error('Evidence upload to storage failed:', storageError);
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
      links: [],
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
        const dup = await EvidenceFile.findOne({ sha256: hash }).select('_id folder').lean();
        return res.status(409).json({
          message: 'This file is already in the library. Tag the existing file instead.',
          fileId: dup && dup._id,
          folderId: dup && dup.folder,
        });
      }
      console.error('Saving the evidence file failed; stored file removed:', dbError);
      return res.status(500).json({ message: 'Server Error' });
    }

    // Record first, then the audit row; if the audit fails the upload is undone.
    try {
      await recordChanges(req, 'upload', [['EvidenceFile', [doc]]]);
    } catch (auditError) {
      console.error('ChangeLog write failed; evidence upload undone:', auditError);
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

const loadFile = async (id, select) => (mongoose.isValidObjectId(id)
  ? EvidenceFile.findById(id).select(select).lean()
  : null);

// @route GET /api/evidence/files/:id/link — a short-lived signed link.
exports.getFileLink = async (req, res) => {
  try {
    const file = await loadFile(req.params.id, 'provider key resourceType fileName mimeType');
    if (!file) return res.status(404).json({ message: 'File not found.' });
    if (!documentStorage.isConfigured()) {
      return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
    }
    try {
      const url = await documentStorage.signedUrl(file, LINK_TTL_SECONDS);
      return res.status(200).json({
        url,
        expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
      });
    } catch (storageError) {
      console.error('Signing an evidence link failed:', storageError);
      return res.status(502).json({ message: 'Could not open the file. Please try again.' });
    }
  } catch (error) {
    return handleError(res, error);
  }
};

// The interaction's investor: the project's current investor when it has one
// (same rule as canWriteInteraction), else the stored investor.
const interactionInvestor = async (log) => {
  if (log.project) {
    const project = await InvestmentProject.findById(log.project).select('investor').lean();
    if (project && project.investor) return project.investor;
  }
  return log.investor;
};

// @route POST /api/evidence/files/:id/links { investor, interaction?, serviceCodes? }
// @access All roles; Staff only for investors assigned to them. Audited first.
exports.addLink = async (req, res) => {
  try {
    if (hasOperatorKey(req.body)) return res.status(400).json({ msg: 'Invalid update' });
    const file = await loadFile(req.params.id, 'links');
    if (!file) return res.status(404).json({ message: 'File not found.' });

    const { investor, interaction, serviceCodes } = req.body || {};
    const investorDoc = mongoose.isValidObjectId(investor) && await Investor.findById(investor).select('_id').lean();
    if (!investorDoc) return res.status(400).json({ message: 'Choose an investor that exists.' });

    if (!isAdminRole(req.user.role)) {
      if (req.user.role !== 'Staff' || !(await isAssignedTo(investorDoc._id, req.user._id))) {
        return res.status(403).json({ msg: DENIED_MSG });
      }
    }

    let interactionId;
    if (interaction !== undefined && interaction !== null && interaction !== '') {
      const log = mongoose.isValidObjectId(interaction)
        && await InteractionLog.findById(interaction).select('investor project').lean();
      if (!log) return res.status(400).json({ message: 'Interaction not found.' });
      const owner = await interactionInvestor(log);
      if (!owner || String(owner) !== String(investorDoc._id)) {
        return res.status(400).json({ message: 'That interaction belongs to another investor.' });
      }
      interactionId = log._id;
    }

    const codes = parseLinkCodes(serviceCodes);
    if (codes.error) return res.status(400).json({ message: codes.error });

    const link = {
      _id: new mongoose.Types.ObjectId(),
      investor: investorDoc._id,
      ...(interactionId && { interaction: interactionId }),
      serviceCodes: codes.codes,
      linkedBy: req.user._id,
      linkedAt: new Date(),
    };

    // Conditional push: only when no link has the same investor and interaction
    // (safe against two requests at once).
    // Issue links (story 11.7) are separate: they never block an investor tag.
    // Announcement links (story 11.8) likewise.
    const sameLink = {
      investor: investorDoc._id, interaction: interactionId || { $exists: false }, issue: { $exists: false }, announcement: { $exists: false },
    };
    const result = await EvidenceFile.updateOne(
      { _id: file._id, links: { $not: { $elemMatch: sameLink } } },
      { $push: { links: link } },
      { runValidators: true },
    );
    if (result.modifiedCount !== 1) {
      if (!(await EvidenceFile.exists({ _id: file._id }))) return res.status(404).json({ message: 'File not found.' });
      return res.status(409).json({ message: 'This file is already linked to that investor and interaction.' });
    }

    // Record first, then the audit row; if the audit fails the link is undone.
    try {
      await recordChanges(req, 'link', [['EvidenceFile', [{ _id: file._id, link }]]]);
    } catch (auditError) {
      console.error('ChangeLog write failed; link undone:', auditError);
      await EvidenceFile.updateOne({ _id: file._id }, { $pull: { links: { _id: link._id } } });
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was saved.' });
    }

    const updated = await populateFile(EvidenceFile.findById(file._id));
    if (!updated) return res.status(404).json({ message: 'File not found.' });
    return res.status(201).json(updated.toJSON());
  } catch (error) {
    return handleError(res, error);
  }
};

const readReason = (body) => {
  const { reason } = body || {};
  if (reason !== undefined && reason !== null && typeof reason !== 'string') return { error: 'reason must be text.' };
  return { value: typeof reason === 'string' && reason.trim() ? reason.trim() : null };
};

// @route DELETE /api/evidence/files/:id/links/:linkId { reason? }
// @access DG/Admin. Audited first; the file stays.
exports.removeLink = async (req, res) => {
  try {
    const file = await loadFile(req.params.id, 'links');
    const link = file && (file.links || []).find((l) => String(l._id) === String(req.params.linkId));
    if (!link) return res.status(404).json({ message: 'Link not found.' });
    const reason = readReason(req.body);
    if (reason.error) return res.status(400).json({ message: reason.error });

    try {
      await recordChanges(req, 'unlink', [['EvidenceFile', [{ _id: file._id, link }]]], { reason: reason.value });
    } catch (auditError) {
      console.error('ChangeLog write failed; unlink aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was removed.' });
    }

    const pulled = await EvidenceFile.updateOne({ _id: file._id }, { $pull: { links: { _id: link._id } } });
    if (pulled.modifiedCount !== 1) return res.status(404).json({ message: 'Link not found.' });
    return res.status(200).json({ deleted: { links: 1 } });
  } catch (error) {
    return handleError(res, error);
  }
};

// @route DELETE /api/evidence/files/:id { reason } (required)
// @access DG/Admin. Order: ChangeLog row → stored file → database entry.
exports.deleteFile = async (req, res) => {
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found.' });
    const reason = readReason(req.body);
    if (reason.error) return res.status(400).json({ message: reason.error });
    if (!reason.value) return res.status(400).json({ message: 'A reason is required to delete a file.' });
    if (!documentStorage.isConfigured()) {
      return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
    }

    try {
      await recordDeletions(req, 'EvidenceFile', [file], { reason: reason.value });
    } catch (auditError) {
      console.error('ChangeLog write failed; evidence delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }

    try {
      await documentStorage.remove(file);
    } catch (storageError) {
      console.error('Removing the stored evidence file failed; entry kept:', storageError);
      return res.status(502).json({ message: 'Could not remove the stored file. Please try again.' });
    }

    await EvidenceFile.deleteOne({ _id: file._id });
    return res.status(200).json({ deleted: { files: 1 } });
  } catch (error) {
    return handleError(res, error);
  }
};
