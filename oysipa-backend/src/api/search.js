const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { search } = require('../controllers/searchController');

// Global search (story 11.15). All roles; only lists every role can read are
// searched (never the change log).
const router = express.Router();
router.get('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), search);

module.exports = router;
