// Investor issues register (story 11.7, SABER DLR 4.5).
//
// Access (same as interactions): every role reads; every role registers an
// issue, adds actions, changes status / resolves and attaches files, Staff only
// on investors assigned to them. Delete is DG/Admin only, with a reason.
//
// Server-owned: dateRegistered, resolvedDate, action recordedBy/recordedAt,
// import stamps and timestamps. Resolving needs a non-empty resolution note.
// Files live in the Evidence library (investor-issues/<ref>), linked to the
// investor and the issue.
const mongoose = require('mongoose');
const InvestorIssue = require('../models/InvestorIssue');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const EvidenceFile = require('../models/EvidenceFile');
const documentStorage = require('../services/documentStorage');
const { recordActionGroups, newBatchId } = require('../utils/recordDeletion');
const { parseHappenedDate, todayLagos } = require('../utils/happenedDate');
const { isAdminRole, isAssignedTo, hasOperatorKey } = require('../middleware/accessHelpers');
const {
  sha256, findLinksTo, unlinkSnapshots, pullLinks,
} = require('../services/evidenceLibrary');
const { ensureIssueFolder, parseYear, yearRange } = require('../services/issueRegister');
const {
  ISSUE_STATUSES, RESOLVED, DEFAULT_ISSUE_STATUS, ISSUE_CATEGORIES, REPORTED_VIA, MDA_NAMES,
} = require('../constants/issueFields');

const DENIED_MSG = 'Forbidden: You can only change investors assigned to you';
const MAX_TEXT = 5000;

// Today as a happened date (the Lagos day at 00:00Z, like parseHappenedDate).
const today = () => new Date(`${todayLagos()}T00:00:00.000Z`);

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
  return isAssignedTo(investorId, user._id);
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

const readEnum = (raw, values, label) => {
  if (raw === undefined || raw === null || raw === '') return { value: undefined };
  if (typeof raw !== 'string' || !values.includes(raw)) return { error: `Invalid ${label}.` };
  return { value: raw };
};

const readMdas = (raw) => {
  if (raw === undefined || raw === null) return { value: undefined };
  if (!Array.isArray(raw)) return { error: 'mdaResponsible must be a list of MDAs.' };
  const bad = raw.filter((m) => typeof m !== 'string' || !MDA_NAMES.includes(m));
  if (bad.length) return { error: `Invalid MDA: ${bad.map((m) => JSON.stringify(m)).join(', ')}` };
  return { value: [...new Set(raw)] };
};

// Optional project: must exist and belong to the investor. '' / null clears it.
const readProject = async (raw, investorId) => {
  if (raw === undefined) return { value: undefined };
  if (raw === null || raw === '') return { value: null };
  const id = typeof raw === 'object' && raw._id ? raw._id : raw;
  const project = mongoose.isValidObjectId(id) && await InvestmentProject.findById(id).select('investor').lean();
  if (!project) return { error: 'Project not found.' };
  if (String(project.investor) !== String(investorId)) return { error: 'That project belongs to another investor.' };
  return { value: project._id };
};

const populateIssue = (query) => query
  .populate('investor', 'investorName assignedTo')
  .populate('project', 'projectTitle location')
  .populate('actions.recordedBy', 'name');

// Library files linked to this issue (no storage internals).
const issueFiles = async (issueId) => {
  const files = await EvidenceFile.find({ 'links.issue': issueId })
    .select('fileName mimeType size documentDate uploadedAt folder what')
    .lean();
  return files.sort((a, b) => (new Date(a.documentDate || a.uploadedAt) - new Date(b.documentDate || b.uploadedAt))
    || String(a.fileName).localeCompare(String(b.fileName)));
};

