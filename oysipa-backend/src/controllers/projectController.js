const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const { parseHappenedDate, stripTimestamps } = require('../utils/happenedDate');

// Pulls statusChangeDate out of the body (it is not a project field: it becomes
// the System Update log's interactionDate). Returns { value } or { error }.
const takeStatusChangeDate = (body) => {
  const raw = body ? body.statusChangeDate : undefined;
  if (body) delete body.statusChangeDate;
  return parseHappenedDate(raw, { label: 'Status change date' });
};

// Validates body.dateRegistered in place (create: empty -> today; update: empty
// -> leave the stored date). Returns an error message or null.
const applyDateRegistered = (body, { isCreate }) => {
  const parsed = parseHappenedDate(body.dateRegistered, { label: 'Date registered' });
  if (parsed.error) return parsed.error;
  if (parsed.value !== undefined) {
    body.dateRegistered = parsed.value;
  } else if (isCreate) {
    body.dateRegistered = new Date();
  } else {
    delete body.dateRegistered;
  }
  return null;
};

const systemUpdateLog = async ({ projectId, userId, oldStatusId, newStatusId, happenedAt }) => {
  const oldStatus = await LifecycleStatus.findById(oldStatusId);
  const newStatus = await LifecycleStatus.findById(newStatusId);
  const logDescription = `Lifecycle status changed from "${oldStatus.name}" to "${newStatus.name}"`;
  const interactionLog = new InteractionLog({
    project: projectId,
    loggedBy: userId,
    description: logDescription,
    category: 'System Update',
    // Effective date of the change (officer-entered), today when left empty.
    interactionDate: happenedAt || new Date(),
  });
  await interactionLog.save();
};

