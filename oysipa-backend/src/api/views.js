const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const views = require('../controllers/savedViewController');

// Saved list views (story 11.15). All roles; ownership and sharing are checked
// in the controller (Staff cannot share; DG/PA manage shared views).
const router = express.Router();
const canUse = authorize('Director-General', 'Portal-Admin', 'Staff');

router.get('/', auth, canUse, views.listViews);
router.post('/', auth, canUse, views.createView);
router.put('/:id', auth, canUse, views.updateView);
router.delete('/:id', auth, canUse, views.deleteView);

module.exports = router;
