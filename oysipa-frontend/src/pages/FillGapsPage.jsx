import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, LinearProgress, Link, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import apiClient from '../api/api';
import PageHeader from '../components/ui/PageHeader';
import FilterBar, { FacetFilter, SearchField } from '../components/ui/FilterBar';
import EmptyState from '../components/ui/EmptyState';
import YearSelector, { ALL_YEARS } from '../components/ui/YearSelector';
import ServiceCodePicker from '../components/ServiceCodePicker';
import HappenedDateField from '../components/HappenedDateField';
import InteractionLogForm from '../components/InteractionLogForm';
import useListQuery from '../hooks/useListQuery';
import useListData from '../hooks/useListData';
import { notifyFillGapsChanged } from '../api/fillGaps';
import { FILL_GAPS_FIELDS, FILL_GAPS_SPEC } from '../constants/listSpecs';
import {
  CURRENCIES, DEFAULT_CURRENCY, INTERMEDIARY_REFERRAL, NEW_LEAD_SOURCES,
} from '../constants/investorFields';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { MIN_HAPPENED_DAY, todayLagos } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { tokens } from '../theme';

// The API accepts 2000 to the current year (as the SABER report).
const MIN_YEAR = 2000;

const FIELD_LABELS = {
  T5: 'T5 value',
  T6: 'T6 location',
  T7: 'T7 jobs',
  T8a: 'T8a contact',
  T8b: 'T8b phone',
  T8c: 'T8c email',
  T10: 'T10 coded support',
  T11: 'T11 lead source and first contact',
};
// Fields fixed on the record's own page (not here).
const OTHER_LABELS = {
  T1: 'T1 investing company', T2: 'T2 project description', T3: 'T3 project sector', T4: 'T4 country', T9: 'T9 lifecycle status',
};
// Lead sources offered here: "Intermediary referral" needs the referrer, set on the investor page.
const LEAD_CHOICES = NEW_LEAD_SOURCES.filter((s) => s !== INTERMEDIARY_REFERRAL);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Plain digits or digits grouped by commas, optional decimals: "2000000", "2,000,000", "1500.50".
const AMOUNT_RE = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const pct = (share) => (share === null || share === undefined ? '—' : `${Math.round(share * 100)}%`);
const amountOf = (text) => {
  const t = String(text || '').trim();
  return AMOUNT_RE.test(t) ? Number(t.replace(/,/g, '')) : NaN;
};

const errorText = (err) => {
  if (err?.response?.status === 403) return 'You can only change records of investors assigned to you.';
  return err?.response?.data?.message || err?.response?.data?.msg || err?.response?.data?.error || 'Check your connection and try again.';
};

// Runs the parts in order ({ label, run, onDone }); says which saved and which did not.
// → { message, changed }
const saveParts = async (parts) => {
  const saved = [];
  let changed = false;
  for (const part of parts) {
    try {
      await part.run();
      saved.push(part.label);
      changed = true;
      part.onDone();
    } catch (err) {
      console.error(err);
      const done = saved.length ? `Saved: ${saved.join(', ')}. ` : '';
      const rest = parts.slice(parts.indexOf(part) + 1).map((p) => p.label);
      return {
        changed,
        message: `${done}Not saved: ${part.label}: ${errorText(err)}${rest.length ? ` (${rest.join(', ')} not tried)` : ''}`,
      };
    }
  }
  return { changed, message: '' };
};

// Tag pickers for untagged logs. `tags`: { logId: codes }.
const TagList = ({ logs, tags, setTags, disabled }) => logs.map((l) => (
  <Box key={l.id} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 320px)' }, alignItems: 'center', py: 0.5, borderBottom: `1px solid ${tokens.divider}` }}>
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
      {`${l.date} · ${l.category} · ${l.description || 'No description'}`}
    </Typography>
    <ServiceCodePicker
      idPrefix={`gap-tags-${l.id}`}
      label="Tag SABER codes"
      value={tags[l.id] || l.serviceCodes || []}
      onChange={(codes) => setTags((s) => ({ ...s, [l.id]: codes }))}
      showCreditLinkage={false}
      helperText=""
      disabled={disabled}
    />
  </Box>
));

