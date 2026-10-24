import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Chip, FormControl, InputLabel, Link as MuiLink, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AnnouncementForm from '../components/AnnouncementForm';
import apiClient from '../api/api';
import { announcementErrorMessage, fetchAnnouncements } from '../api/announcements';
import { issueYears } from '../constants/issueFields';
import { dateLine } from '../utils/dates';

const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } };

// Investment announcements register (DLR 4.4): list with year, OYSIPA named
// and project filters.
const AnnouncementsPage = () => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [year, setYear] = useState('');
  const [named, setNamed] = useState('');
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get('/api/projects')
      .then(({ data }) => {
        if (active) setProjects([...(data || [])].sort((a, b) => String(a.projectTitle).localeCompare(String(b.projectTitle))));
      })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, []);

  // Only the newest request may set the list (superseded filters are dropped).
  const requestId = useRef(0);
  const load = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    try {
      const data = await fetchAnnouncements({ year, oysipaNamed: named, project: project?._id });
      if (id !== requestId.current) return;
      setAnnouncements(data);
      setError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setError(announcementErrorMessage(err, 'Failed to load announcements.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [year, named, project]);

  useEffect(() => { load(); }, [load]);

  const filtered = year || named || project;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
        <Typography variant="h4" component="h1">Investment announcements</Typography>
        <Button variant="contained" onClick={() => setRegistering(true)}>Register announcement</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="announcements-filter-year-label">Year</InputLabel>
          <Select labelId="announcements-filter-year-label" label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
            <MenuItem value="">All years</MenuItem>
            {issueYears().map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="announcements-filter-named-label">OYSIPA named</InputLabel>
          <Select labelId="announcements-filter-named-label" label="OYSIPA named" value={named} onChange={(e) => setNamed(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Yes</MenuItem>
            <MenuItem value="false">No</MenuItem>
          </Select>
        </FormControl>
        <Autocomplete
          size="small"
          sx={{ minWidth: 240, flex: { sm: 1 }, maxWidth: { sm: 420 } }}
          options={projects}
          value={project}
          onChange={(e, value) => setProject(value)}
          getOptionLabel={(p) => (p.investor?.investorName ? `${p.projectTitle} — ${p.investor.investorName}` : p.projectTitle || '')}
          isOptionEqualToValue={(o, v) => String(o._id) === String(v._id)}
          renderInput={(params) => <TextField {...params} label="Project" />}
        />
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && !error && announcements.length === 0 && (
        <Typography color="text.secondary" sx={{ my: 2 }}>No announcements registered{filtered ? ' for these filters' : ''}.</Typography>
      )}
      {announcements.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Outlet</TableCell>
                <TableCell sx={hideOnPhone}>Project</TableCell>
                <TableCell sx={hideOnPhone}>Investor</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {announcements.map((a) => (
                <TableRow hover key={a._id} sx={{ cursor: 'pointer' }} onClick={() => navigate(`/announcements/${a._id}`)}>
                  <TableCell>{dateLine(a, 'announcementDate')}</TableCell>
                  <TableCell>
                    <MuiLink component={RouterLink} to={`/announcements/${a._id}`} onClick={(e) => e.stopPropagation()} sx={{ overflowWrap: 'anywhere' }}>
                      {a.outlet}
                    </MuiLink>
                    {a.oysipaNamed && <Chip size="small" color="success" label="OYSIPA named" sx={{ ml: 1 }} />}
                    {/* Phones: project and investor under the outlet. */}
                    <Typography variant="body2" color="text.secondary" sx={{ display: { sm: 'none' }, overflowWrap: 'anywhere' }}>
                      {[a.project?.projectTitle, a.project?.investor?.investorName].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ ...hideOnPhone, overflowWrap: 'anywhere' }}>{a.project?.projectTitle || 'Project'}</TableCell>
                  <TableCell sx={{ ...hideOnPhone, overflowWrap: 'anywhere' }}>{a.project?.investor?.investorName || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <AnnouncementForm
        open={registering}
        onClose={() => setRegistering(false)}
        onSaved={(a) => { setRegistering(false); navigate(`/announcements/${a._id}`); }}
      />
    </Box>
  );
};

export default AnnouncementsPage;
