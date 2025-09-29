const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const lifecycleStatusController = require('../controllers/lifecycleStatusController');

router.get('/', auth, lifecycleStatusController.getAllLifecycleStatuses);

module.exports = router;
