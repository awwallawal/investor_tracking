import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import apiClient from '../api/api';
import FilterBar from '../components/ui/FilterBar';
import { SECTOR_VALUES } from '../constants/sectors';

const ProjectListPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters from the URL (dashboard click-through, story 11.14).
  const lifecycleStatus = searchParams.get('lifecycleStatus');
  // A sector not on the list is ignored (the server would refuse it).
  const sector = SECTOR_VALUES.includes(searchParams.get('sector')) ? searchParams.get('sector') : null;

  const removeParam = (key) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.delete(key);
    return next;
  }, { replace: true });
  const chips = [
    lifecycleStatus && { key: 'lifecycleStatus', label: `Status: ${lifecycleStatus}`, onRemove: () => removeParam('lifecycleStatus') },
    sector && { key: 'sector', label: `Sector: ${sector}`, onRemove: () => removeParam('sector') },
  ].filter(Boolean);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (lifecycleStatus) params.set('lifecycleStatus', lifecycleStatus);
        if (sector) params.set('sector', sector);
        const query = params.toString();
        const url = `/api/projects${query ? `?${query}` : ''}`;
        const res = await apiClient.get(url);
        setProjects(res.data);
      } catch (err) {
        setError((err?.response?.status === 400 && err.response.data?.message) || 'Failed to fetch projects.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [lifecycleStatus, sector]);

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
      {chips.length > 0 && (
        <FilterBar
          resultCount={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
          chips={chips}
          onClearAll={() => setSearchParams(new URLSearchParams(), { replace: true })}
        />
      )}
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