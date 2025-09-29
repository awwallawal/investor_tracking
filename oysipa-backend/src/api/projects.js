const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const projectController = require('../controllers/projectController');
const interactionLogController = require('../controllers/interactionLogController'); // Import interactionLogController

// Get all projects, optionally filtered by lifecycleStatus
router.get('/', auth, projectController.getProjects);

// Create Project for a specific Investor
router.post('/investors/:investorId/projects', auth, projectController.createProject);

// Get all Projects for a specific Investor
router.get('/investors/:investorId/projects', auth, projectController.getProjectsByInvestor);

// Get a single Project by ID
router.get('/:id', auth, projectController.getProjectById);

// Update a Project by ID
router.put('/:id', auth, projectController.updateProject);

// Update a Project's lifecycle status by ID
router.put('/:id/status', auth, projectController.updateProjectStatus);

// Interaction Log Routes for a specific project
router.post('/:id/interactions', auth, interactionLogController.createInteractionLog);
router.get('/:id/interactions', auth, interactionLogController.getInteractionLogs);

module.exports = router;
