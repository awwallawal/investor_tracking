const express = require('express');
const router = express.Router();
const { getMdas, updateMouMdas } = require('../controllers/mdaController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// @route   GET api/mdas
// @desc    Oyo MDA reference list with MoU flags (story 11.7c)
// @access  Private (all roles)
router.get('/', auth, getMdas);

// @route   PUT api/mdas/mou
// @desc    Set the MoU MDAs { codes: [...] }
// @access  Private (Director-General, Portal-Admin)
router.put('/mou', auth, authorize('Director-General', 'Portal-Admin'), updateMouMdas);

module.exports = router;
