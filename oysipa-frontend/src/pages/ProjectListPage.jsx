import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import apiClient from '../api/api';

const ProjectListPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();

  const lifecycleStatus = searchParams.get('lifecycleStatus');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = `/api/projects${lifecycleStatus ? `?lifecycleStatus=${lifecycleStatus}` : ''}`;
        const res = await apiClient.get(url);
        setProjects(res.data);
      } catch (err) {
        setError('Failed to fetch projects.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [lifecycleStatus]);

  if (loading) {
    return <div>Loading projects...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        {`Project List ${lifecycleStatus ? `(Status: ${lifecycleStatus})` : ''}`.trim()}
      </Typography>
      {projects.length === 0 ? (
        <Typography>No projects found.</Typography>
      ) : (
        <Paper>
          <List disablePadding>
            {projects.map((project) => (
              <ListItemButton key={project._id} component={RouterLink} to={`/projects/${project._id}`} divider>
                <ListItemText
                  primary={project.projectTitle}
                  secondary={`Investor: ${project.investor?.investorName || 'N/A'}`}
                  sx={{ overflowWrap: 'anywhere' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default ProjectListPage;