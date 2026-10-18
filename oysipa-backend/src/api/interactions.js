const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const projectWriteAccess = require('../middleware/projectWriteAccess');
const interactionLogController = require('../controllers/interactionLogController');

const canRead = authorize('Director-General', 'Portal-Admin', 'Staff');

// Get all interaction logs across all projects
router.get('/', auth, interactionLogController.getAllInteractionLogs);

// Investor-level interactions (no project needed). Staff write only for
// investors assigned to them (projectWriteAccess resolves :investorId).
router.post('/investors/:investorId', auth, canRead, projectWriteAccess, interactionLogController.createInvestorInteractionLog);
router.get('/investors/:investorId', auth, canRead, interactionLogController.getInvestorInteractionLogs);

// Tag services: edits only serviceCodes / creditLinkage. The Staff-assigned
// rule is checked in the controller (it needs the log's investor).
router.patch('/:id', auth, canRead, interactionLogController.tagInteractionServices);

// Delete one interaction. DG/Admin only; written to the ChangeLog first.
router.delete('/:id', auth, authorize('Director-General', 'Portal-Admin'), interactionLogController.deleteInteractionLog);

module.exports = router;
