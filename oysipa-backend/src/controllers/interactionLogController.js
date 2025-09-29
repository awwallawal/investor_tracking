const InteractionLog = require('../models/InteractionLog');
const InvestmentProject = require('../models/InvestmentProject');

// @desc    Log a new interaction for a project
// @route   POST /api/projects/:id/interactions
// @access  Private
exports.createInteractionLog = async (req, res) => {
  try {
    const { description, category, documentUrl } = req.body;
    const { id } = req.params;

    // Validation
    if (!description || !category) {
      return res.status(400).json({ message: 'Description and category are required.' });
    }

    // Ensure project exists
    const projectExists = await InvestmentProject.findById(id);
    if (!projectExists) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    const interactionLog = new InteractionLog({
      project: id,
      loggedBy: req.user.id, // comes from auth middleware
      description,
      category,
      documentUrl,
    });

    const savedLog = await interactionLog.save();

    // Populate user so tests can check `loggedBy.name`
    const populatedLog = await savedLog.populate('loggedBy', 'name email');

    res.status(201).json(populatedLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
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

    res.status(200).json(interactionLogs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
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
      .populate('project', 'projectTitle'); // Populate project title for context

    res.status(200).json(interactionLogs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};