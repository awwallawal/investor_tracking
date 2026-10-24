const express = require('express');
const router = express.Router();
const { listChangeLog, changeLogHealth } = require('../controllers/changeLogController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Story 11.10: read-only. No route edits or deletes a ChangeLog row.

// @route   GET api/changelog/health
// @desc    Audit write failures since the server started
// @access  Private (Director-General, Portal-Admin)
router.get('/health', auth, authorize('Director-General', 'Portal-Admin'), changeLogHealth);

// @route   GET api/changelog?entity=&action=&entityId=&from=&to=&page=
// @desc    ChangeLog rows, newest first, 50 per page
// @access  Private (Director-General, Portal-Admin)
router.get('/', auth, authorize('Director-General', 'Portal-Admin'), listChangeLog);

module.exports = router;
