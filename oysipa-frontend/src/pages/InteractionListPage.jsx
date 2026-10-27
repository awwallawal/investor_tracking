import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Link, Typography } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import apiClient from '../api/api';
import { ServiceChips } from '../components/InteractionLogList';
import InteractionDocuments from '../components/InteractionDocuments';
import PageHeader from '../components/ui/PageHeader';
import FilterBar, {
  DateRangeFilter, FacetFilter, SearchField, ToggleFilter,
} from '../components/ui/FilterBar';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import ViewTabs from '../components/ui/ViewTabs';
import ExportButton from '../components/ExportButton';
import useListQuery from '../hooks/useListQuery';
import useListData from '../hooks/useListData';
import { OBJECT_ID, USER_PATTERN, resultCountLabel } from '../utils/listQuery';
import { SERVICE_CODES } from '../constants/serviceCodes';
import { issueYears } from '../constants/issueFields';
import { dateLine } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { INTERACTION_SPEC as SPEC, INTERACTION_CATEGORIES } from '../constants/listSpecs';



const subject = (log) => log.project?.projectTitle || log.investor?.investorName || 'N/A';
const subjectLink = (log) => {
  if (log.project?._id) return `/projects/${log.project._id}`;
  if (log.investor?._id) return `/investors/${log.investor._id}`;
  return null;
};

