
const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');
const auth = require('../middleware/auth'); // Assuming you have an auth middleware
const authorize = require('../middleware/authorize');

router.post('/', auth, authorize(['Director-General', 'Portal-Admin']), investorController.createInvestor);
router.get('/', auth, authorize(['Director-General', 'Portal-Admin']), investorController.getAllInvestors);
router.get('/:id', auth, authorize(['Director-General', 'Portal-Admin']), investorController.getInvestorById);
router.put('/:id', auth, authorize(['Director-General', 'Portal-Admin']), investorController.updateInvestor);

module.exports = router;
