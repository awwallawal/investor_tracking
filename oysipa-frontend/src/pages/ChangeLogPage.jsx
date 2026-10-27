import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Link, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import FilterBar, { DateRangeFilter, FacetFilter } from '../components/ui/FilterBar';
import ViewTabs from '../components/ui/ViewTabs';
import ExportButton from '../components/ExportButton';
import useListQuery from '../hooks/useListQuery';
import { OBJECT_ID, resultCountLabel } from '../utils/listQuery';
import { formatDate } from '../utils/dates';
import {
  CHANGELOG_ACTIONS, CHANGELOG_ENTITIES, changeLogErrorMessage, entityLabel, fetchChangeLog,
  fetchChangeLogHealth, fetchChangeLogUsers,
} from '../api/changelog';
import { formatTime, shortValue } from '../utils/changeLog';
import { CHANGELOG_SPEC as SPEC } from '../constants/listSpecs';

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

// Filters in the URL (story 11.15). Newest first only: no sort.
const dayLabel = (v) => formatDate(`${v}T00:00:00.000Z`);

// Read-only ChangeLog viewer (story 11.10, DG / Portal-Admin).
const ChangeLogPage = () => {
  const lq = useListQuery(SPEC);
  const {
    entity, action, by, batchId, entityId, from, to,
  } = lq.values;
  // The batch id box: typed text stays as typed; the URL gets the trimmed value.
  const [batchInput, setBatchInput] = useState(batchId);
  useEffect(() => {
    setBatchInput((current) => (current.trim() === batchId ? current : batchId));
  }, [batchId]);
  // The page belongs to the current filters: a filter change goes back to page 1.
  const [paging, setPaging] = useState({ key: lq.filterKey, page: 1 });
  const page = paging.key === lq.filterKey ? paging.page : 1;
  const setPage = (update) => setPaging((prev) => {
    const current = prev.key === lq.filterKey ? prev.page : 1;
    return { key: lq.filterKey, page: typeof update === 'function' ? update(current) : update };
  });
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
        entity, action, entityId, by, batchId, from, to, page,
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

  const filterRecord = (id) => lq.set({ entityId: id });

  const { rows, total, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const filtered = entity || action || by || batchId || entityId || from || to;
  const failures = Number(health && health.failedWrites) || 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography variant="h4" component="h1">Change log</Typography>
        <ExportButton list="changelog" params={lq.apiParams} />
      </Box>
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
      <ViewTabs list="changelog" current={lq.filterKey} canonical={lq.canonical} saveQuery={lq.queryString} onApply={lq.applyQuery} />
      <FilterBar
        filters={(
          <>
            <FacetFilter
              label="Record type"
              single
              options={CHANGELOG_ENTITIES}
              selected={entity ? [entity] : []}
              onChange={(v) => lq.set({ entity: v[0] || '' })}
            />
            <FacetFilter
              label="Action"
              single
              options={CHANGELOG_ACTIONS}
              selected={action ? [action] : []}
              onChange={(v) => lq.set({ action: v[0] || '' })}
            />
            <FacetFilter
              label="Who"
              single
              searchable
              options={users.map((u) => ({ value: u._id, label: u.name }))}
              selected={by ? [by] : []}
              onChange={(v) => lq.set({ by: v[0] || '' })}
            />
            <DateRangeFilter label="Date" from={from} to={to} onChange={(range) => lq.set(range)} />
            <TextField
              size="small"
              label="Batch id"
              value={batchInput}
              onChange={(e) => { setBatchInput(e.target.value); lq.set({ batchId: e.target.value.trim() }, { replace: true }); }}
              sx={{ flex: { xs: '1 1 100%', sm: '0 0 220px' } }}
            />
          </>
        )}
        resultCount={loading && rows.length === 0 ? null : resultCountLabel(total, null, 'change')}
        chips={lq.chips({
          entity: { label: 'Record type', format: (v) => `Record type: ${entityLabel(v)}` },
          action: 'Action',
          by: { label: 'Who', format: (v) => `Who: ${(users.find((u) => u._id === v) || {}).name || v}` },
          from: { label: 'From', format: (v) => `From ${dayLabel(v)}` },
          to: { label: 'To', format: (v) => `To ${dayLabel(v)}` },
          batchId: 'Batch',
          entityId: { label: 'Record', format: (v) => `Record ${v}` },
        })}
        onClearAll={() => { setBatchInput(''); lq.clearAll(); }}
      />
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
