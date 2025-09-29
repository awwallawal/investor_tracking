import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Typography, Button, Paper, Divider } from '@mui/material';
import ProjectForm from '../components/ProjectForm';
import InteractionLogForm from '../components/InteractionLogForm';
import InteractionLogList from '../components/InteractionLogList';
import apiClient from '../api/api';

const ProjectDetailPage = () => {
    const [project, setProject] = useState(null);
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isLogFormOpen, setIsLogFormOpen] = useState(false);
    const [logRefreshKey, setLogRefreshKey] = useState(0);
    const { id } = useParams();

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

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
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
                <Typography sx={{ mb: 2 }}>₦{project.estimatedValue?.toLocaleString() || '0'}</Typography>

                <Typography variant="h6">Estimated Number of Jobs:</Typography>
                <Typography sx={{ mb: 2 }}>{project.estimatedNumberOfJobs?.toLocaleString() || '0'}</Typography>

                <Typography variant="h6">Location:</Typography>
                <Typography sx={{ mb: 2 }}>{project.location || 'N/A'}</Typography>

                <Typography variant="h6">Lifecycle Status:</Typography>
                <Typography sx={{ mb: 2 }}>{project.lifecycleStatus}</Typography>

                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                    <Button variant="contained" onClick={handleEditFormOpen}>Edit Project</Button>
                    <Button variant="contained" color="secondary" onClick={handleLogFormOpen}>Log Interaction</Button>
                </Box>
            </Paper>

            <InteractionLogList projectId={project._id} key={logRefreshKey} />

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
