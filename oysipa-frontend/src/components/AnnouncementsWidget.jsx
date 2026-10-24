import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, FormControl, InputLabel, Link, MenuItem, Select, Typography,
} from '@mui/material';
import { fetchAnnouncementsMetric } from '../api/announcements';
import { ANNOUNCEMENT_BAND_LABELS, ANNOUNCEMENT_TARGET } from '../constants/announcementFields';
import { issueYears } from '../constants/issueFields';
import { todayLagos } from '../utils/dates';

// OYSIPA-named investment announcements for a year (SABER DLR 4.4), by
// announcement date; projects of Intermediaries / Promotion agents left out.
// Shown as "N of 5" with the band: 0 none yet, 1-4 basic, 5+ stretch.
const AnnouncementsWidget = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(Number(todayLagos().slice(0, 4)));
  const [metric, setMetric] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    setMetric(null); // never show the previous year's numbers while loading
    fetchAnnouncementsMetric(year)
      .then((data) => { if (active) setMetric(data); })
      .catch(() => { if (active) { setMetric(null); setError('Could not load the announcements count.'); } });
    return () => { active = false; };
  }, [year]);

  let body;
  if (error) body = <Typography color="error" variant="body2">{error}</Typography>;
  else if (!metric) body = <Typography variant="body2" color="text.secondary">Loading...</Typography>;
  else {
    body = (
      <>
        <Typography variant="h4" component="p" sx={{ fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
          {`${metric.counted} of ${ANNOUNCEMENT_TARGET}`}
        </Typography>
        <Typography variant="body2">OYSIPA named</Typography>
        <Typography variant="body2" color="text.secondary">{ANNOUNCEMENT_BAND_LABELS[metric.band] || metric.band}</Typography>
      </>
    );
  }

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" component="h2">
            <Link component="button" variant="body2" color="inherit" underline="hover" onClick={() => navigate('/announcements')}>
              Investment announcements
            </Link>
          </Typography>
          <FormControl size="small" variant="standard">
            <InputLabel id="announcements-year-label" sx={{ position: 'absolute', clip: 'rect(0 0 0 0)', width: 1, height: 1, overflow: 'hidden' }}>Year</InputLabel>
            <Select labelId="announcements-year-label" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {issueYears().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        {body}
      </CardContent>
    </Card>
  );
};

export default AnnouncementsWidget;
