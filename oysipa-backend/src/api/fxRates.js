const express = require('express');
const router = express.Router();
const { listFxRates, createFxRate } = require('../controllers/analyticsController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/fx-rates
// @desc    Exchange rates: latest per currency, out-of-date flags, history (11.14)
// @access  Private (all roles)
router.get('/', auth, listFxRates);

// @route   POST api/fx-rates { currency, rate, asOf, source }
// @desc    Add a dated rate (audited, Setting fxRates)
// @access  Private (Director-General, Portal-Admin)
router.post('/', auth, authorize('Director-General', 'Portal-Admin'), createFxRate);

module.exports = router;
