import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText, Divider } from '@mui/material';
import apiClient from '../api/api';
import { ServiceChips } from '../components/InteractionLogList';
import InteractionDocuments from '../components/InteractionDocuments';
import { dateLine } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

const InteractionListPage = () => {
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // DG/Admin can write on every interaction; Staff attach from the investor or project page.
  const isAdmin = isAdminRole(getCurrentUser()?.role);

  const handleDocumentsChange = (logId, documents) => {
    setInteractions((prev) => prev.map((l) => (l._id === logId ? { ...l, documents } : l)));
  };

  useEffect(() => {
    const fetchInteractions = async () => {
      try {
        const { data } = await apiClient.get('/api/interactions');
        setInteractions(data);
      } catch (err) {
        setError('Failed to fetch interactions.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchInteractions();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 0, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        All-Time Interactions
      </Typography>
      {interactions.length === 0 ? (
        <Typography>No interactions found.</Typography>
      ) : (
        <List disablePadding>
          {interactions.map((interaction) => (
            <React.Fragment key={interaction._id}>
              <ListItem alignItems="flex-start" disableGutters>
                <ListItemText
                  sx={{ overflowWrap: 'anywhere' }}
                  primary={
                    <Typography
                      sx={{ display: 'inline' }}
                      component="span"
                      variant="body1"
                      color="text.primary"
                    >
                      {interaction.project?.projectTitle || interaction.investor?.investorName || 'N/A'} - {interaction.description}
                    </Typography>
                  }
                  slotProps={{ secondary: { component: 'div' } }}
                  secondary={
                    <React.Fragment>
                      <Typography
                        sx={{ display: 'inline' }}
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        Category: {interaction.category} | By: {interaction.loggedBy?.name || 'N/A'} on {dateLine(interaction, 'interactionDate')}
                      </Typography>
                      <ServiceChips log={interaction} />
                      {interaction.documentUrl && (
                        <Typography
                          sx={{ display: 'block' }}
                          component="span"
                          variant="body2"
                          color="text.secondary"
                        >
                          Document: <a href={interaction.documentUrl} target="_blank" rel="noopener noreferrer">View Document</a>
                        </Typography>
                      )}
                      <InteractionDocuments
                        log={{ ...interaction, documentUrl: undefined }}
                        canWrite={isAdmin}
                        canDelete={isAdmin}
                        onDocumentsChange={(docs) => handleDocumentsChange(interaction._id, docs)}
                      />
                    </React.Fragment>
                  }
                />
              </ListItem>
              <Divider component="li" />
            </React.Fragment>
          ))}
        </List>
      )}
    </Box>
  );
};

export default InteractionListPage;
