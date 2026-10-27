const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { exportList } = require('../controllers/exportController');

// CSV export of a list view (story 11.15). Every role exports what it can
// list; the change log export is DG/Admin only (checked in the controller).
// Each export writes a ChangeLog `export` row first.
const router = express.Router();
router.get('/:list', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), exportList);

module.exports = router;
