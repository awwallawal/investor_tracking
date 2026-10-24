import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, Link as MuiLink, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import IssueForm from '../components/IssueForm';
import { fetchIssues, issueErrorMessage } from '../api/issues';
import {
  ISSUE_STATUSES, STATUS_COLORS, issueReference, issueYears,
} from '../constants/issueFields';
import { dateLine } from '../utils/dates';
import { useMdas } from '../api/mdas';

const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } };

// Investor issues register (DLR 4.5): list with status and year filters.
const IssuesPage = () => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const { nameOf: mdaName } = useMdas();

  // Only the newest request may set the list (superseded filters are dropped).
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    try {
      const data = await fetchIssues({ status, year });
      if (id !== requestId.current) return;
      setIssues(data);
      setError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setError(issueErrorMessage(err, 'Failed to load issues.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [status, year]);

  useEffect(() => { load(); }, [load]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
        <Typography variant="h4" component="h1">Investor issues</Typography>
        <Button variant="contained" onClick={() => setRegistering(true)}>Register issue</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="issues-status-label">Status</InputLabel>
          <Select labelId="issues-status-label" label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">All statuses</MenuItem>
            {ISSUE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="issues-year-label">Year reported</InputLabel>
          <Select labelId="issues-year-label" label="Year reported" value={year} onChange={(e) => setYear(e.target.value)}>
            <MenuItem value="">All years</MenuItem>
            {issueYears().map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && !error && issues.length === 0 && (
        <Typography color="text.secondary" sx={{ my: 2 }}>No issues registered{status || year ? ' for these filters' : ''}.</Typography>
      )}
      {issues.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Reported</TableCell>
                <TableCell>Investor</TableCell>
                <TableCell sx={hideOnPhone}>Category</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {issues.map((issue) => (
                <TableRow hover key={issue._id} sx={{ cursor: 'pointer' }} onClick={() => navigate(`/issues/${issue._id}`)}>
                  <TableCell>{dateLine(issue, 'dateReported')}</TableCell>
                  <TableCell>
                    <MuiLink component={RouterLink} to={`/issues/${issue._id}`} onClick={(e) => e.stopPropagation()}>
                      {issue.investor?.investorName || 'Investor'}
                    </MuiLink>
                    {issueReference(issue) && <Typography component="span" variant="body2" color="text.secondary">{` · ${issueReference(issue)}`}</Typography>}
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      {issue.description?.length > 120 ? `${issue.description.slice(0, 120)}…` : issue.description}
                    </Typography>
                    {issue.mdaResponsible?.length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {`MDA: ${issue.mdaResponsible.map(mdaName).join(', ')}`}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={hideOnPhone}>{issue.category}</TableCell>
                  <TableCell><Chip size="small" label={issue.status} color={STATUS_COLORS[issue.status] || 'default'} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <IssueForm
        open={registering}
        onClose={() => setRegistering(false)}
        onSaved={(issue) => { setRegistering(false); navigate(`/issues/${issue._id}`); }}
      />
    </Box>
  );
};

export default IssuesPage;
