const LifecycleStatus = require('../models/LifecycleStatusModel');

// @desc    Get all lifecycle statuses
// @route   GET /api/lifecycle-status
// @access  Public
const getAllLifecycleStatuses = async (req, res) => {
  try {
    const statuses = await LifecycleStatus.find().sort('order');
    res.json(statuses);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Create a lifecycle status
// @route   POST /api/lifecycle-status
// @access  Private (Admin)
const createLifecycleStatus = async (req, res) => {
  const { name, description } = req.body;

  try {
    // Find the highest order value
    const lastStatus = await LifecycleStatus.findOne().sort({ order: -1 });
    const newOrder = lastStatus ? lastStatus.order + 1 : 1;

    const newStatus = new LifecycleStatus({
      name,
      description,
      order: newOrder,
    });

    const status = await newStatus.save();
    res.status(201).json(status);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Update a lifecycle status
// @route   PUT /api/lifecycle-status/:id
// @access  Private (Admin)
const updateLifecycleStatus = async (req, res) => {
  const { name, description, order } = req.body;

  // Build status object
  const statusFields = {};
  if (name) statusFields.name = name;
  if (description) statusFields.description = description;
  if (order) statusFields.order = order;

  try {
    let status = await LifecycleStatus.findById(req.params.id);

    if (!status) return res.status(404).json({ msg: 'Lifecycle status not found' });

    status = await LifecycleStatus.findByIdAndUpdate(
      req.params.id,
      { $set: statusFields },
      { new: true }
    );

    res.json(status);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Delete a lifecycle status
// @route   DELETE /api/lifecycle-status/:id
// @access  Private (Admin)
const deleteLifecycleStatus = async (req, res) => {
  try {
    const status = await LifecycleStatus.findById(req.params.id);

    if (!status) return res.status(404).json({ msg: 'Lifecycle status not found' });

    await LifecycleStatus.findByIdAndRemove(req.params.id);

    res.json({ msg: 'Lifecycle status removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Reorder lifecycle statuses
// @route   PUT /api/lifecycle-statuses/reorder
// @access  Private (Admin)
const reorderLifecycleStatuses = async (req, res) => {
  const { orderedIds } = req.body;

  if (!orderedIds || !Array.isArray(orderedIds)) {
    return res.status(400).json({ msg: 'Invalid payload: orderedIds must be an array.' });
  }

  try {
    const updatePromises = orderedIds.map((id, index) =>
      LifecycleStatus.updateOne({ _id: id }, { $set: { order: index } })
    );

    await Promise.all(updatePromises);

    res.json({ msg: 'Lifecycle statuses reordered successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getAllLifecycleStatuses,
  createLifecycleStatus,
  updateLifecycleStatus,
  deleteLifecycleStatus,
  reorderLifecycleStatuses,
};