// All interactions (story 11.15): server-side filters in the URL, saved views,
// CSV export of the view.
const InteractionListPage = () => {
  const user = getCurrentUser();
  // DG/Admin can write on every interaction; Staff attach from the investor or project page.
  const isAdmin = isAdminRole(user?.role);
  const lq = useListQuery(SPEC);
  const {
    data, total, loaded, error, reload, setData,
  } = useListData('/api/interactions', lq.apiParams, { errorMessage: 'Failed to fetch interactions.' });
  const interactions = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    apiClient.get('/api/users/staff')
      .then(({ data: users }) => { if (active && Array.isArray(users)) setStaff(users); })
      .catch(() => {});
    return () => { active = false; };
  }, [isAdmin]);

  const handleDocumentsChange = (logId, documents) => {
    setData((prev) => prev.map((l) => (l._id === logId ? { ...l, documents } : l)));
  };

  // Names for investor ids in the URL, from the rows shown.
  const investorNames = useMemo(() => {
    const m = {};
    interactions.forEach((l) => { if (l.investor?._id) m[l.investor._id] = l.investor.investorName; });
    return m;
  }, [interactions]);
  const userNames = useMemo(() => {
    const m = { me: 'Me' };
    staff.forEach((u) => { m[u._id] = u.name; });
    return m;
  }, [staff]);

  const { values } = lq;
  const chips = lq.chips({
    q: 'Search',
    category: 'Category',
    serviceCode: 'Code',
    noCode: 'Without a SABER code',
    officerLogs: 'Officer logs only',
    creditLinkage: 'Credit linkage',
    dated: { label: 'With a happened date', format: () => 'With a happened date' },
    investor: { label: 'Investor', format: (id) => `Investor: ${investorNames[id] || id}` },
    loggedBy: { label: 'Logged by', format: (id) => `Logged by: ${userNames[id] || id}` },
    officer: { label: 'Officer', format: (id) => `Officer: ${{ unassigned: 'Unassigned' }[id] || userNames[id] || id}` },
    from: 'From',
    to: 'To',
    year: 'Year',
  });

  const columns = [
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (log) => (
        <>
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{dateLine(log, 'interactionDate')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
            {[log.category, log.loggedBy?.name].filter(Boolean).join(' · ')}
          </Typography>
        </>
      ),
    },
    {
      key: 'subject',
      label: 'Investor / project · description',
      render: (log) => {
        const to = subjectLink(log);
        return (
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography variant="body1" component="span">
              {to ? <Link component={RouterLink} to={to} underline="hover" sx={{ fontWeight: 600 }}>{subject(log)}</Link> : subject(log)}
              {` - ${log.description}`}
            </Typography>
            <ServiceChips log={log} />
            {log.documentUrl && (
              <Typography sx={{ display: 'block' }} component="span" variant="body2" color="text.secondary">
                Document: <a href={log.documentUrl} target="_blank" rel="noopener noreferrer">View Document</a>
              </Typography>
            )}
            <InteractionDocuments
              log={{ ...log, documentUrl: undefined }}
              canWrite={isAdmin}
              canDelete={isAdmin}
              onDocumentsChange={(docs) => handleDocumentsChange(log._id, docs)}
            />
          </Box>
        );
      },
    },
    {
      key: 'category', label: 'Category', hideOnPhone: true,
    },
    {
      key: 'loggedBy', label: 'Logged by', hideOnPhone: true, render: (log) => log.loggedBy?.name || 'N/A',
    },
  ];

  let emptyState;
  if (error) emptyState = <EmptyState icon={<ForumOutlinedIcon />} title="Could not load interactions" text={error} action={<Button variant="outlined" onClick={reload}>Retry</Button>} />;
  else if (lq.activeCount > 0) emptyState = <EmptyState icon={<ForumOutlinedIcon />} title="No interactions match these filters" />;
  else emptyState = <EmptyState icon={<ForumOutlinedIcon />} title="No interactions found." />;

  const officerOptions = [{ value: 'me', label: 'Me' }, { value: 'unassigned', label: 'Unassigned' }, ...staff.filter((u) => u._id !== user?.id).map((u) => ({ value: u._id, label: u.name }))];
  const loggedByOptions = [{ value: 'me', label: 'Me' }, ...staff.filter((u) => u._id !== user?.id).map((u) => ({ value: u._id, label: u.name }))];

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow="Pipeline"
        title="Interactions"
        actions={<ExportButton list="interactions" params={lq.apiParams} />}
      />
      <ViewTabs list="interactions" current={lq.filterKey} canonical={lq.canonical} saveQuery={lq.queryString} onApply={lq.applyQuery} />
      <FilterBar
        search={(
          <SearchField
            label="Search interactions"
            placeholder="Description..."
            value={lq.searchInput}
            onChange={lq.setSearchInput}
            onClear={lq.clearSearch}
          />
        )}
        filters={(
          <>
            <FacetFilter label="Category" options={INTERACTION_CATEGORIES} selected={values.category} onChange={(v) => lq.set({ category: v })} />
            <FacetFilter
              label="SABER code"
              searchable
              options={SERVICE_CODES.map((s) => ({ value: s.code, label: `${s.code} · ${s.category}` }))}
              selected={values.serviceCode}
              onChange={(v) => lq.set({ serviceCode: v })}
            />
            <ToggleFilter label="Without a SABER code" active={values.noCode} onChange={(v) => lq.set({ noCode: v })} />
            <FacetFilter label="Logged by" options={loggedByOptions} selected={values.loggedBy} onChange={(v) => lq.set({ loggedBy: v })} />
            <FacetFilter label="Officer" options={officerOptions} selected={values.officer} onChange={(v) => lq.set({ officer: v })} />
            <FacetFilter label="Year" options={issueYears().map(String)} selected={values.year} onChange={(v) => lq.set({ year: v })} />
            <DateRangeFilter label="Date" from={values.from} to={values.to} onChange={({ from, to }) => lq.set({ from, to })} />
          </>
        )}
        resultCount={loaded ? resultCountLabel(interactions.length, total, 'interaction') : null}
        chips={chips}
        onClearAll={() => lq.clearAll()}
      />
      {error && interactions.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}>{error}</Alert>
      )}
      <DataTable
        ariaLabel="Interactions"
        columns={columns}
        rows={interactions}
        loading={!loaded && !error}
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

export default InteractionListPage;
