import React, { useState, useEffect } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider } from '@mui/material';
import apiClient from '../api/api';

const ProjectList = ({ investorId }) => {
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await apiClient.get(`/api/projects/investors/${investorId}/projects`);
                setProjects(response.data);
            } catch (error) {
                console.error("Fetch error:", error);
            }
        };

        if (investorId) {
            fetchProjects();
        }
    }, [investorId]);

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom>
                Investment Projects
            </Typography>
            <Divider />
            {projects.length > 0 ? (
                <List>
                    {projects.map((project) => (
                        <ListItem key={project._id} component="a" href={`/projects/${project._id}`}>
                            <ListItemText 
                                primary={project.projectTitle} 
                            />
                        </ListItem>
                    ))}
                </List>
            ) : (
                <Typography sx={{ mt: 2 }}>No projects found for this investor.</Typography>
            )}
        </Box>
    );
};

export default ProjectList;
