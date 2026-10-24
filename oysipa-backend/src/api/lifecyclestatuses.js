const express = require('express');
const router = express.Router();
const lifecycleStatusController = require('../controllers/lifecycleStatusController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/lifecycle-statuses
// @desc    Get all lifecycle statuses
// @access  Public
router.get('/', lifecycleStatusController.getAllLifecycleStatuses);

// @route   POST api/lifecycle-statuses
// @desc    Create a new lifecycle status
// @access  Private (DG / Portal-Admin)
router.post('/', auth, authorize('Director-General', 'Portal-Admin'), lifecycleStatusController.createLifecycleStatus);

// @route   PUT api/lifecycle-statuses/reorder
// @desc    Reorder lifecycle statuses (registered before /:id so it is not shadowed)
// @access  Private (DG / Portal-Admin)
router.put('/reorder', auth, authorize('Director-General', 'Portal-Admin'), lifecycleStatusController.reorderLifecycleStatuses);

// @route   PUT api/lifecycle-statuses/:id
// @desc    Update a lifecycle status
// @access  Private (DG / Portal-Admin)
router.put('/:id', auth, authorize('Director-General', 'Portal-Admin'), lifecycleStatusController.updateLifecycleStatus);

// @route   DELETE api/lifecycle-statuses/:id
// @desc    Delete a lifecycle status
// @access  Private (DG / Portal-Admin)
router.delete('/:id', auth, authorize('Director-General', 'Portal-Admin'), lifecycleStatusController.deleteLifecycleStatus);

module.exports = router;