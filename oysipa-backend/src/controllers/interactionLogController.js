const mongoose = require('mongoose');
const InteractionLog = require('../models/InteractionLog');
const InvestmentProject = require('../models/InvestmentProject');
const Investor = require('../models/InvestorModel');
const { SERVICE_CODES } = require('../constants/serviceCodes');
const { hasOperatorKey, canWriteInteraction } = require('../middleware/accessHelpers');
const { DENIED_MSG } = require('../middleware/projectWriteAccess');
const { recordDeletions, recordActionGroups } = require('../utils/recordDeletion');
const { parseHappenedDate } = require('../utils/happenedDate');
const documentStorage = require('../services/documentStorage');
const {
  withEvidenceFiles, findLinksTo, unlinkSnapshots, pullLinks,
} = require('../services/evidenceLibrary');

// Signed document links live this long (FR-Y19: short-lived).
const LINK_TTL_SECONDS = 5 * 60;

// Interaction lists: newest first by happened date, falling back to createdAt
// for old records that have none (never back-filled).
const happenedTime = (log) => new Date(log.interactionDate || log.createdAt).getTime();
const sortByHappened = (logs) => logs.sort((a, b) => (happenedTime(b) - happenedTime(a))
  || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

// Validates and dedupes serviceCodes. Returns { codes } or { error }.
// undefined/null means "not sent" (codes stays undefined).
const parseServiceCodes = (raw) => {
  if (raw === undefined || raw === null) return { codes: undefined };
  if (!Array.isArray(raw)) return { error: 'serviceCodes must be an array of service codes.' };
  const invalid = raw.filter((c) => typeof c !== 'string' || !SERVICE_CODES.includes(c));
  if (invalid.length > 0) {
    return { error: `Invalid service code(s): ${invalid.map((c) => JSON.stringify(c)).join(', ')}` };
  }
  return { codes: [...new Set(raw)] };
};

// Returns { value } or { error }. undefined/null means "not sent".
const parseCreditLinkage = (raw) => {
  if (raw === undefined || raw === null) return { value: undefined };
  if (typeof raw !== 'boolean') return { error: 'creditLinkage must be true or false.' };
  return { value: raw };
};

const isValidationError = (error) => error instanceof mongoose.Error.ValidationError
  || error instanceof mongoose.Error.CastError;

const handleError = (res, error) => {
  if (isValidationError(error)) {
    return res.status(400).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Server Error' });
};

// Shared by the project and investor create routes. Body `investor` and
// `project` are never read: they come from the route (and the model hook).
// Sends a 400 and returns null when the body is invalid.
const buildLog = (req, res, target) => {
  // Whitelisted fields only: createdAt/updatedAt/documents are never taken from
  // the client, nor documentUrl (FR-Y19: no new public links; files go through
  // POST /api/interactions/:id/documents). Existing documentUrl values still display.
  const {
    description, category, serviceCodes, creditLinkage, interactionDate,
  } = req.body || {};

  if (!description || !category) {
    res.status(400).json({ message: 'Description and category are required.' });
    return null;
  }
  const codes = parseServiceCodes(serviceCodes);
  if (codes.error) {
    res.status(400).json({ message: codes.error });
    return null;
  }
  const credit = parseCreditLinkage(creditLinkage);
  if (credit.error) {
    res.status(400).json({ message: credit.error });
    return null;
  }
  const happened = parseHappenedDate(interactionDate, { label: 'Interaction date' });
  if (happened.error) {
    res.status(400).json({ message: happened.error });
    return null;
  }

  return new InteractionLog({
    ...target,
    loggedBy: req.user.id, // comes from auth middleware
    description,
    category,
    // Today when left empty (set here, not as a schema default).
    interactionDate: happened.value || new Date(),
    ...(codes.codes !== undefined && { serviceCodes: codes.codes }),
    ...(credit.value !== undefined && { creditLinkage: credit.value }),
  });
};

const saveAndRespond = async (res, interactionLog) => {
  const savedLog = await interactionLog.save();
  // Populate user so tests can check `loggedBy.name`
  const populatedLog = await savedLog.populate('loggedBy', 'name email');
  return res.status(201).json(populatedLog);
};

const investorExists = async (investorId) => mongoose.isValidObjectId(investorId)
  && !!(await Investor.exists({ _id: investorId }));

// @desc    Log a new interaction for a project
// @route   POST /api/projects/:id/interactions
// @access  Private
exports.createInteractionLog = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, category } = req.body || {};

    // Validation
    if (!description || !category) {
      return res.status(400).json({ message: 'Description and category are required.' });
    }

    // Ensure project exists
    const projectExists = mongoose.isValidObjectId(id) && await InvestmentProject.findById(id);
    if (!projectExists) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // investor is set from the project by the model hook.
    const interactionLog = buildLog(req, res, { project: id });
    if (!interactionLog) return undefined;
    return await saveAndRespond(res, interactionLog);
  } catch (error) {
    return handleError(res, error);
  }
};

