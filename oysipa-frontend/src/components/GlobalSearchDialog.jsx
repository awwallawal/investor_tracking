import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Dialog, IconButton, InputBase, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { isSearchable, searchAll } from '../api/search';
import { tokens } from '../theme';

export const SEARCH_DEBOUNCE_MS = 300;
const LISTBOX_ID = 'global-search-results';
const TITLE_ID = 'global-search-title';

// The see-all row's label: "See all in Evidence files" etc.
const seeAllLabel = (group) => `See all in ${group.label}`;

// Flat list of the rows the arrow keys move through: every item, then the
// group's "See all" row, group by group (only groups with matches).
const flatten = (groups) => {
  const rows = [];
  groups.forEach((g) => {
    (g.items || []).forEach((item, i) => rows.push({
      id: `gs-${g.type}-${item._id || i}`, kind: 'item', group: g, item, to: item.to,
    }));
    if (g.seeAll) rows.push({ id: `gs-${g.type}-all`, kind: 'all', group: g, to: g.seeAll });
  });
  return rows;
};

// Story 11.15: Ctrl/⌘K search across investors, projects, issues,
// announcements, interactions and evidence files. Type-ahead after a 300 ms
// pause (2+ characters), results grouped with counts, arrow keys + Enter,
// Esc closes. Only the newest response may set the results.
const GlobalSearchDialog = ({ open, onClose }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [input, setInput] = useState('');
  const [state, setState] = useState({ q: '', groups: [], status: 'idle' }); // idle | loading | done | error
  const [active, setActive] = useState(0);
  const requestId = useRef(0);

  // Fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    setInput('');
    setState({ q: '', groups: [], status: 'idle' });
    setActive(0);
    requestId.current += 1;
  }, [open]);

  const q = input.trim();
  useEffect(() => {
    if (!open) return undefined;
    requestId.current += 1;
    const id = requestId.current;
    if (!isSearchable(q)) {
      setState({ q: '', groups: [], status: 'idle' });
      return undefined;
    }
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, status: 'loading' }));
      try {
        const data = await searchAll(q);
        if (id !== requestId.current) return;
        setState({ q, groups: (data?.groups || []).filter((g) => g && g.count > 0), status: 'done' });
        setActive(0);
      } catch (err) {
        if (id !== requestId.current) return;
        console.error('Search failed:', err);
        setState({ q, groups: [], status: 'error' });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, open]);

  const rows = useMemo(() => flatten(state.groups), [state.groups]);
  const current = rows[Math.min(active, rows.length - 1)];

  const go = (row) => {
    if (!row || !row.to) return;
    onClose();
    navigate(row.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (Math.min(a, rows.length - 1) + step + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      // Only results for the text in the box: never a stale result from earlier typing.
      if (state.status === 'done' && state.q === q) go(current);
    }
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!current) return;
    const el = document.getElementById(current.id);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const optionSx = (selected) => ({
    display: 'flex', flexDirection: 'column', gap: 0.25, px: 2, py: 1, cursor: 'pointer', minWidth: 0,
    borderRadius: '10px', bgcolor: selected ? tokens.maroonTint2 : 'transparent',
    '&:hover': { bgcolor: selected ? tokens.maroonTint2 : tokens.inputBg },
  });

  let body = null;
  if (!isSearchable(q)) {
    body = <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>Type at least 2 characters.</Typography>;
  } else if (state.status === 'error') {
    body = <Typography role="alert" variant="body2" color="error" sx={{ px: 2, py: 3 }}>Search failed. Check your connection and try again.</Typography>;
  } else if (state.status === 'done' && rows.length === 0) {
    body = <Typography role="status" variant="body2" color="text.secondary" sx={{ px: 2, py: 3, overflowWrap: 'anywhere' }}>{`No results for "${state.q}"`}</Typography>;
  } else if (state.status !== 'done' && rows.length === 0) {
    body = <Typography role="status" variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>Searching…</Typography>;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby={TITLE_ID}
      slotProps={{ paper: { sx: { alignSelf: { sm: 'flex-start' }, mt: { sm: 10 }, borderRadius: { sm: '16px' } } } }}
    >
      <Typography id={TITLE_ID} component="h2" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Search everything
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.divider}` }}>
        <SearchIcon aria-hidden="true" sx={{ fontSize: 20, color: tokens.textSecondary }} />
        <InputBase
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search investors, projects, issues, announcements, files…"
          sx={{ flex: 1, minWidth: 0, fontSize: 15 }}
          inputProps={{
            role: 'combobox',
            'aria-label': 'Search everything',
            'aria-expanded': rows.length > 0 ? 'true' : 'false',
            'aria-controls': LISTBOX_ID,
            'aria-autocomplete': 'list',
            'aria-activedescendant': current ? current.id : undefined,
          }}
        />
        <IconButton size="small" aria-label="Close search" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: { sm: '60vh' }, p: 1 }}>
        {body}
        {rows.length > 0 && (
          <Box id={LISTBOX_ID} role="listbox" aria-label="Search results">
            {state.groups.map((g) => (
              <Box key={g.type} role="group" aria-labelledby={`gs-${g.type}-label`} sx={{ mb: 1 }}>
                <Typography
                  id={`gs-${g.type}-label`}
                  component="div"
                  sx={{
                    px: 2, pt: 1, pb: 0.5, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: tokens.textSecondary,
                  }}
                >
                  {g.label}
                  {' '}
                  <span className="tabular-nums">{g.count}</span>
                </Typography>
                {rows.filter((r) => r.group === g).map((r) => {
                  const selected = current && current.id === r.id;
                  return (
                    <Box
                      key={r.id}
                      id={r.id}
                      role="option"
                      aria-selected={selected ? 'true' : 'false'}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(rows.indexOf(r))}
                      onClick={() => go(r)}
                      sx={optionSx(selected)}
                    >
                      {r.kind === 'item' ? (
                        <>
                          <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{r.item.title}</Typography>
                          {r.item.subtitle && (
                            <Typography component="span" sx={{ fontSize: 12, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>{r.item.subtitle}</Typography>
                          )}
                        </>
                      ) : (
                        <Typography component="span" sx={{ fontSize: 13, color: tokens.maroon, fontWeight: 500 }}>
                          {`${seeAllLabel(g)}${g.count > (g.items || []).length ? ` (${g.count})` : ''}`}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Dialog>
  );
};

export default GlobalSearchDialog;