// @desc    Get all projects, optionally filtered by lifecycleStatus
// @route   GET /api/projects
// @access  Private
exports.getProjects = async (req, res) => {
  try {
    const { lifecycleStatus } = req.query;
    const filter = {};

    if (lifecycleStatus) {
      const statusDoc = await LifecycleStatus.findOne({ name: lifecycleStatus });
      if (statusDoc) {
        filter.lifecycleStatus = statusDoc._id;
      } else {
        // If a status is provided but not found, return no projects.
        return res.status(200).json([]);
      }
    }

    const projects = await InvestmentProject.find(filter)
      .populate('investor', 'investorName')
      .populate('lifecycleStatus');

    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Create a new project for an investor
// @route   POST /api/projects/:investorId
// @access  Private
exports.createProject = async (req, res) => {
  try {
    const { investorId } = req.params;

    // No orphan projects: the investor must exist. A malformed id falls through
    // to the existing 400 path (the cast error on save).
    if (mongoose.isValidObjectId(investorId) && !(await Investor.exists({ _id: investorId }))) {
      return res.status(404).json({ msg: 'Investor not found' });
    }

    // createdAt/updatedAt are server-set; client values are ignored.
    const body = stripTimestamps({ ...(req.body || {}) });
    delete body.statusChangeDate;
    const dateError = applyDateRegistered(body, { isCreate: true });
    if (dateError) return res.status(400).json({ message: dateError });

    let { lifecycleStatus } = body;
    if (!lifecycleStatus) {
        const defaultStatus = await LifecycleStatus.findOne({ name: 'Initial Interest' });
        if (!defaultStatus) {
            return res.status(400).json({ error: 'Default lifecycle status "Initial Interest" not found.' });
        }
        lifecycleStatus = defaultStatus._id;
    }

    const projectData = {
      ...body,
      investor: investorId,
      lifecycleStatus,
    };

    const project = new InvestmentProject(projectData);
    await project.save();

    // Populate investor so test assertions work
    const populatedProject = await project.populate('investor', 'name email');

    return res.status(201).json(populatedProject);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// @desc    Get all projects for an investor
// @route   GET /api/projects/:investorId
// @access  Private
exports.getProjectsByInvestor = async (req, res) => {
  try {
    const { investorId } = req.params;

    const projects = await InvestmentProject.find({ investor: investorId })
      .populate('investor', 'investorName')
      .populate('lifecycleStatus')
      .populate('assignedTo', 'name email');

    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get a single project by ID
// @route   GET /api/projects/:id
// @access  Private
exports.getProjectById = async (req, res) => {
  try {
    const project = await InvestmentProject.findById(req.params.id)
      .populate('investor') // Populate all investor details
      .populate('lifecycleStatus') // Populate lifecycle status details
      .populate('assignedTo', 'name email'); // Populate assignedTo with name and email

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.status(200).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Update a project
// @route   PUT /api/projects/:id
// @access  Private
exports.updateProject = async (req, res) => {
  try {
    const projectToUpdate = await InvestmentProject.findById(req.params.id);

    if (!projectToUpdate) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // No orphan projects: a new investor reference must exist. A malformed id
    // falls through to the existing 400 path (the cast error on update).
    const bodyInvestor = req.body && req.body.investor;
    if (bodyInvestor !== undefined && bodyInvestor !== null && bodyInvestor !== '') {
      const target = typeof bodyInvestor === 'object' && bodyInvestor._id ? bodyInvestor._id : bodyInvestor;
      if (mongoose.isValidObjectId(target) && !(await Investor.exists({ _id: target }))) {
        return res.status(404).json({ msg: 'Investor not found' });
      }
    }

    // createdAt/updatedAt are server-set; client values are ignored.
    const body = stripTimestamps({ ...(req.body || {}) });
    const statusChange = takeStatusChangeDate(body);
    if (statusChange.error) return res.status(400).json({ message: statusChange.error });
    const dateError = applyDateRegistered(body, { isCreate: false });
    if (dateError) return res.status(400).json({ message: dateError });

    const oldStatusId = projectToUpdate.lifecycleStatus.toString();
    const newStatusId = body.lifecycleStatus;

    // Update the project first
    const updatedProject = await InvestmentProject.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    ).populate('investor', 'investorName').populate('lifecycleStatus');

    // Project moved to another investor: its logs follow it (timelines, tag access).
    const oldInvestorId = projectToUpdate.investor ? projectToUpdate.investor.toString() : null;
    const newInvestorId = updatedProject.investor ? updatedProject.investor._id.toString() : null;
    if (newInvestorId && newInvestorId !== oldInvestorId) {
      await InteractionLog.updateMany(
        { project: req.params.id },
        { $set: { investor: newInvestorId } },
        { timestamps: false },
      );
    }

    // If the stage changed, create a system log entry
    if (newStatusId && oldStatusId !== String(newStatusId)) {
      await systemUpdateLog({
        projectId: req.params.id,
        userId: req.user.id,
        oldStatusId,
        newStatusId,
        happenedAt: statusChange.value,
      });
    }

    return res.status(200).json(updatedProject);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// @desc    Update a project's lifecycle status
// @route   PUT /api/projects/:id/status
// @access  Private
exports.updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { lifecycleStatus } = req.body || {};

    if (!lifecycleStatus) {
      return res.status(400).json({ msg: 'Lifecycle status is required' });
    }
    const statusChange = parseHappenedDate(req.body.statusChangeDate, { label: 'Status change date' });
    if (statusChange.error) {
      return res.status(400).json({ message: statusChange.error });
    }

    const project = await InvestmentProject.findById(id);

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const oldStatusId = project.lifecycleStatus.toString();
    project.lifecycleStatus = lifecycleStatus;
    await project.save();

    // Create an interaction log if status changed
    if (oldStatusId !== lifecycleStatus) {
      await systemUpdateLog({
        projectId: id,
        userId: req.user.id,
        oldStatusId,
        newStatusId: lifecycleStatus,
        happenedAt: statusChange.value,
      });
    }

    const updatedProject = await InvestmentProject.findById(id)
      .populate('investor')
      .populate('lifecycleStatus')
      .populate('assignedTo', 'name email');

    res.status(200).json(updatedProject);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ msg: 'Server Error' });
  }
};