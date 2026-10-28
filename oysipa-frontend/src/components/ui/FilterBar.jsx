import React, { useId, useMemo, useState } from 'react';
import {
  Card, Box, Button, ButtonBase, Checkbox, IconButton, InputAdornment, Link, ListItemText, Menu, MenuItem, Popover,
  Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { tokens } from '../../theme';

// Layout shell for a list's search and filters (no data logic here):
// the search slot and filter slots on top, then the result count, the
// active-filter chips (each removable), "Clear all" and an optional `end`
// slot (e.g. a sort menu) on the right.
// `chips` is a list of { key, label, onRemove }.
// Empty values (and 0) are never printed as a bare "0" or "".
const hasValue = (v) => v !== null && v !== undefined && v !== '' && v !== false && v !== 0;

const FilterBar = ({ search, filters, resultCount, chips = [], onClearAll, end }) => (
  <Card component="section" aria-label="Search and filters" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', '& > *': { minWidth: 0 } }}>
      {search && <Box sx={{ flex: '1 1 280px', display: 'flex', '& > *': { flexGrow: 1 } }}>{search}</Box>}
      {filters}
    </Box>
    {(hasValue(resultCount) || chips.length > 0 || end) && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', fontSize: 13, minWidth: 0 }}>
        {hasValue(resultCount) && (
          <Typography variant="body2" component="span" color="text.secondary" className="tabular-nums" sx={{ fontSize: 13 }} aria-live="polite">
            {resultCount}
          </Typography>
        )}
        {chips.map((chip) => (
          <Box
            component="span"
            key={chip.key}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.25, borderRadius: '999px', maxWidth: '100%',
              bgcolor: tokens.maroonTint2, color: tokens.maroonDark, pl: 1.25, pr: 0.25, py: 0.25, fontSize: 13,
            }}
          >
            <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{chip.label}</Box>
            {chip.onRemove && (
              <IconButton size="small" aria-label={`Remove ${chip.label}`} onClick={chip.onRemove} sx={{ color: 'inherit', p: 0.25 }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        ))}
        {chips.length > 0 && onClearAll && (
          <Link component="button" type="button" variant="body2" onClick={onClearAll} sx={{ fontSize: 13 }}>
            Clear all
          </Link>
        )}
        {end && <Box sx={{ ml: 'auto', minWidth: 0 }}>{end}</Box>}
      </Box>
    )}
  </Card>
);

// ---------- filter controls (story 11.15) ----------

const pillSx = (active) => ({
  font: 'inherit',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  px: 1.5,
  py: 0.75,
  borderRadius: '999px',
  border: `1px solid ${active ? tokens.maroon : tokens.border}`,
  bgcolor: active ? tokens.maroonTint : tokens.paper,
  color: active ? tokens.maroonDark : 'text.primary',
  maxWidth: '100%',
  whiteSpace: 'nowrap',
  '&:hover': { borderColor: tokens.maroon },
  '&.Mui-focusVisible': { outline: `2px solid ${tokens.maroon}`, outlineOffset: 2 },
});

const optionOf = (o) => (typeof o === 'object' && o !== null ? o : { value: String(o), label: String(o) });

// The list's search box: a small text field with a search icon and a clear (x).
export const SearchField = ({ label, placeholder, value, onChange, onClear }) => (
  <TextField
    size="small"
    label={label}
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    slotProps={{
      input: {
        startAdornment: (
          <InputAdornment position="start"><SearchIcon fontSize="small" aria-hidden="true" /></InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton size="small" aria-label="Clear search" onClick={onClear} edge="end">
              <ClearIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ) : null,
      },
    }}
  />
);

// A multi-select facet: a pill ("Sector · 2 ▾") that opens a checkbox menu.
// options: strings or { value, label, count? } (count is shown when given).
// `single`: choosing an option replaces the selection (radio-like).
// `searchable`: a box to narrow long option lists.
export const FacetFilter = ({
  label, options, selected = [], onChange, single = false, searchable = false, emptyText = 'No options',
}) => {
  const [anchor, setAnchor] = useState(null);
  const [filterText, setFilterText] = useState('');
  const menuId = useId();
  const list = useMemo(() => (options || []).map(optionOf), [options]);
  const shown = useMemo(() => {
    const t = filterText.trim().toLowerCase();
    return t ? list.filter((o) => o.label.toLowerCase().includes(t)) : list;
  }, [list, filterText]);
  const labelOf = (v) => (list.find((o) => o.value === v) || { label: v }).label;
  const active = selected.length > 0;
  let pillText = label;
  if (single && active) pillText = `${label} · ${labelOf(selected[0])}`;
  else if (active) pillText = `${label} · ${selected.length}`;

  const choose = (value) => {
    if (single) {
      onChange(selected.includes(value) ? [] : [value]);
      setAnchor(null);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <>
      <ButtonBase
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : 'false'}
        aria-controls={anchor ? menuId : undefined}
        aria-label={active ? `${label}: ${selected.map(labelOf).join(', ')}` : label}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={pillSx(active)}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pillText}</Box>
        <ArrowDropDownIcon aria-hidden="true" sx={{ fontSize: 18, mr: -0.5 }} />
      </ButtonBase>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => { setAnchor(null); setFilterText(''); }}
        slotProps={{ paper: { sx: { maxHeight: 420, maxWidth: 'calc(100vw - 32px)', minWidth: 220 } }, list: { 'aria-label': label, dense: true } }}
      >
        {searchable && (
          <Box sx={{ px: 1.5, pb: 1 }} onKeyDown={(e) => e.stopPropagation()}>
            <TextField size="small" fullWidth autoFocus placeholder={`Find ${label.toLowerCase()}`} value={filterText} onChange={(e) => setFilterText(e.target.value)} slotProps={{ htmlInput: { 'aria-label': `Find ${label.toLowerCase()}` } }} />
          </Box>
        )}
        {shown.length === 0 && <MenuItem disabled>{emptyText}</MenuItem>}
        {shown.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <MenuItem
              key={o.value}
              role={single ? 'menuitemradio' : 'menuitemcheckbox'}
              aria-checked={checked ? 'true' : 'false'}
              onClick={() => choose(o.value)}
              sx={{ gap: 1 }}
            >
              <Checkbox size="small" checked={checked} tabIndex={-1} disableRipple sx={{ p: 0 }} slotProps={{ input: { 'aria-hidden': true } }} />
              <ListItemText primary={o.label} slotProps={{ primary: { sx: { whiteSpace: 'normal', overflowWrap: 'anywhere' } } }} />
              {o.count !== undefined && o.count !== null && (
                <Typography variant="body2" color="text.secondary" className="tabular-nums" sx={{ ml: 1 }}>{o.count}</Typography>
              )}
            </MenuItem>
          );
        })}
        {active && (
          <MenuItem onClick={() => { onChange([]); setAnchor(null); }} sx={{ color: tokens.maroon, borderTop: `1px solid ${tokens.border}`, mt: 0.5 }}>
            {`Clear ${label.toLowerCase()}`}
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

// An on/off filter as a pill (aria-pressed), e.g. "With a value".
export const ToggleFilter = ({ label, active, onChange }) => (
  <ButtonBase aria-pressed={active ? 'true' : 'false'} onClick={() => onChange(!active)} sx={pillSx(active)}>
    {label}
  </ButtonBase>
);

const DAY_LABEL = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// A date range: a pill ("Date · 1 Jan 2026 – 31 Mar 2026") that opens From / To
// day fields. onChange({ from, to }) with 'YYYY-MM-DD' or ''.
export const DateRangeFilter = ({ label = 'Date', from = '', to = '', onChange }) => {
  const [anchor, setAnchor] = useState(null);
  const [draft, setDraft] = useState({ from, to });
  const active = !!(from || to);
  let pillText = label;
  if (from && to) pillText = `${label} · ${DAY_LABEL(from)} – ${DAY_LABEL(to)}`;
  else if (from) pillText = `${label} · from ${DAY_LABEL(from)}`;
  else if (to) pillText = `${label} · to ${DAY_LABEL(to)}`;
  const bad = draft.from && draft.to && draft.from > draft.to;
  const open = (e) => { setDraft({ from, to }); setAnchor(e.currentTarget); };
  const apply = () => { onChange({ from: draft.from || '', to: draft.to || '' }); setAnchor(null); };
  return (
    <>
      <ButtonBase aria-haspopup="dialog" aria-expanded={anchor ? 'true' : 'false'} onClick={open} sx={pillSx(active)}>
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pillText}</Box>
        <ArrowDropDownIcon aria-hidden="true" sx={{ fontSize: 18, mr: -0.5 }} />
      </ButtonBase>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': label, sx: { p: 2, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        <Stack spacing={1.5} sx={{ minWidth: { xs: 0, sm: 260 } }}>
          <TextField size="small" type="date" label="From" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="To" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} error={!!bad} helperText={bad ? '"From" must not be after "To".' : ''} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {active && <Button size="small" onClick={() => { onChange({ from: '', to: '' }); setAnchor(null); }}>Clear</Button>}
            <Button size="small" variant="contained" onClick={apply} disabled={!!bad}>Apply</Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
};

// A sort menu ("Sort: Date, newest first ▾") for lists without table headers.
// options: [{ value: { key, direction }, label }]; value null = default order.
export const SortMenu = ({ options, value, onChange, defaultLabel = 'Default order' }) => {
  const [anchor, setAnchor] = useState(null);
  const same = (a, b) => (!a && !b) || (a && b && a.key === b.key && a.direction === b.direction);
  const current = options.find((o) => same(o.value, value));
  return (
    <>
      <Link component="button" type="button" variant="body2" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} sx={{ fontSize: 13, color: 'text.secondary' }}>
        {'Sort: '}
        <Box component="b" sx={{ color: 'text.primary' }}>{current ? current.label : defaultLabel}</Box>
        {' ▾'}
      </Link>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ list: { 'aria-label': 'Sort' } }}>
        {options.map((o) => (
          <MenuItem key={o.label} selected={same(o.value, value)} onClick={() => { onChange(o.value); setAnchor(null); }}>{o.label}</MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default FilterBar;
