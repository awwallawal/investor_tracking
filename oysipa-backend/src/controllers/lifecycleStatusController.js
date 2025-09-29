const LifecycleStatus = require('../models/LifecycleStatusModel');

// @desc    Get all lifecycle statuses
// @route   GET /api/lifecyclestatuses
// @access  Private
exports.getAllLifecycleStatuses = async (req, res) => {
  try {
    const statuses = await LifecycleStatus.find({}).sort({ order: 1 });
    res.status(200).json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
