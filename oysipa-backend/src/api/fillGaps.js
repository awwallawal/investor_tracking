const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { getFillGaps } = require('../controllers/fillGapsController');

// Fill the gaps (story 11.17): the T1–T11 worklist. Read-only, every role.
// Fixes go through PUT /api/projects/:id, PUT /api/investors/:id and
// PATCH /api/interactions/:id (their access rules and audit trail).
const router = express.Router();

// @route   GET api/fill-gaps?year=&officer=&missing=&q=   (count=1: the count only)
router.get('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), getFillGaps);

module.exports = router;