// PATCH parts for the logs the user tagged (codes already on a log are kept).
const tagParts = (logs, tags, setTags) => logs
  .filter((l) => (tags[l.id] || []).length > 0)
  .map((l) => ({
    label: `tags on ${l.date}`,
    run: () => apiClient.patch(`/api/interactions/${l.id}`, {
      serviceCodes: [...(l.serviceCodes || []).filter((c) => !tags[l.id].includes(c)), ...tags[l.id]],
    }),
    onDone: () => setTags((s) => { const n = { ...s }; delete n[l.id]; return n; }),
  }));

const fieldGrid = { display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', alignItems: 'start' };

// One project of the investor: T5 / T6 / T7, project-level logs, Log support.
const ProjectCard = ({ group, project: p, year, currentYear, onSaved }) => {
  const has = (k) => p.missing.includes(k);
  const editable = group.canEdit;
  const [v, setV] = useState({
    value: '', currency: p.currency || DEFAULT_CURRENCY, location: '', jobs: '',
  });
  const [tags, setTags] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const set = (name) => (e) => setV((s) => ({ ...s, [name]: e.target.value }));
  const amount = amountOf(v.value);
  const others = ['T2', 'T3', 'T9'].filter(has);
  const hasInputs = editable && (has('T5') || has('T6') || has('T7') || p.untagged.length > 0);
  // A past year: the log must be dated in that year (or earlier) to count for T10.
  const pastYear = typeof year === 'number' && year < currentYear;

  const save = async () => {
    const found = {};
    if (v.value.trim() && !(amount > 0)) found.value = 'Enter an amount greater than 0 (digits, commas between thousands).';
    if (v.jobs.trim() && !(/^\d+$/.test(v.jobs.trim().replace(/,/g, '')) && Number(v.jobs.trim().replace(/,/g, '')) > 0)) found.jobs = 'Enter a whole number greater than 0.';
    setErrors(found);
    setError('');
    if (Object.keys(found).length) return;
    // Only changed fields are sent.
    const body = {};
    if (has('T5') && v.value.trim()) body.estimatedValue = amount;
    if (has('T5') && v.currency !== (p.currency || DEFAULT_CURRENCY)) body.currency = v.currency;
    if (has('T6') && v.location.trim()) body.location = v.location.trim();
    if (has('T7') && v.jobs.trim()) body.estimatedNumberOfJobs = Number(v.jobs.trim().replace(/,/g, ''));
    const parts = [
      ...(Object.keys(body).length ? [{
        label: 'project fields',
        run: () => apiClient.put(`/api/projects/${p.id}`, body),
        onDone: () => setV((s) => ({ ...s, value: '', location: '', jobs: '' })),
      }] : []),
      ...tagParts(p.untagged, tags, setTags),
    ];
    if (!parts.length) { setError('Enter at least one missing value.'); return; }
    setSaving(true);
    const result = await saveParts(parts);
    setSaving(false);
    setError(result.message);
    // Re-check the row (and the progress) after anything was saved.
    if (result.changed) onSaved();
  };

  const titleId = `gap-${p.id}`;
  return (
    <Card component="article" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography id={titleId} component="h3" sx={{ fontWeight: 600, fontSize: 15, overflowWrap: 'anywhere' }}>
          <Link component={RouterLink} to={`/projects/${p.id}`} underline="hover">{p.title || 'Untitled project'}</Link>
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }} aria-label="Missing fields">
          {p.missing.map((k) => <Chip key={k} size="small" label={k} sx={{ bgcolor: tokens.warningTint, color: tokens.warningText }} />)}
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      {editable && (has('T5') || has('T6') || has('T7')) && (
        <Box sx={fieldGrid}>
          {has('T5') && (
            <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
              <TextField
                size="small"
                label="T5 estimated value"
                value={v.value}
                onChange={set('value')}
                error={!!errors.value}
                helperText={errors.value || (amount > 0 ? `= ${formatMoney(amount, v.currency)}` : `Now ${p.estimatedValue ? formatMoney(p.estimatedValue, p.currency) : 'empty'}`)}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                sx={{ flex: 1, minWidth: 0 }}
                disabled={saving}
              />
              <TextField select size="small" label="Currency" value={v.currency} onChange={set('currency')} sx={{ width: 96, flexShrink: 0 }} disabled={saving}>
                {CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Box>
          )}
          {has('T6') && <TextField size="small" label="T6 location" value={v.location} onChange={set('location')} disabled={saving} />}
          {has('T7') && (
            <TextField
              size="small"
              label="T7 estimated jobs"
              value={v.jobs}
              onChange={set('jobs')}
              error={!!errors.jobs}
              helperText={errors.jobs}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              disabled={saving}
            />
          )}
        </Box>
      )}

      {editable && has('T10') && (
        <Box component="section" aria-label={`T10 coded support for ${p.title}`} sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>T10 coded support</Typography>
          {p.untagged.length === 0 && group.untagged.length === 0 && (
            <Typography variant="body2" color="text.secondary">No untagged interaction on or before the year end. Log the support given.</Typography>
          )}
          <TagList logs={p.untagged} tags={tags} setTags={setTags} disabled={saving} />
        </Box>
      )}

      {others.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {'Fix on the project page: '}
          <Link component={RouterLink} to={`/projects/${p.id}`}>{others.map((k) => OTHER_LABELS[k]).join(', ')}</Link>
        </Typography>
      )}
      {editable && !p.fixable && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Nothing you can fill here: needs the DG or Portal-Admin, or the record&apos;s own page.</Typography>
      )}

      {editable && (hasInputs || has('T10')) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {hasInputs && <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>}
          {has('T10') && <Button variant="outlined" onClick={() => setLogOpen(true)} disabled={saving}>Log support</Button>}
        </Box>
      )}
      {logOpen && (
        <InteractionLogForm
          open
          onClose={() => setLogOpen(false)}
          onSave={() => { setLogOpen(false); onSaved(); }}
          projectId={p.id}
          {...(pastYear && {
            initialDate: `${year}-12-31`,
            dateHelperText: `For T10 in ${year}, the date must be in ${year} or earlier.`,
          })}
        />
      )}
    </Card>
  );
};

