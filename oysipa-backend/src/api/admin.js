const express = require('express');
const router = express.Router();
const { getDashboardKpis } = require('../controllers/adminController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/admin/dashboard-kpis
// @desc    Get dashboard KPIs for Director-General
// @access  Private (Director-General)
router.get('/dashboard-kpis', auth, authorize('Director-General'), getDashboardKpis);

module.exports = router;
