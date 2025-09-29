const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Assuming auth middleware exists
const staffController = require('../controllers/staffController'); // Will create this next

// @route   GET /api/staff/dashboard
// @desc    Get staff dashboard data (assigned projects)
// @access  Private (Staff only)
router.get('/dashboard', auth, staffController.getStaffDashboard);

module.exports = router;