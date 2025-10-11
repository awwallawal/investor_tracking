const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// POST new investor (restricted)
router.post('/', auth, authorize('Director-General', 'Portal-Admin'), investorController.createInvestor);

// GET all investors (all roles)
router.get('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorController.getAllInvestors);

// GET a single investor by ID (all roles)
router.get('/:id', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorController.getInvestorById);

// UPDATE an investor (restricted)
router.put('/:id', auth, authorize('Director-General', 'Portal-Admin'), investorController.updateInvestor);

module.exports = router;