// @desc    Log an investor-level interaction (no project)
// @route   POST /api/interactions/investors/:investorId
// @access  Private (Staff: assigned investors only, via projectWriteAccess)
exports.createInvestorInteractionLog = async (req, res) => {
  try {
    const { investorId } = req.params;
    if (!(await investorExists(investorId))) {
      return res.status(404).json({ message: 'Investor not found.' });
    }

    const interactionLog = buildLog(req, res, { investor: investorId });
    if (!interactionLog) return undefined;
    return await saveAndRespond(res, interactionLog);
  } catch (error) {
    return handleError(res, error);
  }
};

// @desc    Get all interaction logs for a project
// @route   GET /api/projects/:id/interactions
// @access  Private
exports.getInteractionLogs = async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure project exists
    const projectExists = await InvestmentProject.findById(id);
    if (!projectExists) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    const interactionLogs = await InteractionLog.find({ project: id })
      .populate('loggedBy', 'name email');

    // Library files linked to each interaction (one query).
    return res.status(200).json(await withEvidenceFiles(sortByHappened(interactionLogs)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Investor timeline: investor-level logs plus logs of the investor's
//          projects (including logs not yet migrated to carry `investor`)
// @route   GET /api/interactions/investors/:investorId
// @access  Private
exports.getInvestorInteractionLogs = async (req, res) => {
  try {
    const { investorId } = req.params;
    if (!(await investorExists(investorId))) {
      return res.status(404).json({ message: 'Investor not found.' });
    }

    const projectIds = await InvestmentProject.find({ investor: investorId }).distinct('_id');
    const interactionLogs = await InteractionLog.find({
      $or: [{ investor: investorId }, { project: { $in: projectIds } }],
    })
      .populate('loggedBy', 'name email')
      .populate('project', 'projectTitle');

    // Library files linked to each interaction (one query).
    return res.status(200).json(await withEvidenceFiles(sortByHappened(interactionLogs)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Tag an interaction with SABER service codes / credit linkage, or
//          correct its happened date. Only serviceCodes, creditLinkage and
//          interactionDate change; every other field is ignored.
// @route   PATCH /api/interactions/:id
// @access  Private (Staff: interactions of assigned investors only)
exports.tagInteractionServices = async (req, res) => {
  try {
    if (hasOperatorKey(req.body)) {
      return res.status(400).json({ msg: 'Invalid update' });
    }

    const { id } = req.params;
    const log = mongoose.isValidObjectId(id)
      && await InteractionLog.findById(id).select('investor project').lean();
    if (!log) {
      return res.status(404).json({ message: 'Interaction not found.' });
    }

    // Same rule as project writes: Staff only for investors assigned to them.
    if (!(await canWriteInteraction(log, req.user))) {
      return res.status(403).json({ msg: DENIED_MSG });
    }

    const { serviceCodes, creditLinkage, interactionDate } = req.body || {};
    const codes = parseServiceCodes(serviceCodes);
    if (codes.error) return res.status(400).json({ message: codes.error });
    const credit = parseCreditLinkage(creditLinkage);
    if (credit.error) return res.status(400).json({ message: credit.error });
    const happened = parseHappenedDate(interactionDate, { label: 'Interaction date' });
    if (happened.error) return res.status(400).json({ message: happened.error });

    const update = {};
    if (codes.codes !== undefined) update.serviceCodes = codes.codes;
    if (credit.value !== undefined) update.creditLinkage = credit.value;
    if (happened.value !== undefined) update.interactionDate = happened.value;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Send serviceCodes, creditLinkage and/or interactionDate.' });
    }

    // $set of the whitelisted fields only; timestamps move updatedAt, never createdAt.
    const updated = await InteractionLog.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .populate('loggedBy', 'name email')
      .populate('project', 'projectTitle');

    return res.status(200).json(updated);
  } catch (error) {
    return handleError(res, error);
  }
};

// @desc    Get all interaction logs across all projects
// @route   GET /api/interactions
// @access  Private
exports.getAllInteractionLogs = async (req, res) => {
  try {
    const interactionLogs = await InteractionLog.find({})
      .populate('loggedBy', 'name email')
      .populate('project', 'projectTitle') // Populate project title for context
      .populate('investor', 'investorName');

    res.status(200).json(await withEvidenceFiles(sortByHappened(interactionLogs)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Delete one interaction (evidence). Written to the ChangeLog first;
//          if that fails, nothing is deleted. Reason is optional.
// @route   DELETE /api/interactions/:id
// @access  Private (Director-General, Portal-Admin)
exports.deleteInteractionLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = mongoose.isValidObjectId(id) && await InteractionLog.findById(id).lean();
    if (!log) {
      return res.status(404).json({ message: 'Interaction not found.' });
    }

    const { reason } = req.body || {};
    if (reason !== undefined && reason !== null && typeof reason !== 'string') {
      return res.status(400).json({ message: 'reason must be text.' });
    }
    const trimmed = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

    // Evidence library links to this interaction are removed (audited); the files stay.
    const links = await findLinksTo({ interactionIds: [log._id] });
    try {
      // Delete and unlink rows in one insert: all are written or none.
      await recordActionGroups(req, [
        ['delete', 'InteractionLog', [log]],
        ['unlink', 'EvidenceFile', unlinkSnapshots(links)],
      ], { reason: trimmed });
    } catch (auditError) {
      console.error('ChangeLog write failed; interaction delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }

    await pullLinks(links);
    await InteractionLog.deleteOne({ _id: log._id });
    return res.status(200).json({ deleted: { interactions: 1, ...(links.length > 0 && { evidenceLinks: links.length }) } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// Strips provider/key/resourceType: the API never returns them.
const publicDocument = (doc) => {
  const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  InteractionLog.INTERNAL_DOCUMENT_FIELDS.forEach((f) => { delete plain[f]; });
  return plain;
};

const findDocument = (log, docId) => (log.documents || [])
  .find((d) => String(d._id) === String(docId));

// Loads the interaction for a document write and applies the Staff assignment
// rule (same as Tag services). Sets req.interactionLog.
exports.loadWritableInteraction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const log = mongoose.isValidObjectId(id)
      && await InteractionLog.findById(id).select('investor project').lean();
    if (!log) {
      return res.status(404).json({ message: 'Interaction not found.' });
    }
    if (!(await canWriteInteraction(log, req.user))) {
      return res.status(403).json({ msg: DENIED_MSG });
    }
    req.interactionLog = log;
    return next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Server Error' });
  }
};

// @desc    Attach a privately stored document to an interaction (multipart `file`
//          plus optional `documentDate`). Runs after loadWritableInteraction,
//          requireStorage and singleDocument.
// @route   POST /api/interactions/:id/documents
// @access  Private (Staff: interactions of assigned investors only)
exports.uploadDocument = async (req, res) => {
  try {
    const log = req.interactionLog;
    const happened = parseHappenedDate(req.body && req.body.documentDate, { label: 'Document date' });
    if (happened.error) return res.status(400).json({ message: happened.error });

    const { originalname, mimetype, size, buffer } = req.file;
    let stored;
    try {
      stored = await documentStorage.upload(buffer, { fileName: originalname, mimeType: mimetype });
    } catch (storageError) {
      if (storageError.code === 'STORAGE_NOT_CONFIGURED') {
        return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
      }
      console.error('Document upload to storage failed:', storageError);
      return res.status(502).json({ message: 'The document could not be stored. Please try again.' });
    }

    const entry = {
      _id: new mongoose.Types.ObjectId(),
      fileName: originalname,
      mimeType: mimetype,
      size,
      documentDate: happened.value || new Date(),
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      provider: stored.provider,
      key: stored.key,
      resourceType: stored.resourceType,
    };

    let updated;
    try {
      updated = await InteractionLog.findByIdAndUpdate(
        log._id,
        { $push: { documents: entry } },
        { new: true, runValidators: true },
      );
      if (!updated) throw new Error('Interaction disappeared during upload');
    } catch (dbError) {
      // No broken reference: remove the stored file again.
      console.error('Saving the document entry failed; removing the stored file:', dbError);
      try { await documentStorage.remove(entry); } catch (cleanupError) {
        console.error('Could not remove the orphaned stored file:', entry.key, cleanupError);
      }
      return res.status(500).json({ message: 'Server Error' });
    }

    return res.status(201).json(publicDocument(updated.documents.id(entry._id)));
  } catch (error) {
    return handleError(res, error);
  }
};

// @desc    Short-lived signed link to open a private document.
// @route   GET /api/interactions/:id/documents/:docId/link
// @access  Private (all roles)
exports.getDocumentLink = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const log = mongoose.isValidObjectId(id) && await InteractionLog.findById(id).select('documents').lean();
    const doc = log && findDocument(log, docId);
    if (!doc) {
      return res.status(404).json({ message: 'Document not found.' });
    }
    if (!documentStorage.isConfigured()) {
      return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
    }
    try {
      const url = await documentStorage.signedUrl(doc, LINK_TTL_SECONDS);
      return res.status(200).json({
        url,
        expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
      });
    } catch (storageError) {
      console.error('Signing a document link failed:', storageError);
      return res.status(502).json({ message: 'Could not open the document. Please try again.' });
    }
  } catch (error) {
    return handleError(res, error);
  }
};

// @desc    Remove a wrongly attached document. The document entry is written to
//          the ChangeLog first (if that fails, nothing is removed), then the file
//          is deleted from storage, then the entry is pulled from documents[].
// @route   DELETE /api/interactions/:id/documents/:docId
// @access  Private (Director-General, Portal-Admin)
exports.deleteDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const log = mongoose.isValidObjectId(id) && await InteractionLog.findById(id).select('documents').lean();
    const doc = log && findDocument(log, docId);
    if (!doc) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    const { reason } = req.body || {};
    if (reason !== undefined && reason !== null && typeof reason !== 'string') {
      return res.status(400).json({ message: 'reason must be text.' });
    }
    const trimmed = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

    if (!documentStorage.isConfigured()) {
      return res.status(503).json({ message: documentStorage.NOT_CONFIGURED_MSG });
    }

    try {
      // entity InteractionLog, entityId = the interaction; the snapshot is the
      // document entry (with the interaction id it belonged to).
      await recordDeletions(req, 'InteractionLog', [{ _id: log._id, document: doc }], { reason: trimmed });
    } catch (auditError) {
      console.error('ChangeLog write failed; document removal aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was removed.' });
    }

    try {
      await documentStorage.remove(doc);
    } catch (storageError) {
      console.error('Removing the stored file failed; entry kept:', storageError);
      return res.status(502).json({ message: 'Could not remove the stored file. Please try again.' });
    }

    await InteractionLog.updateOne({ _id: log._id }, { $pull: { documents: { _id: doc._id } } });
    return res.status(200).json({ deleted: { documents: 1 } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
