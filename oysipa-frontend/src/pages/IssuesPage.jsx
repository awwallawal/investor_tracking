import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Link as MuiLink, Typography,
} from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import IssueForm from '../components/IssueForm';
import apiClient from '../api/api';
import PageHeader from '../components/ui/PageHeader';
import FilterBar, { FacetFilter, SearchField, ToggleFilter } from '../components/ui/FilterBar';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import ViewTabs from '../components/ui/ViewTabs';
import ExportButton from '../components/ExportButton';
import useListQuery from '../hooks/useListQuery';
import useListData from '../hooks/useListData';
import { OBJECT_ID, OFFICER_PATTERN, resultCountLabel } from '../utils/listQuery';
import {
  ISSUE_CATEGORIES, ISSUE_STATUSES, issueReference, issueYears,
} from '../constants/issueFields';
import { dateLine } from '../utils/dates';
import { useMdas } from '../api/mdas';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { ISSUE_SPEC as SPEC } from '../constants/listSpecs';


// Investor issues register (DLR 4.5, story 11.15): server-side filters in the
// URL, saved views (built-in Open / Stale), CSV export of the view.
const IssuesPage = () => {
  const navigate = useNavigate();
  const isAdmin = isAdminRole(getCurrentUser()?.role);
  const [registering, setRegistering] = useState(false);
  const [staff, setStaff] = useState([]);
  const { mdas, nameOf: mdaName } = useMdas();
  const lq = useListQuery(SPEC);
  const {
    data, total, loaded, error, reload,
  } = useListData('/api/issues', lq.apiParams, { errorMessage: 'Failed to load issues.' });
  const issues = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    apiClient.get('/api/users/staff')
      .then(({ data: users }) => { if (active && Array.isArray(users)) setStaff(users); })
      .catch(() => {});
    return () => { active = false; };
  }, [isAdmin]);

  const investorNames = useMemo(() => {
    const m = {};
    issues.forEach((i) => { if (i.investor?._id) m[i.investor._id] = i.investor.investorName; });
    return m;
  }, [issues]);
  const officerNames = useMemo(() => {
    const m = { me: 'Me', unassigned: 'Unassigned' };
    staff.forEach((u) => { m[u._id] = u.name; });
    return m;
  }, [staff]);

  const { values } = lq;
  const chips = lq.chips({
    q: 'Search',
    status: 'Status',
    category: 'Category',
    mda: { label: 'MDA', format: (c) => `MDA: ${mdaName(c)}` },
    year: 'Year reported',
    stale: 'Stale',
    investor: { label: 'Investor', format: (id) => `Investor: ${investorNames[id] || id}` },
    officer: { label: 'Officer', format: (id) => `Officer: ${officerNames[id] || id}` },
  });

  const columns = [
    {
      key: 'date', label: 'Reported', sortable: true, render: (issue) => dateLine(issue, 'dateReported'),
    },
    {
      key: 'investor',
      label: 'Investor',
      render: (issue) => (
        <Box sx={{ minWidth: 0 }}>
          <MuiLink component={RouterLink} to={`/issues/${issue._id}`}>
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
        </Box>
      ),
    },
    { key: 'category', label: 'Category', hideOnPhone: true },
    {
      key: 'status', label: 'Status', render: (issue) => <StatusBadge label={issue.status} />,
    },
  ];

  let emptyState;
  if (error) emptyState = <EmptyState icon={<ReportProblemOutlinedIcon />} title="Could not load issues" text={error} action={<Button variant="outlined" onClick={reload}>Retry</Button>} />;
  else if (lq.activeCount > 0) emptyState = <EmptyState icon={<ReportProblemOutlinedIcon />} title="No issues registered for these filters." />;
  else emptyState = <EmptyState icon={<ReportProblemOutlinedIcon />} title="No issues registered." />;

  const officerOptions = [
    { value: 'me', label: 'Me' },
    { value: 'unassigned', label: 'Unassigned' },
    ...staff.map((u) => ({ value: u._id, label: u.name })),
  ];

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow="SABER evidence"
        title="Investor issues"
        actions={(
          <>
            <ExportButton list="issues" params={lq.apiParams} />
            <Button variant="contained" onClick={() => setRegistering(true)}>Register issue</Button>
          </>
        )}
      />
      <ViewTabs list="issues" current={lq.filterKey} canonical={lq.canonical} saveQuery={lq.queryString} onApply={lq.applyQuery} />
      <FilterBar
        search={(
          <SearchField
            label="Search issues"
            placeholder="Reference or description..."
            value={lq.searchInput}
            onChange={lq.setSearchInput}
            onClear={lq.clearSearch}
          />
        )}
        filters={(
          <>
            <FacetFilter label="Status" options={ISSUE_STATUSES} selected={values.status} onChange={(v) => lq.set({ status: v })} />
            <FacetFilter label="Category" options={ISSUE_CATEGORIES} selected={values.category} onChange={(v) => lq.set({ category: v })} />
            <FacetFilter label="MDA" searchable options={mdas.map((m) => ({ value: m.code, label: mdaName(m.code) }))} selected={values.mda} onChange={(v) => lq.set({ mda: v })} />
            <FacetFilter label="Year reported" options={issueYears().map(String)} selected={values.year} onChange={(v) => lq.set({ year: v })} />
            <ToggleFilter label="Stale" active={values.stale} onChange={(v) => lq.set({ stale: v })} />
            <FacetFilter label="Officer" options={officerOptions} selected={values.officer} onChange={(v) => lq.set({ officer: v })} />
          </>
        )}
        resultCount={loaded ? resultCountLabel(issues.length, total, 'issue') : null}
        chips={chips}
        onClearAll={() => lq.clearAll()}
      />
      {error && issues.length > 0 && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <DataTable
        ariaLabel="Investor issues"
        columns={columns}
        rows={issues}
        rowLink={(issue) => `/issues/${issue._id}`}
        loading={!loaded && !error}
        emptyState={emptyState}
        pageSize={50}
        sort={lq.sort}
        onSortChange={lq.setSort}
        manualSort
        resetKey={lq.filterKey}
      />
      <IssueForm
        open={registering}
        onClose={() => setRegistering(false)}
        onSaved={(issue) => { setRegistering(false); navigate(`/issues/${issue._id}`); }}
      />
    </Box>
  );
};

export default IssuesPage;
