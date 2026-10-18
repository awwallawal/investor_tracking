const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');

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

    let { lifecycleStatus } = req.body;
    if (!lifecycleStatus) {
        const defaultStatus = await LifecycleStatus.findOne({ name: 'Initial Interest' });
        if (!defaultStatus) {
            return res.status(400).json({ error: 'Default lifecycle status "Initial Interest" not found.' });
        }
        lifecycleStatus = defaultStatus._id;
    }

    const projectData = {
      ...req.body,
      investor: investorId,
      lifecycleStatus,
    };

    const project = new InvestmentProject(projectData);
    await project.save();

    // Populate investor so test assertions work
    const populatedProject = await project.populate('investor', 'name email');

    res.status(201).json(populatedProject);
  } catch (error) {
    res.status(400).json({ error: error.message });
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

    const oldStatusId = projectToUpdate.lifecycleStatus.toString();
    const newStatusId = req.body.lifecycleStatus;

    // Update the project first
    const updatedProject = await InvestmentProject.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('investor', 'investorName').populate('lifecycleStatus');

    // If the stage changed, create a system log entry
    if (newStatusId && oldStatusId !== newStatusId) {
      const oldStatus = await LifecycleStatus.findById(oldStatusId);
      const newStatus = await LifecycleStatus.findById(newStatusId);
      
      const logDescription = `Lifecycle status changed from "${oldStatus.name}" to "${newStatus.name}"`;
      const interactionLog = new InteractionLog({
        project: req.params.id,
        loggedBy: req.user.id,
        description: logDescription,
        category: 'System Update',
      });
      await interactionLog.save();
    }

    res.status(200).json(updatedProject);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// @desc    Update a project's lifecycle status
// @route   PUT /api/projects/:id/status
// @access  Private
exports.updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { lifecycleStatus } = req.body;

    if (!lifecycleStatus) {
      return res.status(400).json({ msg: 'Lifecycle status is required' });
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
      const oldStatus = await LifecycleStatus.findById(oldStatusId);
      const newStatus = await LifecycleStatus.findById(lifecycleStatus);

      const logDescription = `Lifecycle status changed from "${oldStatus.name}" to "${newStatus.name}"`;
      const interactionLog = new InteractionLog({
        project: id,
        loggedBy: req.user.id, // Assuming req.user.id is available from auth middleware
        description: logDescription,
        category: 'System Update',
      });
      await interactionLog.save();
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