// One investor: its fields (T8a/T8b/T8c/T11) and investor-level logs once, then its projects.
const InvestorBlock = ({ group: g, year, currentYear, onSaved }) => {
  const inv = g.investor;
  const has = (k) => g.missing.includes(k);
  const [v, setV] = useState({
    contact: '', phone: '', email: '', firstContactDate: '', leadSource: '',
  });
  const [tags, setTags] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (e) => setV((s) => ({ ...s, [name]: e && e.target ? e.target.value : e }));
  const leadMissing = has('T11') && inv.t11.leadSource;
  const dateMissing = has('T11') && inv.t11.firstContact;
  const others = ['T1', 'T4'].filter(has);
  const hasInputs = g.canEdit && (has('T8a') || has('T8b') || has('T8c') || dateMissing || (leadMissing && g.canEditLeadSource) || g.untagged.length > 0);
  const officerName = g.officer ? (g.officer.name || 'another officer') : 'no officer';

  const save = async () => {
    const found = {};
    if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) found.email = 'Enter a valid email address.';
    if (v.firstContactDate && v.firstContactDate > todayLagos()) found.firstContactDate = 'The date cannot be in the future.';
    else if (v.firstContactDate && v.firstContactDate < MIN_HAPPENED_DAY) found.firstContactDate = 'The date cannot be before 1 January 1990.';
    setErrors(found);
    setError('');
    if (Object.keys(found).length) return;
    const body = {};
    if (has('T8a') && v.contact.trim()) body.keyContactPerson = v.contact.trim();
    if (has('T8b') && v.phone.trim()) body.phoneNumber = v.phone.trim();
    if (has('T8c') && v.email.trim()) body.email = v.email.trim();
    if (dateMissing && v.firstContactDate) body.firstContactDate = v.firstContactDate;
    if (leadMissing && g.canEditLeadSource && v.leadSource) body.leadSource = v.leadSource;
    const parts = [
      ...(Object.keys(body).length ? [{
        label: 'investor fields',
        run: () => apiClient.put(`/api/investors/${inv.id}`, body),
        onDone: () => setV({
          contact: '', phone: '', email: '', firstContactDate: '', leadSource: '',
        }),
      }] : []),
      ...tagParts(g.untagged, tags, setTags),
    ];
    if (!parts.length) { setError('Enter at least one missing value.'); return; }
    setSaving(true);
    const result = await saveParts(parts);
    setSaving(false);
    setError(result.message);
    if (result.changed) onSaved();
  };

  const titleId = `gap-investor-${inv.id}`;
  return (
    <Card component="section" aria-labelledby={titleId} sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} component="h2" sx={{ fontWeight: 600, fontSize: 17, overflowWrap: 'anywhere' }}>
            <Link component={RouterLink} to={`/investors/${inv.id}`} underline="hover">{inv.name}</Link>
          </Typography>
          <Typography variant="body2" color="text.secondary">{`Officer: ${g.officer ? g.officer.name || '—' : 'unassigned'}`}</Typography>
        </Box>
        {g.missing.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }} aria-label="Missing investor fields">
            {g.missing.map((k) => <Chip key={k} size="small" label={k} sx={{ bgcolor: tokens.warningTint, color: tokens.warningText }} />)}
          </Box>
        )}
      </Box>

      {!g.canEdit && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {`Read-only: this investor is assigned to ${officerName}. Ask them, the DG or the Portal-Admin to fill it.`}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      {g.canEdit && (has('T8a') || has('T8b') || has('T8c') || has('T11')) && (
        <Box sx={fieldGrid}>
          {has('T8a') && <TextField size="small" label="T8a contact name" value={v.contact} onChange={set('contact')} disabled={saving} />}
          {has('T8b') && <TextField size="small" label="T8b phone" value={v.phone} onChange={set('phone')} disabled={saving} />}
          {has('T8c') && (
            <TextField size="small" label="T8c email" type="email" value={v.email} onChange={set('email')} error={!!errors.email} helperText={errors.email} disabled={saving} />
          )}
          {dateMissing && (
            <HappenedDateField
              label="T11 first-contact date"
              value={v.firstContactDate}
              onChange={set('firstContactDate')}
              disabled={saving}
              variant="outlined"
              size="small"
              margin="none"
              error={!!errors.firstContactDate}
              helperText={errors.firstContactDate || 'The day OYSIPA first met them'}
            />
          )}
          {leadMissing && g.canEditLeadSource && (
            <TextField
              select
              size="small"
              label="T11 lead source"
              value={v.leadSource}
              onChange={set('leadSource')}
              disabled={saving}
              helperText={`Now ${inv.leadSource || 'not recorded'}. For "${INTERMEDIARY_REFERRAL}", set it on the investor page.`}
            >
              {LEAD_CHOICES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          )}
          {leadMissing && !g.canEditLeadSource && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>T11 lead source</Typography>
              <Typography variant="body2" color="text.secondary">{`${inv.leadSource || 'Not recorded'}. Ask the DG or Portal-Admin to set it.`}</Typography>
            </Box>
          )}
        </Box>
      )}

      {g.canEdit && g.untagged.length > 0 && (
        <Box component="section" aria-label={`Investor-level interactions of ${inv.name}`} sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>T10: investor-level interactions (count for every project below)</Typography>
          <TagList logs={g.untagged} tags={tags} setTags={setTags} disabled={saving} />
        </Box>
      )}

      {others.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {'Fix on the investor page: '}
          <Link component={RouterLink} to={`/investors/${inv.id}`}>{others.map((k) => OTHER_LABELS[k]).join(', ')}</Link>
        </Typography>
      )}
      {!g.canEdit && (
        <Typography variant="body2" color="text.secondary">
          {`Missing: ${[...new Set(g.projects.flatMap((p) => p.missing))].map((k) => FIELD_LABELS[k] || OTHER_LABELS[k]).join(', ')}.`}
        </Typography>
      )}
      {hasInputs && (
        <Box sx={{ mt: 1.5 }}>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save investor'}</Button>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
        {g.projects.map((p) => (
          <ProjectCard key={p.id} group={g} project={p} year={year} currentYear={currentYear} onSaved={onSaved} />
        ))}
      </Box>
    </Card>
  );
};

