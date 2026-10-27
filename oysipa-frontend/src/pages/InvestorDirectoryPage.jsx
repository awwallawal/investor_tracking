import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Link,
  Popover,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import PageHeader from '../components/ui/PageHeader';
import FilterBar, { FacetFilter, SearchField, ToggleFilter } from '../components/ui/FilterBar';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import ViewTabs from '../components/ui/ViewTabs';
import ExportButton from '../components/ExportButton';
import InvestorForm from '../components/InvestorForm';
import ImportInvestorsDialog from '../components/ImportInvestorsDialog';
import { LEAD_SOURCES, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE } from '../constants/investorFields';
import { SECTOR_VALUES, NOT_RECORDED } from '../constants/sectors';
import apiClient from '../api/api';
import useListQuery from '../hooks/useListQuery';
import useListData from '../hooks/useListData';
import { OFFICER_PATTERN, resultCountLabel } from '../utils/listQuery';
import { formatDate, todayLagos } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { tokens } from '../theme';
import { INVESTOR_SPEC as INVESTOR_FILTERS, MAX_COUNTRY } from '../constants/listSpecs';

// DG/Admin only: deletes the investor, its projects and interactions (reason required).
const DeleteInvestorDialog = ({ investor, onClose, onDeleted }) => {
    const [reason, setReason] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = async () => {
        setDeleting(true);
        setError('');
        try {
            const { data } = await apiClient.delete(`/api/investors/${investor._id}`, { data: { reason: reason.trim() } });
            onDeleted(investor, data.deleted);
        } catch (err) {
            setError(err?.response?.data?.message || err?.response?.data?.msg || 'Failed to delete investor.');
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open onClose={deleting ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle>{`Delete ${investor.investorName}?`}</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <DialogContentText sx={{ mb: 2 }}>
                    This also deletes all its projects and interactions. A record of everything deleted is kept in the audit log.
                </DialogContentText>
                <TextField
                    label="Reason"
                    required
                    fullWidth
                    multiline
                    minRows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={deleting}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={deleting}>Cancel</Button>
                <Button color="error" variant="contained" onClick={handleConfirm} disabled={deleting || !reason.trim()}>
                    {deleting ? 'Deleting...' : 'Confirm delete'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// URL filters (story 11.15; see GET /api/investors). Values not on a list are
// ignored (not sent, no chip); the server ignores them too.
const FIRST_YEAR = 2015;

const facetPillSx = (active) => ({
  font: 'inherit', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, borderRadius: '999px',
  border: `1px solid ${active ? tokens.maroon : tokens.border}`, bgcolor: active ? tokens.maroonTint : '#fff',
  color: active ? tokens.maroonDark : 'text.primary', maxWidth: '100%', whiteSpace: 'nowrap', '&:hover': { borderColor: tokens.maroon },
});

// Country is free text on the investor, so the filter takes typed countries
// (matched like the analytics grouping: case and spaces ignored) plus "Not recorded".
const CountryFilter = ({ selected, onChange }) => {
  const [anchor, setAnchor] = useState(null);
  const [text, setText] = useState('');
  const options = [...new Set([NOT_RECORDED, ...selected])];
  const add = () => {
    // A comma would split the value in the URL.
    const v = text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (v && v.length <= MAX_COUNTRY && !selected.some((c) => c.toLowerCase() === v.toLowerCase())) onChange([...selected, v]);
    setText('');
  };
  const active = selected.length > 0;
  return (
    <>
      <ButtonBase
        aria-haspopup="dialog"
        aria-expanded={anchor ? 'true' : 'false'}
        aria-label={active ? `Country: ${selected.join(', ')}` : 'Country'}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={facetPillSx(active)}
      >
        {active ? `Country · ${selected.length}` : 'Country'}
        <ArrowDropDownIcon aria-hidden="true" sx={{ fontSize: 18, mr: -0.5 }} />
      </ButtonBase>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': 'Country', sx: { p: 2, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        <Stack spacing={1} sx={{ minWidth: { xs: 0, sm: 260 } }}>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="Type a country"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_COUNTRY))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            />
            <Button size="small" variant="contained" onClick={add} disabled={!text.trim()}>Add</Button>
          </Stack>
          {options.map((c) => (
            <FormControlLabel
              key={c}
              control={(
                <Checkbox
                  size="small"
                  checked={selected.includes(c)}
                  onChange={() => onChange(selected.includes(c) ? selected.filter((v) => v !== c) : [...selected, c])}
                />
              )}
              label={c}
            />
          ))}
        </Stack>
      </Popover>
    </>
  );
};

// Lifecycle status names (the "Stage" facet) and, for DG/Admin, the officers.
const useInvestorFacetOptions = (canSeeStaff) => {
  const [stages, setStages] = useState([]);
  const [staff, setStaff] = useState([]);
  useEffect(() => {
    let active = true;
    apiClient.get('/api/lifecycle-statuses')
      .then(({ data }) => {
        if (active && Array.isArray(data)) setStages(data.filter((s) => s && typeof s.name === 'string').map((s) => s.name));
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
  return { stages, staff };
};

const yearOptions = () => {
  const current = Number(todayLagos().slice(0, 4));
  const out = [];
  for (let y = current; y >= FIRST_YEAR; y -= 1) out.push({ value: String(y), label: String(y) });
  out.push({ value: 'none', label: 'No date' });
  return out;
};

const InvestorDirectoryPage = () => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [success, setSuccess] = useState('');
    const [isImportOpen, setIsImportOpen] = useState(false);
    const canDelete = isAdminRole(getCurrentUser()?.role);
    const canImport = canDelete; // DG/Portal-Admin only (server-enforced too)

    const lq = useListQuery(INVESTOR_FILTERS);
    const { values } = lq;
    const list = useListData('/api/investors', lq.apiParams, {
        errorMessage: 'Could not load investors. Check your connection and try again.',
    });
    const investors = Array.isArray(list.data) ? list.data : [];
    const { loaded, error: fetchError } = list;
    const filtered = Object.keys(lq.apiParams).length > 0;
    // Without the header (older server) an unfiltered list is its own total.
    const total = list.total ?? (loaded && !filtered ? investors.length : null);
    const { stages, staff } = useInvestorFacetOptions(canDelete);

    const officerOptions = [
        { value: 'me', label: 'Me' },
        { value: 'unassigned', label: 'Unassigned' },
        ...staff.map((u) => ({ value: u._id, label: u.name })),
    ];
    const officerLabel = (v) => (officerOptions.find((o) => o.value === v) || { label: 'another officer' }).label;
    const years = useMemo(yearOptions, []);

    const handleSave = () => {
      setIsFormOpen(false);
      list.reload(); // Re-fetch investors to update the list
    };

    const handleDeleted = (investor, counts = {}) => {
        setDeleting(null);
        setSuccess(`Deleted ${investor.investorName}: ${counts.investors ?? 1} investor, ${counts.projects ?? 0} project(s), ${counts.interactions ?? 0} interaction(s).`);
        list.reload();
    };

    // Active filters as removable chips under the search box.
    const chips = lq.chips({
        q: 'Search',
        leadSource: 'Lead source',
        organisationType: 'Type',
        sector: 'Sector',
        country: 'Country',
        stage: 'Stage',
        officer: { label: 'Officer', format: (v) => `Officer: ${officerLabel(v)}` },
        firstContactYear: { label: 'First contact', format: (v) => (v === 'none' ? 'No first-contact date' : `First contact ${v}`) },
        hasValue: { label: 'With a project value', format: () => 'With a project value' },
        noContactDays: { label: 'No contact', format: (v) => `No contact in ${v}+ days` },
        incomplete: { label: 'Incomplete records', format: () => 'Incomplete records' },
    });

    const columns = [
        {
            key: 'investorName',
            sortKey: 'name',
            label: 'Name',
            sortable: true,
            render: (investor) => {
                const type = investor.organisationType || DEFAULT_ORGANISATION_TYPE;
                return (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                            <Link component={RouterLink} to={`/investors/${investor._id}`} underline="hover" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                                {investor.investorName}
                            </Link>
                            <StatusBadge label={type} tone={type === DEFAULT_ORGANISATION_TYPE ? 'default' : 'info'} />
                        </Box>
                        {/* On phones the sector and country show under the name. */}
                        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.5 }}>
                            {[investor.sector, investor.countryOfOrigin].filter(Boolean).join(' · ')}
                        </Typography>
                    </>
                );
            },
        },
        { key: 'sector', label: 'Sector', sortable: true, hideOnPhone: true },
        { key: 'countryOfOrigin', sortKey: 'country', label: 'Country', sortable: true, hideOnPhone: true },
        {
            key: 'firstContactDate',
            sortKey: 'firstContact',
            label: 'First contact',
            sortable: true,
            hideOnPhone: true,
            render: (investor) => (investor.firstContactDate ? formatDate(investor.firstContactDate) : '—'),
        },
        ...(canDelete ? [{
            key: 'actions',
            label: 'Actions',
            align: 'right',
            render: (investor) => (
                <Button size="small" color="error" onClick={() => setDeleting(investor)}>
                    Delete
                </Button>
            ),
        }] : []),
    ];

    const retry = (
        <Button variant="outlined" onClick={() => list.reload()}>Retry</Button>
    );

    let emptyState;
    if (fetchError) emptyState = <EmptyState icon={<ApartmentOutlinedIcon />} title="Could not load investors" text={fetchError} action={retry} />;
    else if (values.q) emptyState = <EmptyState icon={<ApartmentOutlinedIcon />} title={`No investors match "${values.q}"`} text="Try another name, sector, place or contact." />;
    else if (lq.activeCount > 0) emptyState = <EmptyState icon={<ApartmentOutlinedIcon />} title="No investors match these filters" />;
    else emptyState = <EmptyState icon={<ApartmentOutlinedIcon />} title="No investors yet" text="Register the first investor to start the directory." />;

    return (
        <Box sx={{ minWidth: 0 }}>
            <PageHeader
                eyebrow="Pipeline"
                title="Investors"
                actions={(
                    <>
                        <ExportButton list="investors" params={lq.apiParams} />
                        {canImport && (
                            <Button variant="outlined" onClick={() => setIsImportOpen(true)}>
                                Import investors
                            </Button>
                        )}
                        <Button variant="contained" onClick={() => setIsFormOpen(true)}>
                            Register New Investor
                        </Button>
                    </>
                )}
            />
            <ViewTabs
                list="investors"
                current={lq.filterKey}
                canonical={lq.canonical}
                saveQuery={lq.queryString}
                onApply={lq.applyQuery}
            />
            <FilterBar
                search={(
                    <SearchField
                        label="Search investors"
                        placeholder="Name, sector, place, contact..."
                        value={lq.searchInput}
                        onChange={lq.setSearchInput}
                        onClear={lq.clearSearch}
                    />
                )}
                filters={(
                    <>
                        <FacetFilter label="Sector" options={SECTOR_VALUES} selected={values.sector} onChange={(v) => lq.set({ sector: v })} />
                        <FacetFilter label="Stage" options={stages} selected={values.stage} onChange={(v) => lq.set({ stage: v })} emptyText="No stages" />
                        <CountryFilter selected={values.country} onChange={(v) => lq.set({ country: v })} />
                        <FacetFilter label="Lead source" options={LEAD_SOURCES} selected={values.leadSource} onChange={(v) => lq.set({ leadSource: v })} />
                        <FacetFilter label="Type" options={ORGANISATION_TYPES} selected={values.organisationType} onChange={(v) => lq.set({ organisationType: v })} />
                        <FacetFilter label="Officer" options={officerOptions} selected={values.officer} onChange={(v) => lq.set({ officer: v })} />
                        <FacetFilter label="First contact" options={years} selected={values.firstContactYear} onChange={(v) => lq.set({ firstContactYear: v })} />
                        <ToggleFilter label="With a project value" active={values.hasValue} onChange={(v) => lq.set({ hasValue: v })} />
                        <ToggleFilter label="Incomplete records" active={values.incomplete} onChange={(v) => lq.set({ incomplete: v })} />
                    </>
                )}
                resultCount={loaded ? resultCountLabel(investors.length, total, 'investor') : null}
                chips={chips}
                onClearAll={() => lq.clearAll()}
            />
            {fetchError && investors.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => list.reload()}>Retry</Button>}>
                    {fetchError}
                </Alert>
            )}
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
            <InvestorForm
              open={isFormOpen}
              onClose={() => setIsFormOpen(false)}
              onSave={handleSave}
            />
            {canImport && (
                <ImportInvestorsDialog
                    open={isImportOpen}
                    onClose={() => setIsImportOpen(false)}
                    onImported={() => list.reload()}
                />
            )}
            <DataTable
                ariaLabel="Investors"
                columns={columns}
                rows={investors}
                rowLink={(investor) => `/investors/${investor._id}`}
                loading={!loaded && !fetchError}
                emptyState={emptyState}
                pageSize={50}
                sort={lq.sort}
                onSortChange={lq.setSort}
                manualSort
                resetKey={lq.filterKey}
            />
            {deleting && (
                <DeleteInvestorDialog investor={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />
            )}
        </Box>
    );
};

export default InvestorDirectoryPage;
