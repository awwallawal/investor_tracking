import React from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider } from '@mui/material';

const ProjectList = ({ projects }) => {
    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom>
                Investment Projects
            </Typography>
            <Divider />
            {projects && projects.length > 0 ? (
                <List>
                    {projects.map((project) => (
                        <ListItem key={project._id} component="a" href={`/projects/${project._id}`}>
                            <ListItemText 
                                primary={project.projectTitle} 
                                secondary={`Status: ${project.lifecycleStatus?.name || 'N/A'}`}
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

