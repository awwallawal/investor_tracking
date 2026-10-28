import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Link, Typography,
} from '@mui/material';
import { changeLogErrorMessage, entityLabel, fetchChangeLog } from '../../api/changelog';
import { formatTime } from '../../utils/changeLog';
import ChangeList from '../ChangeList';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import SectionCard from '../ui/SectionCard';

// The History tab (DG / Portal-Admin, as the change log): the change-log rows
// of this investor and of each of its projects, newest first. One request per
// record (GET /api/changelog?entityId=, the first page of each).
const InvestorHistory = ({ investor, projects }) => {
  const [state, setState] = useState({
    loading: true, rows: [], error: '', failed: 0, more: false, pageSize: 50,
  });
  const projectIds = projects.map((p) => p._id).join(',');

  useEffect(() => {
    let live = true;
    const records = [
      { id: investor._id, name: investor.investorName },
      ...projects.map((p) => ({ id: p._id, name: p.projectTitle })),
    ];
    (async () => {
      // One request per record; a failed one never hides the others' rows.
      const settled = await Promise.allSettled(records.map((r) => fetchChangeLog({ entityId: r.id })));
      if (!live) return;
      const results = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failures = settled.filter((r) => r.status === 'rejected');
      failures.forEach((f) => console.error(f.reason));
      const nameOf = new Map(records.map((r) => [String(r.id), r.name]));
      const seen = new Set();
      const rows = results.flatMap((res) => res.rows)
        .filter((row) => (seen.has(row._id) ? false : seen.add(row._id)))
        .map((row) => ({ ...row, recordName: nameOf.get(String(row.entityId)) || '' }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setState({
        loading: false,
        rows,
        error: failures.length && !results.length ? changeLogErrorMessage(failures[0].reason, 'Could not load the history.') : '',
        failed: results.length ? failures.length : 0,
        more: results.some((res) => res.total > res.rows.length),
        pageSize: (results.find((res) => Number(res.pageSize) > 0) || {}).pageSize || 50,
      });
    })();
    return () => { live = false; };
    // projectIds stands for the projects list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investor._id, projectIds]);

  const columns = [
    { key: 'createdAt', label: 'When', render: (r) => <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{formatTime(r.createdAt)}</Box> },
    {
      key: 'by',
      label: 'Who',
      hideOnPhone: true,
      render: (r) => (
        <>
          {r.byName || '—'}
          {r.role && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.role}</Typography>}
        </>
      ),
    },
    {
      key: 'record',
      label: 'Record',
      render: (r) => (
        <>
          {entityLabel(r.entity)}
          {r.recordName && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{r.recordName}</Typography>}
        </>
      ),
    },
    { key: 'action', label: 'Action' },
    {
      key: 'changes',
      label: 'Changes',
      render: (r) => (
        <>
          <ChangeList changes={r.changes} />
          {r.reason && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{`Reason: ${r.reason}`}</Typography>}
        </>
      ),
    },
  ];

  return (
    <SectionCard
      title="History"
      subtitle="Changes to this investor and its projects, from the change log."
      actions={<Link component={RouterLink} to={`/changelog?entityId=${investor._id}`} sx={{ fontSize: 14, fontWeight: 600 }}>Open in the change log</Link>}
      flush
    >
      {state.error && <Alert severity="error" sx={{ mx: 2, mb: 1.5 }}>{state.error}</Alert>}
      {state.failed > 0 && (
        <Alert severity="warning" sx={{ mx: 2, mb: 1.5 }}>
          {`The history of ${state.failed} ${state.failed === 1 ? 'record' : 'records'} could not be loaded. The rows below are partial.`}
        </Alert>
      )}
      {state.more && (
        <Typography variant="body2" color="text.secondary" sx={{ px: { xs: 2, sm: 3 }, pb: 1.5 }}>
          {`Showing the latest ${state.pageSize} changes of each record. The change log has the rest.`}
        </Typography>
      )}
      <DataTable
        ariaLabel="Investor history"
        columns={columns}
        rows={state.rows}
        loading={state.loading}
        embedded
        emptyState={<EmptyState title="No changes recorded yet" />}
      />
    </SectionCard>
  );
};

export default InvestorHistory;