// @route GET /api/issues?status=&year=&investor=
exports.listIssues = async (req, res) => {
  try {
    const { status, year, investor } = req.query || {};
    const filter = {};
    if (status !== undefined && status !== '') {
      if (typeof status !== 'string' || !ISSUE_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status filter.' });
      filter.status = status;
    }
    if (year !== undefined && year !== '') {
      const y = parseYear(year);
      if (!y) return res.status(400).json({ message: 'Invalid year filter.' });
      filter.dateReported = yearRange(y);
    }
    if (investor !== undefined && investor !== '') {
      if (!mongoose.isValidObjectId(investor)) return res.status(400).json({ message: 'Invalid investor filter.' });
      filter.investor = investor;
    }
    const issues = await InvestorIssue.find(filter)
      .populate('investor', 'investorName')
      .populate('project', 'projectTitle')
      .sort({ dateReported: -1, createdAt: -1 });
    return res.status(200).json(issues);
  } catch (error) {
    return handleError(res, error);
  }
};

const loadIssue = async (id) => (mongoose.isValidObjectId(id) ? InvestorIssue.findById(id) : null);

// @route GET /api/issues/:id — the issue with its actions and files.
exports.getIssue = async (req, res) => {
  try {
    const issue = mongoose.isValidObjectId(req.params.id) && await populateIssue(InvestorIssue.findById(req.params.id));
    if (!issue) return res.status(404).json({ message: 'Issue not found.' });
    const json = issue.toJSON();
    json.files = await issueFiles(issue._id);
    return res.status(200).json(json);
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/issues { investor, project?, projectText?, dateReported?,
//        reportedVia?, mdaResponsible?, category, description }
// A new issue is always Open; dateRegistered is the server time.
exports.createIssue = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const investor = mongoose.isValidObjectId(body.investor) && await Investor.findById(body.investor).select('_id').lean();
    if (!investor) return res.status(400).json({ message: 'Choose an investor that exists.' });
    if (!(await canWriteInvestor(investor._id, req.user))) return res.status(403).json({ msg: DENIED_MSG });

    const category = readEnum(body.category, ISSUE_CATEGORIES, 'category');
    if (category.error) return res.status(400).json({ message: category.error });
    if (!category.value) return res.status(400).json({ message: 'Category is required.' });
    const description = readText(body.description, 'Description', { required: true });
    if (description.error) return res.status(400).json({ message: description.error });
    const reportedVia = readEnum(body.reportedVia, REPORTED_VIA, '"reported via"');
    if (reportedVia.error) return res.status(400).json({ message: reportedVia.error });
    const mdas = readMdas(body.mdaResponsible);
    if (mdas.error) return res.status(400).json({ message: mdas.error });
    const projectText = readText(body.projectText, 'Project');
    if (projectText.error) return res.status(400).json({ message: projectText.error });
    const project = await readProject(body.project, investor._id);
    if (project.error) return res.status(400).json({ message: project.error });
    const date = parseHappenedDate(body.dateReported, { label: 'Date reported' });
    if (date.error) return res.status(400).json({ message: date.error });

    const now = new Date();
    const issue = await InvestorIssue.create({
      investor: investor._id,
      ...(project.value && { project: project.value }),
      ...(projectText.value && { projectText: projectText.value }),
      dateRegistered: now,
      // Empty = today (stored as the Lagos day, like every happened date).
      dateReported: date.value || today(),
      ...(reportedVia.value && { reportedVia: reportedVia.value }),
      mdaResponsible: mdas.value || [],
      category: category.value,
      description: description.value,
      status: DEFAULT_ISSUE_STATUS,
    });
    const populated = await populateIssue(InvestorIssue.findById(issue._id));
    return res.status(201).json(populated);
  } catch (error) {
    return handleError(res, error);
  }
};

// Loads the issue and checks write access (404 before 403). Sets req.issue.
exports.issueWriteAccess = async (req, res, next) => {
  try {
    const issue = await loadIssue(req.params.id);
    if (!issue) return res.status(404).json({ message: 'Issue not found.' });
    if (!(await canWriteInvestor(issue.investor, req.user))) return res.status(403).json({ msg: DENIED_MSG });
    req.issue = issue;
    return next();
  } catch (error) {
    return handleError(res, error);
  }
};

// @route PUT /api/issues/:id { project?, projectText?, dateReported?, reportedVia?,
//        mdaResponsible?, category?, description?, status?, resolution? }
// Runs after issueWriteAccess. The investor never changes here.
exports.updateIssue = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const { issue } = req;

    const category = readEnum(body.category, ISSUE_CATEGORIES, 'category');
    if (category.error) return res.status(400).json({ message: category.error });
    const reportedVia = readEnum(body.reportedVia, REPORTED_VIA, '"reported via"');
    if (reportedVia.error) return res.status(400).json({ message: reportedVia.error });
    const status = readEnum(body.status, ISSUE_STATUSES, 'status');
    if (status.error) return res.status(400).json({ message: status.error });
    const mdas = readMdas(body.mdaResponsible);
    if (mdas.error) return res.status(400).json({ message: mdas.error });
    const description = readText(body.description, 'Description');
    if (description.error) return res.status(400).json({ message: description.error });
    if (description.value === '') return res.status(400).json({ message: 'Description is required.' });
    const projectText = readText(body.projectText, 'Project');
    if (projectText.error) return res.status(400).json({ message: projectText.error });
    const resolution = readText(body.resolution, 'Resolution');
    if (resolution.error) return res.status(400).json({ message: resolution.error });
    const project = await readProject(body.project, issue.investor);
    if (project.error) return res.status(400).json({ message: project.error });
    const date = parseHappenedDate(body.dateReported, { label: 'Date reported' });
    if (date.error) return res.status(400).json({ message: date.error });

    const nextStatus = status.value || issue.status;
    const nextResolution = resolution.value !== undefined ? resolution.value : (issue.resolution || '');
    if (nextStatus === RESOLVED && !nextResolution) {
      return res.status(400).json({ message: 'A resolution note is required to resolve an issue.' });
    }

    if (category.value) issue.category = category.value;
    if (reportedVia.value) issue.reportedVia = reportedVia.value;
    if (mdas.value) issue.mdaResponsible = mdas.value;
    if (description.value) issue.description = description.value;
    if (projectText.value !== undefined) issue.projectText = projectText.value || undefined;
    if (resolution.value !== undefined) issue.resolution = resolution.value || undefined;
    if (project.value !== undefined) issue.project = project.value || undefined;
    if (date.value) issue.dateReported = date.value;
    if (nextStatus !== issue.status) {
      if (nextStatus === RESOLVED) issue.resolvedDate = new Date();
      else if (issue.status === RESOLVED) issue.resolvedDate = undefined;
      issue.status = nextStatus;
    }
    await issue.save();
    const populated = await populateIssue(InvestorIssue.findById(issue._id));
    return res.status(200).json(populated);
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/issues/:id/actions { date?, by?, note }
// Runs after issueWriteAccess. Stamped with the user and server time.
exports.addAction = async (req, res) => {
  try {
    const body = req.body || {};
    if (hasOperatorKey(body)) return res.status(400).json({ msg: 'Invalid update' });
    const note = readText(body.note, 'Action note', { required: true });
    if (note.error) return res.status(400).json({ message: note.error });
    const by = readText(body.by, 'By');
    if (by.error) return res.status(400).json({ message: by.error });
    const date = parseHappenedDate(body.date, { label: 'Action date' });
    if (date.error) return res.status(400).json({ message: date.error });
    const now = new Date();
    const action = {
      _id: new mongoose.Types.ObjectId(),
      date: date.value || today(),
      by: by.value || req.user.name,
      note: note.value,
      recordedBy: req.user._id,
      recordedAt: now,
    };
    const result = await InvestorIssue.updateOne({ _id: req.issue._id }, { $push: { actions: action } }, { runValidators: true });
    if (result.matchedCount !== 1) return res.status(404).json({ message: 'Issue not found.' });
    const populated = await populateIssue(InvestorIssue.findById(req.issue._id));
    return res.status(201).json(populated);
  } catch (error) {
    return handleError(res, error);
  }
};

// @route GET /api/issues/:id/files — library files linked to the issue.
// Open one through GET /api/evidence/files/:id/link (signed link).
exports.listFiles = async (req, res) => {
  try {
    const issue = mongoose.isValidObjectId(req.params.id) && await InvestorIssue.exists({ _id: req.params.id });
    if (!issue) return res.status(404).json({ message: 'Issue not found.' });
    return res.status(200).json(await issueFiles(req.params.id));
  } catch (error) {
    return handleError(res, error);
  }
};

// @route POST /api/issues/:id/files (multipart `file`, optional `documentDate`, `what`)
// Runs after issueWriteAccess, requireStorage, singleDocument. The file goes into
// the issue's library subfolder, linked to the investor and the issue. A file
// already in the library (same sha256) is linked, not stored again.
// Audit: `upload` (new file) and `link` rows, written after the change; a failed
// audit undoes it.
exports.uploadFile = async (req, res) => {
  try {
    const { issue } = req;
    const date = parseHappenedDate(req.body && req.body.documentDate, { label: 'Document date' });
    if (date.error) return res.status(400).json({ message: date.error });
    const what = readText(req.body && req.body.what, 'What');
    if (what.error) return res.status(400).json({ message: what.error });

    const link = {
      _id: new mongoose.Types.ObjectId(),
      investor: issue.investor,
      issue: issue._id,
      serviceCodes: [],
      linkedBy: req.user._id,
      linkedAt: new Date(),
    };
    const { originalname, mimetype, size, buffer } = req.file;
    const hash = sha256(buffer);

    // Already in the library: link it to this issue (once).
    const linkExisting = async (existing) => {
      const result = await EvidenceFile.updateOne(
        { _id: existing._id, links: { $not: { $elemMatch: { issue: issue._id } } } },
        { $push: { links: link } },
        { runValidators: true },
      );
      if (result.modifiedCount !== 1) {
        return res.status(409).json({ message: 'This file is already attached to this issue.', fileId: existing._id });
      }
      try {
        await recordActionGroups(req, [['link', 'EvidenceFile', [{ _id: existing._id, link }]]]);
      } catch (auditError) {
        console.error('ChangeLog write failed; issue file link undone:', auditError);
        await EvidenceFile.updateOne({ _id: existing._id }, { $pull: { links: { _id: link._id } } });
        return res.status(500).json({ message: 'Could not write the audit record. Nothing was saved.' });
      }
      const file = await EvidenceFile.findById(existing._id);
      return res.status(200).json({ ...file.toJSON(), linkedExisting: true });
    };

    const existing = await EvidenceFile.findOne({ sha256: hash }).select('_id').lean();
    if (existing) return linkExisting(existing);

    const { folder } = await ensureIssueFolder(issue);

    let stored;
    try {
      stored = await documentStorage.upload(buffer, { fileName: originalname, mimeType: mimetype });
    } catch (storageError) {
      if (storageError.code === 'STORAGE_NOT_CONFIGURED') {
        return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
      }
      console.error('Issue file upload to storage failed:', storageError);
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
      console.error('Saving the issue file failed; stored file removed:', dbError);
      return res.status(500).json({ message: 'Server Error' });
    }

    try {
      await recordActionGroups(req, [
        ['upload', 'EvidenceFile', [{ ...doc, links: [] }]],
        ['link', 'EvidenceFile', [{ _id: doc._id, link }]],
      ]);
    } catch (auditError) {
      console.error('ChangeLog write failed; issue file upload undone:', auditError);
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

// @route DELETE /api/issues/:id { reason } (required)
// @access DG/Admin. ChangeLog rows first (delete + unlink of its files, one
// batch); the files stay in the library.
exports.deleteIssue = async (req, res) => {
  try {
    const issue = mongoose.isValidObjectId(req.params.id) && await InvestorIssue.findById(req.params.id).lean();
    if (!issue) return res.status(404).json({ message: 'Issue not found.' });
    const { reason } = req.body || {};
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) return res.status(400).json({ message: 'A reason is required to delete an issue.' });

    const links = await findLinksTo({ issueIds: [issue._id] });
    try {
      await recordActionGroups(req, [
        ['delete', 'InvestorIssue', [issue]],
        ['unlink', 'EvidenceFile', unlinkSnapshots(links)],
      ], { reason: trimmed, batchId: newBatchId() });
    } catch (auditError) {
      console.error('ChangeLog write failed; issue delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }
    await pullLinks(links);
    await InvestorIssue.deleteOne({ _id: issue._id });
    return res.status(200).json({ deleted: { issues: 1, ...(links.length > 0 && { evidenceLinks: links.length }) } });
  } catch (error) {
    return handleError(res, error);
  }
};
