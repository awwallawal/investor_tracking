const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const projectWriteAccess = require('../middleware/projectWriteAccess');
const interactionLogController = require('../controllers/interactionLogController');
const { requireStorage, singleDocument } = require('../middleware/documentUpload');

const canRead = authorize('Director-General', 'Portal-Admin', 'Staff');

// Get all interaction logs across all projects (filters: story 11.15)
router.get('/', auth, canRead, interactionLogController.getAllInteractionLogs);

// Investor-level interactions (no project needed). Staff write only for
// investors assigned to them (projectWriteAccess resolves :investorId).
router.post('/investors/:investorId', auth, canRead, projectWriteAccess, interactionLogController.createInvestorInteractionLog);
router.get('/investors/:investorId', auth, canRead, interactionLogController.getInvestorInteractionLogs);

// Tag services: edits only serviceCodes / creditLinkage. The Staff-assigned
// rule is checked in the controller (it needs the log's investor).
router.patch('/:id', auth, canRead, interactionLogController.tagInteractionServices);

// Private documents (FR-Y19). Upload: Staff only for interactions of investors
// assigned to them (same rule as Tag services). Link: any logged-in role.
router.post('/:id/documents', auth, canRead, interactionLogController.loadWritableInteraction, requireStorage, singleDocument, interactionLogController.uploadDocument);
router.get('/:id/documents/:docId/link', auth, canRead, interactionLogController.getDocumentLink);
// Remove a wrongly attached document. DG/Admin only; ChangeLog row first.
router.delete('/:id/documents/:docId', auth, authorize('Director-General', 'Portal-Admin'), interactionLogController.deleteDocument);

// Delete one interaction. DG/Admin only; written to the ChangeLog first.
router.delete('/:id', auth, authorize('Director-General', 'Portal-Admin'), interactionLogController.deleteInteractionLog);

module.exports = router;
