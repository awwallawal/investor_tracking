const express = require('express');
const router = express.Router();
const { getDashboardKpis, getIssuesMetric, getAnnouncementsMetric } = require('../controllers/adminController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/admin/dashboard-kpis
// @desc    Get dashboard KPIs for Director-General and Portal-Admin
// @access  Private (Director-General, Portal-Admin)
router.get('/dashboard-kpis', auth, authorize('Director-General', 'Portal-Admin'), getDashboardKpis);

// @route   GET api/admin/issues-metric?year=
// @desc    Resolved share of investor issues for a year (DLR 4.5)
// @access  Private (Director-General, Portal-Admin)
router.get('/issues-metric', auth, authorize('Director-General', 'Portal-Admin'), getIssuesMetric);

// @route   GET api/admin/announcements-metric?year=
// @desc    OYSIPA-named investment announcements for a year (DLR 4.4)
// @access  Private (Director-General, Portal-Admin)
router.get('/announcements-metric', auth, authorize('Director-General', 'Portal-Admin'), getAnnouncementsMetric);

module.exports = router;
