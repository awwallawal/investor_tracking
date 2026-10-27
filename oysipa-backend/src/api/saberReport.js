const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { getSaberReport, downloadSaberReport } = require('../controllers/saberReportController');

// SABER report / verifier export (story 11.9). DG / Portal-Admin only; never
// public (the files hold investor contact details).
const router = express.Router();

// @route   GET api/saber-report?year=YYYY|all   (summary, no personal data)
router.get('/', auth, authorize('Director-General', 'Portal-Admin'), getSaberReport);

// @route   GET api/saber-report/download?year=YYYY|all&part=completeness|services|credit|announcements|issues|pdf|all
router.get('/download', auth, authorize('Director-General', 'Portal-Admin'), downloadSaberReport);

module.exports = router;
