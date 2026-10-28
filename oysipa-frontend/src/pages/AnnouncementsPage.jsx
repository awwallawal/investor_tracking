import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Link as MuiLink, TextField, Typography,
} from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AnnouncementForm from '../components/AnnouncementForm';
import apiClient from '../api/api';
import PageHeader from '../components/ui/PageHeader';
import FilterBar, { DateRangeFilter, FacetFilter, SearchField } from '../components/ui/FilterBar';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import ViewTabs from '../components/ui/ViewTabs';
import ExportButton from '../components/ExportButton';
import useListQuery from '../hooks/useListQuery';
import useListData from '../hooks/useListData';
import { OBJECT_ID, resultCountLabel } from '../utils/listQuery';
import { issueYears } from '../constants/issueFields';
import { dateLine } from '../utils/dates';
import { ANNOUNCEMENT_SPEC as SPEC } from '../constants/listSpecs';

// The year filter offers this year back to 2023 (as before); another ?year= is ignored.

const NAMED_OPTIONS = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
const projectLabel = (p) => (p.investor?.investorName ? `${p.projectTitle} — ${p.investor.investorName}` : p.projectTitle || '');

// Investment announcements register (DLR 4.4, story 11.15): server-side
// filters in the URL, saved views, CSV export of the view.
const AnnouncementsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [registering, setRegistering] = useState(false);
  const lq = useListQuery(SPEC);
  const {
    data, total, loaded, error, reload,
  } = useListData('/api/announcements', lq.apiParams, { errorMessage: 'Failed to load announcements.' });
  const announcements = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  useEffect(() => {
    let active = true;
    apiClient.get('/api/projects')
      .then(({ data: list }) => {
        if (active) setProjects([...(Array.isArray(list) ? list : [])].sort((a, b) => String(a.projectTitle).localeCompare(String(b.projectTitle))));
      })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, []);

  const { values } = lq;
  const projectById = useMemo(() => {
    const m = {};
    projects.forEach((p) => { m[p._id] = p; });
    announcements.forEach((a) => { if (a.project?._id && !m[a.project._id]) m[a.project._id] = a.project; });
    return m;
  }, [projects, announcements]);
  const selectedProjects = values.project.map((id) => projectById[id] || { _id: id, projectTitle: id });

  const chips = lq.chips({
    q: 'Search',
    year: 'Year',
    counted: 'Counted for DLR 4.4',
    oysipaNamed: { label: 'OYSIPA named', format: (v) => `OYSIPA named: ${v === 'true' ? 'Yes' : 'No'}` },
    project: { label: 'Project', format: (id) => `Project: ${projectById[id]?.projectTitle || id}` },
    from: 'From',
    to: 'To',
  });

  const columns = [
    {
      key: 'date', label: 'Date', sortable: true, render: (a) => dateLine(a, 'announcementDate'),
    },
    {
      key: 'outlet',
      label: 'Outlet',
      render: (a) => (
        <Box sx={{ minWidth: 0 }}>
          <MuiLink component={RouterLink} to={`/announcements/${a._id}`} sx={{ overflowWrap: 'anywhere' }}>{a.outlet}</MuiLink>
          {a.oysipaNamed && <Box component="span" sx={{ ml: 1 }}><StatusBadge label="OYSIPA named" /></Box>}
          {/* Phones: project and investor under the outlet. */}
          <Typography variant="body2" color="text.secondary" sx={{ display: { sm: 'none' }, overflowWrap: 'anywhere' }}>
            {[a.project?.projectTitle, a.project?.investor?.investorName].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'project', label: 'Project', hideOnPhone: true, render: (a) => <Box sx={{ overflowWrap: 'anywhere' }}>{a.project?.projectTitle || 'Project'}</Box>,
    },
    {
      key: 'investor', label: 'Investor', hideOnPhone: true, render: (a) => <Box sx={{ overflowWrap: 'anywhere' }}>{a.project?.investor?.investorName || ''}</Box>,
    },
  ];

  let emptyState;
  if (error) emptyState = <EmptyState icon={<CampaignOutlinedIcon />} title="Could not load announcements" text={error} action={<Button variant="outlined" onClick={reload}>Retry</Button>} />;
  else if (lq.activeCount > 0) emptyState = <EmptyState icon={<CampaignOutlinedIcon />} title="No announcements registered for these filters." />;
  else emptyState = <EmptyState icon={<CampaignOutlinedIcon />} title="No announcements registered." />;

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow="SABER evidence"
        title="Investment announcements"
        actions={(
          <>
            <ExportButton list="announcements" params={lq.apiParams} />
            <Button variant="contained" onClick={() => setRegistering(true)}>Register announcement</Button>
          </>
        )}
      />
      <ViewTabs list="announcements" current={lq.filterKey} canonical={lq.canonical} saveQuery={lq.queryString} onApply={lq.applyQuery} />
      <FilterBar
        search={(
          <SearchField
            label="Search announcements"
            placeholder="Outlet, project or investor..."
            value={lq.searchInput}
            onChange={lq.setSearchInput}
            onClear={lq.clearSearch}
          />
        )}
        filters={(
          <>
            <FacetFilter label="Year" options={issueYears().map(String)} selected={values.year} onChange={(v) => lq.set({ year: v })} />
            <FacetFilter label="OYSIPA named" single options={NAMED_OPTIONS} selected={values.oysipaNamed ? [values.oysipaNamed] : []} onChange={(v) => lq.set({ oysipaNamed: v[0] || '' })} />
            <DateRangeFilter label="Date" from={values.from} to={values.to} onChange={({ from, to }) => lq.set({ from, to })} />
            <Autocomplete
              multiple
              size="small"
              sx={{ flex: { xs: '1 1 100%', sm: '1 1 240px' }, maxWidth: { sm: 420 }, minWidth: 0 }}
              options={projects}
              value={selectedProjects}
              onChange={(e, value) => lq.set({ project: value.map((p) => p._id) })}
              getOptionLabel={projectLabel}
              isOptionEqualToValue={(o, v) => String(o._id) === String(v._id)}
              renderTags={() => null}
              renderInput={(params) => <TextField {...params} label="Project" placeholder={selectedProjects.length ? `${selectedProjects.length} chosen` : ''} />}
            />
          </>
        )}
        resultCount={loaded ? resultCountLabel(announcements.length, total, 'announcement') : null}
        chips={chips}
        onClearAll={() => lq.clearAll()}
      />
      {error && announcements.length > 0 && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <DataTable
        ariaLabel="Investment announcements"
        columns={columns}
        rows={announcements}
        rowLink={(a) => `/announcements/${a._id}`}
        loading={!loaded && !error}
        emptyState={emptyState}
        pageSize={50}
        sort={lq.sort}
        onSortChange={lq.setSort}
        manualSort
        resetKey={lq.filterKey}
      />
      <AnnouncementForm
        open={registering}
        onClose={() => setRegistering(false)}
        onSaved={(a) => { setRegistering(false); navigate(`/announcements/${a._id}`); }}
      />
    </Box>
  );
};

export default AnnouncementsPage;
