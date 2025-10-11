const express = require('express');
const router = express.Router();
const { getDashboardKpis } = require('../controllers/adminController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/admin/dashboard-kpis
// @desc    Get dashboard KPIs for Director-General and Portal-Admin
// @access  Private (Director-General, Portal-Admin)
router.get('/dashboard-kpis', auth, authorize('Director-General', 'Portal-Admin'), getDashboardKpis);

module.exports = router;
