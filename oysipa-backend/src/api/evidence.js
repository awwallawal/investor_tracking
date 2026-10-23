const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const evidence = require('../controllers/evidenceController');
const { requireStorage, singleDocument } = require('../middleware/documentUpload');

const router = express.Router();
const canRead = authorize('Director-General', 'Portal-Admin', 'Staff');
const adminOnly = authorize('Director-General', 'Portal-Admin');

// Evidence library. Reads: all roles. Folder writes, uploads, unlink and file
// delete: DG/Admin. Link (tagging): all roles, Staff only for investors
// assigned to them (checked in the controller, it needs the body's investor).
router.get('/untagged-count', auth, canRead, evidence.getUntaggedCount);
router.get('/folders', auth, canRead, evidence.getFolders);
router.post('/folders', auth, adminOnly, evidence.createFolder);
router.put('/folders/:id', auth, adminOnly, evidence.updateFolder);
router.get('/folders/:id/files', auth, canRead, evidence.getFolderFiles);
router.post('/folders/:id/files', auth, adminOnly, evidence.loadFolder, requireStorage, singleDocument, evidence.uploadFile);
router.get('/files/:id/link', auth, canRead, evidence.getFileLink);
router.post('/files/:id/links', auth, canRead, evidence.addLink);
router.delete('/files/:id/links/:linkId', auth, adminOnly, evidence.removeLink);
router.delete('/files/:id', auth, adminOnly, evidence.deleteFile);

module.exports = router;
