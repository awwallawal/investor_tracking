import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Link as MuiLink } from '@mui/material';
import SectionCard from './ui/SectionCard';
import RowList from './ui/RowList';
import StatusBadge from './ui/StatusBadge';
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
    <SectionCard
      title="Announcements"
      actions={canWrite ? <Button variant="outlined" size="small" onClick={() => setRegistering(true)}>Register announcement</Button> : null}
    >
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <RowList
        ariaLabel="Project announcements"
        empty={announcements && !error ? 'No announcements for this project.' : null}
        rows={(announcements || []).map((a) => ({
          key: a._id,
          primary: (
            <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <MuiLink component={RouterLink} to={`/announcements/${a._id}`} sx={{ overflowWrap: 'anywhere' }}>{a.outlet}</MuiLink>
              {a.oysipaNamed && <StatusBadge label="OYSIPA named" />}
            </Box>
          ),
          secondary: dateLine(a, 'announcementDate'),
        }))}
      />
      <AnnouncementForm
        open={registering}
        projectId={projectId}
        onClose={() => setRegistering(false)}
        onSaved={(a) => { setRegistering(false); navigate(`/announcements/${a._id}`); }}
      />
    </SectionCard>
  );
};

export default ProjectAnnouncements;
