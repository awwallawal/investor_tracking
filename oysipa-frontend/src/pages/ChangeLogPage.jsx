import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, Link, MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  CHANGELOG_ACTIONS, CHANGELOG_ENTITIES, changeLogErrorMessage, entityLabel, fetchChangeLog,
  fetchChangeLogHealth, fetchChangeLogUsers,
} from '../api/changelog';
import { formatTime, shortValue } from '../utils/changeLog';

const hideOnPhone = { display: { xs: 'none', md: 'table-cell' } };
const EMPTY = {
  rows: [], total: 0, pageSize: 50,
};

// One value; a long one is shortened and can be expanded.
const ChangeValue = ({ value }) => {
  const [open, setOpen] = useState(false);
  const { text, full, long } = shortValue(value);
  return (
    <>
      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{open ? full : text}</Box>
      {long && (
        <Button size="small" variant="text" sx={{ minWidth: 0, p: 0, ml: 0.5, verticalAlign: 'baseline' }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show more'}
        </Button>
      )}
    </>
  );
};

// "field: old → new" per change.
const ChangeList = ({ changes }) => {
  if (!changes || changes.length === 0) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {changes.map((c) => (
        <Typography component="li" variant="body2" key={c.field} data-testid="change">
          <strong>{c.field}</strong>
          {': '}
          <ChangeValue value={c.old} />
          {' → '}
          <ChangeValue value={c.new} />
        </Typography>
      ))}
    </Box>
  );
};

// Read-only ChangeLog viewer (story 11.10, DG / Portal-Admin).
const ChangeLogPage = () => {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [by, setBy] = useState('');
  const [batchId, setBatchId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [health, setHealth] = useState(null);

  // Users for "Who" and the audit health banner (failures never block the page).
  useEffect(() => {
    let active = true;
    fetchChangeLogUsers().then((list) => { if (active) setUsers(list); }).catch(() => {});
    fetchChangeLogHealth().then((h) => { if (active) setHealth(h); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Only the newest request may set the rows.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    setLoading(true);
    try {
      const result = await fetchChangeLog({
        entity, action, entityId, by, batchId: batchId.trim(), from, to, page,
      });
      if (id !== requestId.current) return;
      setData(result);
      setError('');
    } catch (err) {
      if (id !== requestId.current) return;
      // Never leave rows of other filters on screen under an error.
      setData(EMPTY);
      setError(changeLogErrorMessage(err, 'Failed to load the change log.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [entity, action, entityId, by, batchId, from, to, page]);

  useEffect(() => { load(); }, [load]);

  // A filter change goes back to the first page.
  const onFilter = (setter) => (e) => { setter(e.target.value); setPage(1); };
  const filterRecord = (id) => { setEntityId(id); setPage(1); };

  const { rows, total, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const filtered = entity || action || by || batchId || entityId || from || to;
  const failures = Number(health && health.failedWrites) || 0;

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>Change log</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Who created or edited investors, projects, interactions, issues, announcements and the MoU MDAs setting,
        with the server time and the old and new values; plus deletes, imports and Evidence library file actions.
        Read-only. When two people change the same record at the same moment, the old and new values are best-effort.
      </Typography>
      {failures > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {`${failures} change${failures === 1 ? '' : 's'} could not be written to the change log`}
          {health.lastFailureAt ? ` (last ${formatTime(health.lastFailureAt)})` : ''}
          . The data was saved; check the server log.
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap', mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="changelog-entity-label">Record type</InputLabel>
          <Select labelId="changelog-entity-label" label="Record type" value={entity} onChange={onFilter(setEntity)}>
            <MenuItem value="">All records</MenuItem>
            {CHANGELOG_ENTITIES.map((e) => <MenuItem key={e.value} value={e.value}>{e.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="changelog-action-label">Action</InputLabel>
          <Select labelId="changelog-action-label" label="Action" value={action} onChange={onFilter(setAction)}>
            <MenuItem value="">All actions</MenuItem>
            {CHANGELOG_ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="changelog-by-label">Who</InputLabel>
          <Select labelId="changelog-by-label" label="Who" value={by} onChange={onFilter(setBy)}>
            <MenuItem value="">Everyone</MenuItem>
            {users.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" label="Batch id" value={batchId} onChange={onFilter(setBatchId)} />
        <TextField
          size="small"
          type="date"
          label="From"
          value={from}
          onChange={onFilter(setFrom)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={to}
          onChange={onFilter(setTo)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }}
        />
      </Box>
      {entityId && (
        <Chip sx={{ mb: 2, maxWidth: '100%' }} label={`Record ${entityId}`} onDelete={() => filterRecord('')} />
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && !error && rows.length === 0 && (
        <Typography color="text.secondary" sx={{ my: 2 }}>{`No changes recorded${filtered ? ' for these filters' : ''}.`}</Typography>
      )}
      {rows.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Record</TableCell>
                <TableCell>Changes</TableCell>
                <TableCell sx={hideOnPhone}>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} data-testid="changelog-row" sx={{ verticalAlign: 'top' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTime(row.createdAt)}</TableCell>
                  <TableCell>
                    {row.byName || '—'}
                    {row.role && <Typography variant="body2" color="text.secondary">{row.role}</Typography>}
                  </TableCell>
                  <TableCell>
                    {`${entityLabel(row.entity)} · ${row.action}`}
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      <Link
                        component="button"
                        type="button"
                        variant="body2"
                        title="Show only this record"
                        sx={{ textAlign: 'left', overflowWrap: 'anywhere' }}
                        onClick={() => filterRecord(row.entityId)}
                      >
                        {row.entityId}
                      </Link>
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <ChangeList changes={row.changes} />
                    {row.reason && (
                      <Typography variant="body2" color="text.secondary" sx={{ display: { md: 'none' }, mt: 0.5 }}>{`Reason: ${row.reason}`}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={hideOnPhone}>{row.reason || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {total > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mt: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">{`${first}–${last} of ${total}`}</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Typography variant="body2">{`Page ${page} of ${pages}`}</Typography>
            <Button size="small" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ChangeLogPage;
