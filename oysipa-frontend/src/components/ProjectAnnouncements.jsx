import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Link as MuiLink, List, ListItem, ListItemText, Paper, Typography,
} from '@mui/material';
import AnnouncementForm from './AnnouncementForm';
import { announcementErrorMessage, fetchAnnouncements } from '../api/announcements';
import { dateLine } from '../utils/dates';

// The project page's announcements (story 11.8). `canWrite` shows Register.
const ProjectAnnouncements = ({ projectId, canWrite }) => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState(null);
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAnnouncements({ project: projectId });
      setAnnouncements(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setAnnouncements([]);
      setError(announcementErrorMessage(err, 'Could not load the announcements.'));
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h6" component="h2">Announcements</Typography>
        {canWrite && <Button variant="outlined" onClick={() => setRegistering(true)}>Register announcement</Button>}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {announcements && announcements.length === 0 && !error && (
        <Typography color="text.secondary">No announcements for this project.</Typography>
      )}
      <List dense disablePadding>
        {(announcements || []).map((a) => (
          <ListItem key={a._id} disableGutters>
            <ListItemText
              primary={(
                <>
                  <MuiLink component={RouterLink} to={`/announcements/${a._id}`} sx={{ overflowWrap: 'anywhere' }}>{a.outlet}</MuiLink>
                  {a.oysipaNamed && <Chip size="small" color="success" label="OYSIPA named" sx={{ ml: 1 }} />}
                </>
              )}
              secondary={dateLine(a, 'announcementDate')}
            />
          </ListItem>
        ))}
      </List>
      <AnnouncementForm
        open={registering}
        projectId={projectId}
        onClose={() => setRegistering(false)}
        onSaved={(a) => { setRegistering(false); navigate(`/announcements/${a._id}`); }}
      />
    </Paper>
  );
};

export default ProjectAnnouncements;
