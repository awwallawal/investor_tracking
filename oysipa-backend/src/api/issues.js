const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const issues = require('../controllers/issueController');
const { requireStorage, singleDocument } = require('../middleware/documentUpload');

const router = express.Router();
const canRead = authorize('Director-General', 'Portal-Admin', 'Staff');
const adminOnly = authorize('Director-General', 'Portal-Admin');

// Investor issues register (story 11.7). Reads: all roles. Writes (register,
// edit / status / resolve, actions, files): all roles, Staff only for investors
// assigned to them (checked in the controller: it needs the issue's investor).
// Delete: DG/Admin, reason required.
router.get('/', auth, canRead, issues.listIssues);
router.post('/', auth, canRead, issues.createIssue);
router.get('/:id', auth, canRead, issues.getIssue);
router.put('/:id', auth, canRead, issues.issueWriteAccess, issues.updateIssue);
router.post('/:id/actions', auth, canRead, issues.issueWriteAccess, issues.addAction);
router.get('/:id/files', auth, canRead, issues.listFiles);
router.post('/:id/files', auth, canRead, issues.issueWriteAccess, requireStorage, singleDocument, issues.uploadFile);
router.delete('/:id', auth, adminOnly, issues.deleteIssue);

module.exports = router;
