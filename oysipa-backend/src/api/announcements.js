const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const announcements = require('../controllers/announcementController');
const { requireStorage, singleDocument } = require('../middleware/documentUpload');

const router = express.Router();
const canRead = authorize('Director-General', 'Portal-Admin', 'Staff');
const adminOnly = authorize('Director-General', 'Portal-Admin');
const canWrite = [canRead, announcements.announcementWriteAccess];

// Announcements register (story 11.8). Reads: all roles. Writes (register,
// edit, link interactions, files): all roles, Staff only on projects whose
// investor is assigned to them (checked in the controller). Delete: DG/Admin,
// reason required.
router.get('/', auth, canRead, announcements.listAnnouncements);
router.post('/', auth, canRead, announcements.createAnnouncement);
router.get('/:id', auth, canRead, announcements.getAnnouncement);
router.put('/:id', auth, ...canWrite, announcements.updateAnnouncement);
router.post('/:id/interactions', auth, ...canWrite, announcements.linkInteractions);
router.delete('/:id/interactions/:interactionId', auth, ...canWrite, announcements.unlinkInteraction);
router.get('/:id/files', auth, canRead, announcements.listFiles);
router.post('/:id/files', auth, ...canWrite, requireStorage, singleDocument, announcements.uploadFile);
router.delete('/:id', auth, adminOnly, announcements.deleteAnnouncement);

module.exports = router;
