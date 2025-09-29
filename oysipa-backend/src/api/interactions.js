const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const interactionLogController = require('../controllers/interactionLogController');

// Get all interaction logs across all projects
router.get('/', auth, interactionLogController.getAllInteractionLogs);

module.exports = router;
