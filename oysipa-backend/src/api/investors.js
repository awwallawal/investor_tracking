const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const investorWriteAccess = require('../middleware/investorWriteAccess');

// POST new investor. DG/Admin: any assignment. Staff: auto-assigned to themselves.
router.post('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorWriteAccess, investorController.createInvestor);

// GET all investors (all roles)
router.get('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorController.getAllInvestors);

// GET a single investor by ID (all roles)
router.get('/:id', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorController.getInvestorById);

// UPDATE an investor. DG/Admin: any. Staff: only investors assigned to them,
// and never the assignment itself (see investorWriteAccess).
router.put('/:id', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorWriteAccess, investorController.updateInvestor);

module.exports = router;
