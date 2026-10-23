const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const investorWriteAccess = require('../middleware/investorWriteAccess');
const importController = require('../controllers/investorImportController');

const adminOnly = authorize('Director-General', 'Portal-Admin');

// POST new investor. DG/Admin: any assignment. Staff: auto-assigned to themselves.
router.post('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorWriteAccess, investorController.createInvestor);

// GET all investors (all roles)
router.get('/', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorController.getAllInvestors);

// Import investors (story 11.11), DG/Admin only. Registered before /:id.
// Dry run writes nothing; run needs `confirm` = "IMPORT <n>".
router.post('/import/dry-run', auth, adminOnly, importController.importFile, importController.dryRun);
router.post('/import/run', auth, adminOnly, importController.importFile, importController.run);

// GET a single investor by ID (all roles)
router.get('/:id', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorController.getInvestorById);

// UPDATE an investor. DG/Admin: any. Staff: only investors assigned to them,
// and never the assignment itself (see investorWriteAccess).
router.put('/:id', auth, authorize('Director-General', 'Portal-Admin', 'Staff'), investorWriteAccess, investorController.updateInvestor);

// DELETE an investor with its projects and interactions. DG/Admin only; a
// reason is required and every deleted document goes to the ChangeLog first.
router.delete('/:id', auth, authorize('Director-General', 'Portal-Admin'), investorController.deleteInvestor);

module.exports = router;
