
const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');

router.post('/', investorController.createInvestor);
router.get('/', investorController.getAllInvestors);
router.get('/:id', investorController.getInvestorById);
router.put('/:id', investorController.updateInvestor);

module.exports = router;
