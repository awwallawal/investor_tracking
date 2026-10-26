const express = require('express');
const router = express.Router();
const { listSectors } = require('../controllers/analyticsController');
const auth = require('../middleware/auth');

// @route   GET api/sectors
// @desc    The sector list (priority sectors flagged) (story 11.14)
// @access  Private (all roles)
router.get('/', auth, listSectors);

module.exports = router;
