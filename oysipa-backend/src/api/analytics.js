const express = require('express');
const router = express.Router();
const { getOverview, getMine } = require('../controllers/analyticsController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/analytics/overview?year=YYYY|all
// @desc    DG dashboard: headline, year on year, breakdowns, SABER (story 11.14)
// @access  Private (Director-General, Portal-Admin)
router.get('/overview', auth, authorize('Director-General', 'Portal-Admin'), getOverview);

// @route   GET api/analytics/mine
// @desc    "My work": Staff see their assigned investors only
// @access  Private (all roles)
router.get('/mine', auth, getMine);

module.exports = router;
