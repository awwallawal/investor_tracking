import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, FormControl, InputLabel, Link, MenuItem, Select, Typography,
} from '@mui/material';
import { fetchIssuesMetric } from '../api/issues';
import { BAND_LABELS, issueYears } from '../constants/issueFields';
import { todayLagos } from '../utils/dates';

// Resolved share of investor issues for a year (SABER DLR 4.5): Resolved ÷
// issues reported that year, Withdrawn left out. Bands: basic 50–75%, stretch >75%.
const IssuesShareWidget = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(Number(todayLagos().slice(0, 4)));
  const [metric, setMetric] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    setMetric(null); // never show the previous year's numbers while loading
    fetchIssuesMetric(year)
      .then((data) => { if (active) setMetric(data); })
      .catch(() => { if (active) { setMetric(null); setError('Could not load the issues share.'); } });
    return () => { active = false; };
  }, [year]);

  let body;
  if (error) body = <Typography color="error" variant="body2">{error}</Typography>;
  else if (!metric) body = <Typography variant="body2" color="text.secondary">Loading...</Typography>;
  else if (!metric.total && metric.withdrawn) {
    body = <Typography variant="h6" component="p">{`No issues counted (${metric.withdrawn} withdrawn)`}</Typography>;
  } else if (!metric.total) body = <Typography variant="h6" component="p">No issues registered</Typography>;
  else {
    body = (
      <>
        <Typography variant="h4" component="p" sx={{ fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
          {`${Math.round(metric.share * 100)}%`}
        </Typography>
        <Typography variant="body2">
          {`${metric.resolved} of ${metric.total} resolved${metric.withdrawn ? ` (${metric.withdrawn} withdrawn, not counted)` : ''}`}
        </Typography>
        <Typography variant="body2" color="text.secondary">{BAND_LABELS[metric.band] || metric.band}</Typography>
      </>
    );
  }

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" component="h2">
            <Link component="button" variant="body2" color="inherit" underline="hover" onClick={() => navigate('/issues')}>
              Investor issues resolved
            </Link>
          </Typography>
          <FormControl size="small" variant="standard">
            <InputLabel id="issues-share-year-label" sx={{ position: 'absolute', clip: 'rect(0 0 0 0)', width: 1, height: 1, overflow: 'hidden' }}>Year</InputLabel>
            <Select labelId="issues-share-year-label" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {issueYears().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        {body}
      </CardContent>
    </Card>
  );
};

export default IssuesShareWidget;
