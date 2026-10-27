import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Link, Typography,
} from '@mui/material';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
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
import { SECTOR_VALUES } from '../constants/sectors';
import { CURRENCIES, DEFAULT_CURRENCY, ORGANISATION_TYPES } from '../constants/investorFields';
import { formatMoney } from '../utils/money';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { PROJECT_SPEC as PROJECT_FILTERS } from '../constants/listSpecs';

// URL filters (story 11.15; see GET /api/projects). Status names, investor and
// officer ids are not checked here: the server ignores unknown values.

const hasNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Lifecycle status names for the Status facet; DG/Admin also get the officers.
const useProjectFacetOptions = (canSeeStaff) => {
  const [statuses, setStatuses] = useState([]);
  const [staff, setStaff] = useState([]);
  useEffect(() => {
    let active = true;
    apiClient.get('/api/lifecycle-statuses')
      .then(({ data }) => {
        if (active && Array.isArray(data)) setStatuses(data.filter((s) => s && typeof s.name === 'string').map((s) => s.name));
      })
      .catch(() => {});
    if (canSeeStaff) {
      apiClient.get('/api/users/staff')
        .then(({ data }) => {
          if (active && Array.isArray(data)) setStaff(data.filter((u) => u && u._id && typeof u.name === 'string'));
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [canSeeStaff]);
  return { statuses, staff };
};

const ProjectListPage = () => {
  const isAdmin = isAdminRole(getCurrentUser()?.role);
  const lq = useListQuery(PROJECT_FILTERS);
  const { values } = lq;
  const list = useListData('/api/projects', lq.apiParams, { errorMessage: 'Failed to fetch projects.' });
  const projects = Array.isArray(list.data) ? list.data : [];
  const filtered = Object.keys(lq.apiParams).length > 0;
  const total = list.total ?? (list.loaded && !filtered ? projects.length : null);
  const { statuses, staff } = useProjectFacetOptions(isAdmin);

  const officerOptions = [
    { value: 'me', label: 'Me' },
    { value: 'unassigned', label: 'Unassigned' },
    ...staff.map((u) => ({ value: u._id, label: u.name })),
  ];
  const officerLabel = (v) => (officerOptions.find((o) => o.value === v) || { label: 'another officer' }).label;
  const investorName = (id) => {
    const p = projects.find((x) => x.investor && String(x.investor._id) === id);
    return (p && p.investor.investorName) || 'Investor';
  };

  const chips = lq.chips({
    q: 'Search',
    lifecycleStatus: 'Status',
    sector: 'Sector',
    currency: 'Currency',
    hasValue: { label: 'With a value', format: () => 'With a value' },
    hasJobs: { label: 'With jobs', format: () => 'With jobs' },
    investor: { label: 'Investor', format: (v) => `Investor: ${investorName(v)}` },
    officer: { label: 'Officer', format: (v) => `Officer: ${officerLabel(v)}` },
    organisationType: 'Type',
  });

  const columns = [
    {
      key: 'projectTitle',
      sortKey: 'title',
      label: 'Project',
      sortable: true,
      render: (p) => (
        <>
          <Link component={RouterLink} to={`/projects/${p._id}`} underline="hover" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {p.projectTitle}
          </Link>
          {/* Phones: investor and stage under the title. */}
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.5, overflowWrap: 'anywhere' }}>
            {[p.investor?.investorName, p.lifecycleStatus?.name].filter(Boolean).join(' · ')}
          </Typography>
        </>
      ),
    },
    {
      key: 'investor',
      label: 'Investor',
      hideOnPhone: true,
      render: (p) => (p.investor?._id
        ? <Link component={RouterLink} to={`/investors/${p.investor._id}`} underline="hover" sx={{ overflowWrap: 'anywhere' }}>{p.investor.investorName}</Link>
        : (p.investor?.investorName || 'N/A')),
    },
    {
      key: 'lifecycleStatus',
      sortKey: 'stage',
      label: 'Stage',
      sortable: true,
      hideOnPhone: true,
      render: (p) => (p.lifecycleStatus?.name ? <StatusBadge label={p.lifecycleStatus.name} /> : '—'),
    },
    { key: 'sector', label: 'Sector', hideOnPhone: true, render: (p) => p.sector || '—' },
    {
      key: 'estimatedValue',
      sortKey: 'value',
      label: 'Value',
      sortable: true,
      align: 'right',
      render: (p) => (hasNumber(p.estimatedValue) ? formatMoney(p.estimatedValue, p.currency || DEFAULT_CURRENCY) : '—'),
    },
    {
      key: 'estimatedNumberOfJobs',
      sortKey: 'jobs',
      label: 'Jobs',
      sortable: true,
      align: 'right',
      hideOnPhone: true,
      render: (p) => (hasNumber(p.estimatedNumberOfJobs) ? p.estimatedNumberOfJobs.toLocaleString('en-US') : '—'),
    },
  ];

  const retry = <Button variant="outlined" onClick={() => list.reload()}>Retry</Button>;
  let emptyState;
  if (list.error) emptyState = <EmptyState icon={<WorkOutlineIcon />} title="Could not load projects" text={list.error} action={retry} />;
  else if (lq.activeCount > 0) emptyState = <EmptyState icon={<WorkOutlineIcon />} title="No projects match these filters" />;
  else emptyState = <EmptyState icon={<WorkOutlineIcon />} title="No projects found." text="Projects are registered from an investor's page." />;

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow="Pipeline"
        title="Projects"
        actions={<ExportButton list="projects" params={lq.apiParams} />}
      />
      <ViewTabs list="projects" current={lq.filterKey} canonical={lq.canonical} saveQuery={lq.queryString} onApply={lq.applyQuery} />
      <FilterBar
        search={(
          <SearchField
            label="Search projects"
            placeholder="Title, location, investor..."
            value={lq.searchInput}
            onChange={lq.setSearchInput}
            onClear={lq.clearSearch}
          />
        )}
        filters={(
          <>
            <FacetFilter label="Status" options={statuses} selected={values.lifecycleStatus} onChange={(v) => lq.set({ lifecycleStatus: v })} emptyText="No statuses" />
            <FacetFilter label="Sector" options={SECTOR_VALUES} selected={values.sector} onChange={(v) => lq.set({ sector: v })} />
            <FacetFilter label="Currency" options={CURRENCIES} selected={values.currency} onChange={(v) => lq.set({ currency: v })} />
            <FacetFilter label="Officer" options={officerOptions} selected={values.officer} onChange={(v) => lq.set({ officer: v })} />
            <FacetFilter label="Investor type" options={ORGANISATION_TYPES} selected={values.organisationType} onChange={(v) => lq.set({ organisationType: v })} />
            <ToggleFilter label="With a value" active={values.hasValue} onChange={(v) => lq.set({ hasValue: v })} />
            <ToggleFilter label="With jobs" active={values.hasJobs} onChange={(v) => lq.set({ hasJobs: v })} />
          </>
        )}
        resultCount={list.loaded ? resultCountLabel(projects.length, total, 'project') : null}
        chips={chips}
        onClearAll={() => lq.clearAll()}
      />
      {list.error && projects.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => list.reload()}>Retry</Button>}>
          {list.error}
        </Alert>
      )}
      <DataTable
        ariaLabel="Projects"
        columns={columns}
        rows={projects}
        rowLink={(p) => `/projects/${p._id}`}
        loading={!list.loaded && !list.error}
        emptyState={emptyState}
        pageSize={50}
        sort={lq.sort}
        onSortChange={lq.setSort}
        manualSort
        resetKey={lq.filterKey}
      />
    </Box>
  );
};

export default ProjectListPage;
