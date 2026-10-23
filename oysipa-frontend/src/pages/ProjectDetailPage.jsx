import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Typography, Button, Paper, Divider } from '@mui/material';
import ProjectForm from '../components/ProjectForm';
import InteractionLogForm from '../components/InteractionLogForm';
import InteractionLogList from '../components/InteractionLogList';
import apiClient from '../api/api';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { dateLine } from '../utils/dates';
import { formatMoney } from '../utils/money';

const ProjectDetailPage = () => {
    const [project, setProject] = useState(null);
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isLogFormOpen, setIsLogFormOpen] = useState(false);
    const [logRefreshKey, setLogRefreshKey] = useState(0);
    const { id } = useParams();
    const currentUser = getCurrentUser();
    const canDelete = isAdminRole(currentUser?.role);

    const fetchProject = useCallback(async () => {
        try {
            const response = await apiClient.get(`/api/projects/${id}`);
            setProject(response.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    }, [id]);

    useEffect(() => {
        fetchProject();
    }, [id, fetchProject]);

    const handleEditFormOpen = () => {
        setIsEditFormOpen(true);
    };

    const handleEditFormSave = () => {
        setIsEditFormOpen(false);
        fetchProject();
        setLogRefreshKey(prevKey => prevKey + 1); // Refresh interaction log
    };

    const handleLogFormOpen = () => {
        setIsLogFormOpen(true);
    };

    const handleLogFormSave = () => {
        setIsLogFormOpen(false);
        setLogRefreshKey(prevKey => prevKey + 1);
    };

    if (!project) {
        return <div>Loading...</div>;
    }

    // DG/Admin can always write. Staff only on projects of investors assigned to
    // them (the backend enforces the same rule; GET populates the investor).
    const assignedTo = project.investor?.assignedTo;
    const canWrite = isAdminRole(currentUser?.role)
        || (currentUser?.role === 'Staff' && !!currentUser?.id
            && String(assignedTo?._id || assignedTo || '') === currentUser.id);

    return (
        <Box sx={{ p: { xs: 0, sm: 3 } }}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 4 } }}>
                <Typography variant="h4" component="h1" gutterBottom sx={{ overflowWrap: 'anywhere' }}>
                    {project.projectTitle}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="h6">Investor:</Typography>
                <Typography component={Link} to={`/investors/${project.investor?._id}`} sx={{ mb: 2 }}>
                    {project.investor?.investorName || 'N/A'}
                </Typography>

                <Typography variant="h6" sx={{ mt: 2 }}>Description:</Typography>
                <Typography sx={{ mb: 2 }}>{project.description || 'N/A'}</Typography>

                <Typography variant="h6">Estimated Value:</Typography>
                <Typography sx={{ mb: 2 }}>{formatMoney(project.estimatedValue, project.currency)}</Typography>

                <Typography variant="h6">Estimated Number of Jobs:</Typography>
                <Typography sx={{ mb: 2 }}>{project.estimatedNumberOfJobs?.toLocaleString() || '0'}</Typography>

                <Typography variant="h6">Location:</Typography>
                <Typography sx={{ mb: 2 }}>{project.location || 'N/A'}</Typography>

                <Typography variant="h6">Lifecycle Status:</Typography>
                <Typography sx={{ mb: 2 }}>{project.lifecycleStatus?.name || 'N/A'}</Typography>

                <Typography variant="h6">Date Registered:</Typography>
                <Typography sx={{ mb: 2 }}>{dateLine(project, 'dateRegistered')}</Typography>

                <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    <Button variant="contained" onClick={handleEditFormOpen}>Edit Project</Button>
                    <Button variant="contained" color="secondary" onClick={handleLogFormOpen}>Log Interaction</Button>
                </Box>
            </Paper>

            <InteractionLogList projectId={project._id} canWrite={canWrite} canDelete={canDelete} key={logRefreshKey} />

            <ProjectForm
                open={isEditFormOpen}
                onClose={() => setIsEditFormOpen(false)}
                onSave={handleEditFormSave}
                projectData={project}
            />

            <InteractionLogForm
                open={isLogFormOpen}
                onClose={() => setIsLogFormOpen(false)}
                onSave={handleLogFormSave}
                projectId={project._id}
            />
        </Box>
    );
};

export default ProjectDetailPage;