// Fill the gaps (story 11.17): every in-scope project of the SABER report
// with T1–T11 gaps, grouped by investor, the missing fields as inputs. Every role.
const FillGapsPage = () => {
  const isAdmin = isAdminRole(getCurrentUser()?.role);
  const lq = useListQuery(FILL_GAPS_SPEC);
  const { values } = lq;
  const clientYear = Number(todayLagos().slice(0, 4));
  // A year outside 2000–current (hand-edited link) falls back to the current year.
  const urlYear = values.year === ALL_YEARS ? ALL_YEARS : Number(values.year);
  const year = values.year && (urlYear === ALL_YEARS || (urlYear >= MIN_YEAR && urlYear <= clientYear)) ? urlYear : clientYear;
  // Staff default Mine (their assigned investors); DG/PA default All. Unknown values → the default.
  const officer = values.officer || (isAdmin ? 'all' : 'me');
  const params = useMemo(() => ({
    ...lq.apiParams, year: String(year), officer,
  }), [lq.apiParams, year, officer]);
  const list = useListData('/api/fill-gaps', params, { initial: null, errorMessage: 'Could not load Fill the gaps. Check your connection and try again.' });
  const data = list.data && !Array.isArray(list.data) ? list.data : null;
  const currentYear = (data && data.currentYear) || clientYear;
  const s = data ? data.summary : null;

  const onSaved = () => {
    list.reload();
    notifyFillGapsChanged();
  };

  const chips = lq.chips({
    q: 'Search',
    missing: { label: 'Missing', format: (k) => `Missing ${FIELD_LABELS[k] || k}` },
    ...(['me', 'all'].includes(values.officer) ? {} : { officer: { label: 'Officer', format: (o) => (o === 'unassigned' ? 'Unassigned investors' : 'One officer') } }),
    // From the investor page: its name once the list has it.
    investor: { label: 'Investor', format: () => (data && data.groups[0] && data.groups[0].investor.name) || 'This investor' },
  });
  const yearLabel = year === ALL_YEARS ? 'all years' : String(year);
  const missingOptions = FILL_GAPS_FIELDS.map((k) => ({ value: k, label: FIELD_LABELS[k], count: s ? s.missing[k] : undefined }));
  const toggleValue = ['me', 'all'].includes(officer) ? officer : null;

  let body;
  if (list.error && !data) {
    body = <EmptyState icon={<FactCheckOutlinedIcon />} title="Could not load the list" text={list.error} action={<Button variant="outlined" onClick={() => list.reload()}>Retry</Button>} />;
  } else if (!data) {
    body = <Typography color="text.secondary">Loading...</Typography>;
  } else if (data.groups.length === 0) {
    body = lq.activeCount > 0 && (values.q || values.missing.length)
      ? <EmptyState icon={<FactCheckOutlinedIcon />} title="No projects match these filters" />
      : <EmptyState icon={<FactCheckOutlinedIcon />} title="Nothing to fill" text={`Every project in scope for ${yearLabel} is complete on T1–T11.`} />;
  } else {
    body = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {data.groups.map((g) => <InvestorBlock key={g.investor.id} group={g} year={year} currentYear={currentYear} onSaved={onSaved} />)}
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow="SABER evidence"
        title="Fill the gaps"
        subtitle={`Projects the SABER report checks for ${yearLabel} with T1–T11 fields missing. Each save goes through the usual edit and is recorded in the change log.`}
        actions={<YearSelector value={year} onChange={(y) => lq.set({ year: String(y) })} currentYear={currentYear} minYear={MIN_YEAR} />}
      />

      {s && (
        <Card component="section" aria-label="Progress" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1, mb: 1 }}>
            <Typography sx={{ fontWeight: 600 }} className="tabular-nums">
              {`${s.complete} of ${s.checked} projects complete (${pct(s.completeShare)})`}
            </Typography>
            <Typography variant="body2" color="text.secondary" className="tabular-nums">{`${pct(s.fieldsFilledShare)} of fields filled`}</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={s.completeShare ? Math.round(s.completeShare * 100) : 0}
            aria-label={`${s.complete} of ${s.checked} projects complete`}
            sx={{ height: 8, borderRadius: 4 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: 13 }}>
            {`The counts per field (Missing filter) are for all of ${yearLabel}, before search.`}
          </Typography>
        </Card>
      )}

      <FilterBar
        search={(
          <SearchField
            label="Search"
            placeholder="Project, investor, location, contact..."
            value={lq.searchInput}
            onChange={lq.setSearchInput}
            onClear={lq.clearSearch}
          />
        )}
        filters={(
          <>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={toggleValue}
              onChange={(e, next) => { if (next) lq.set({ officer: next }); }}
              aria-label="Whose projects"
            >
              <ToggleButton value="me">Mine</ToggleButton>
              <ToggleButton value="all">All</ToggleButton>
            </ToggleButtonGroup>
            <FacetFilter label="Missing" options={missingOptions} selected={values.missing} onChange={(m) => lq.set({ missing: m })} />
          </>
        )}
        resultCount={data ? `${data.total} incomplete project${data.total === 1 ? '' : 's'}` : null}
        chips={chips}
        onClearAll={() => lq.set({ q: '', missing: [], investor: '', ...(['me', 'all'].includes(values.officer) ? {} : { officer: '' }) })}
      />
      {list.error && data && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => list.reload()}>Retry</Button>}>{list.error}</Alert>
      )}
      {body}
    </Box>
  );
};

export default FillGapsPage;
