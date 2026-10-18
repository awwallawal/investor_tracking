const mongoose = require('mongoose');
const InteractionLog = require('../models/InteractionLog');
const InvestmentProject = require('../models/InvestmentProject');
const Investor = require('../models/InvestorModel');
const { SERVICE_CODES } = require('../constants/serviceCodes');
const { isAdminRole, isAssignedTo, hasOperatorKey } = require('../middleware/accessHelpers');
const { DENIED_MSG } = require('../middleware/projectWriteAccess');
const { recordDeletions } = require('../utils/recordDeletion');

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
  const { description, category, documentUrl, serviceCodes, creditLinkage } = req.body || {};

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

  return new InteractionLog({
    ...target,
    loggedBy: req.user.id, // comes from auth middleware
    description,
    category,
    documentUrl,
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
      .sort({ createdAt: -1 }) // newest first
      .populate('loggedBy', 'name email');

    return res.status(200).json(interactionLogs);
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
      .sort({ createdAt: -1 }) // newest first
      .populate('loggedBy', 'name email')
      .populate('project', 'projectTitle');

    return res.status(200).json(interactionLogs);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Tag an interaction with SABER service codes / credit linkage.
//          Only serviceCodes and creditLinkage change; every other field is ignored.
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
    if (!isAdminRole(req.user.role)) {
      // A project-linked log follows the project's current investor; the stored
      // investor is used only when there is no project or it is gone.
      let investorId = log.investor;
      if (log.project) {
        const project = await InvestmentProject.findById(log.project).select('investor').lean();
        if (project && project.investor) investorId = project.investor;
      }
      if (req.user.role !== 'Staff' || !investorId || !(await isAssignedTo(investorId, req.user._id))) {
        return res.status(403).json({ msg: DENIED_MSG });
      }
    }

    const { serviceCodes, creditLinkage } = req.body || {};
    const codes = parseServiceCodes(serviceCodes);
    if (codes.error) return res.status(400).json({ message: codes.error });
    const credit = parseCreditLinkage(creditLinkage);
    if (credit.error) return res.status(400).json({ message: credit.error });

    const update = {};
    if (codes.codes !== undefined) update.serviceCodes = codes.codes;
    if (credit.value !== undefined) update.creditLinkage = credit.value;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Send serviceCodes and/or creditLinkage.' });
    }

    // $set of the two whitelisted fields only; timestamps move updatedAt.
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
      .sort({ createdAt: -1 }) // newest first
      .populate('loggedBy', 'name email')
      .populate('project', 'projectTitle') // Populate project title for context
      .populate('investor', 'investorName');

    res.status(200).json(interactionLogs);
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

    try {
      await recordDeletions(req, 'InteractionLog', [log], { reason: trimmed });
    } catch (auditError) {
      console.error('ChangeLog write failed; interaction delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }

    await InteractionLog.deleteOne({ _id: log._id });
    return res.status(200).json({ deleted: { interactions: 1 } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
