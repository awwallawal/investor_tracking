const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const projectWriteAccess = require('../middleware/projectWriteAccess');
const projectController = require('../controllers/projectController');
const interactionLogController = require('../controllers/interactionLogController'); // Import interactionLogController

// Reads: all roles. Writes: DG and Portal-Admin on any project; Staff only on
// projects whose investor is assigned to them (see projectWriteAccess).
const canRead = authorize('Director-General', 'Portal-Admin', 'Staff');
const canWrite = [canRead, projectWriteAccess];

// Get all projects, optionally filtered by lifecycleStatus
router.get('/', auth, canRead, projectController.getProjects);

// Create Project for a specific Investor
router.post('/investors/:investorId/projects', auth, ...canWrite, projectController.createProject);

// Get all Projects for a specific Investor
router.get('/investors/:investorId/projects', auth, canRead, projectController.getProjectsByInvestor);

// Get a single Project by ID
router.get('/:id', auth, canRead, projectController.getProjectById);

// Update a Project by ID
router.put('/:id', auth, ...canWrite, projectController.updateProject);

// Update a Project's lifecycle status by ID
router.put('/:id/status', auth, ...canWrite, projectController.updateProjectStatus);

// Interaction Log Routes for a specific project
router.post('/:id/interactions', auth, ...canWrite, interactionLogController.createInteractionLog);
router.get('/:id/interactions', auth, canRead, interactionLogController.getInteractionLogs);

module.exports = router;
