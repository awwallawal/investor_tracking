import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, IconButton, Menu, MenuItem, Tab, Tabs, TextField,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import { createView, deleteView, fetchViews, updateView, viewErrorMessage } from '../../api/views';
import { ALL_VIEW_LABELS, BUILT_IN_VIEWS } from '../../constants/listViews';
import { getCurrentUser, isAdminRole } from '../../utils/currentUser';
import { tokens } from '../../theme';

const MAX_NAME = 80;

const SaveViewDialog = ({ canShare, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave({ name: name.trim(), shared: canShare && shared });
    } catch (err) {
      setError(viewErrorMessage(err, 'Could not save the view.'));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Save this view</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 2 }}>The current filters, search and sort are saved as a tab on this list.</DialogContentText>
        <TextField
          label="View name"
          required
          fullWidth
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
          disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !busy) save(); }}
        />
        {canShare && (
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={busy} />}
            label="Share with everyone"
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving...' : 'Save view'}</Button>
      </DialogActions>
    </Dialog>
  );
};

// Views of a list as tabs (story 11.15): "All", the built-in views, then the
// user's saved views and the shared ones, and "+ Save this view".
//   list       the list key (investors, projects, ...)
//   current    the current filters and sort in canonical form (useListQuery().filterKey)
//   canonical  qs → canonical form (useListQuery().canonical); a view matches
//              when its filters and sort both match
//   saveQuery  the query saved by "+ Save this view" (useListQuery().queryString)
//   onApply    opens a view's query (useListQuery().applyQuery)
const ViewTabs = ({ list, current, canonical, saveQuery, onApply }) => {
  const isAdmin = isAdminRole(getCurrentUser()?.role);
  const [views, setViews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  // The view the options menu was opened for (acted on by id, even if the
  // list reloads or the active tab changes meanwhile).
  const [menuView, setMenuView] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchViews(list);
      setViews(data.filter((v) => v && v._id && typeof v.name === 'string'));
    } catch (err) {
      console.error(err);
      setViews([]);
    }
  }, [list]);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { key: 'all', label: ALL_VIEW_LABELS[list] || 'All', query: '' },
    ...(BUILT_IN_VIEWS[list] || []).map((v) => ({ ...v, key: `built-in:${v.key}` })),
    ...views.map((v) => ({ key: `saved:${v._id}`, label: v.name, query: v.query || '', view: v })),
  ];
  // A saved view that matches wins over a built-in one with the same query.
  const matches = tabs.map((t, i) => (canonical(t.query) === current ? i : -1)).filter((i) => i >= 0);
  const activeIndex = matches.length ? (matches.find((i) => tabs[i].view) ?? matches[0]) : -1;
  const active = activeIndex >= 0 ? tabs[activeIndex] : null;
  const activeView = active && active.view;

  const save = async ({ name, shared }) => {
    await createView({ list, name, query: saveQuery, shared });
    setSaving(false);
    await load();
  };

  const toggleShared = async () => {
    const view = menuView;
    setMenuAnchor(null);
    setError('');
    try {
      await updateView(view._id, { shared: !view.shared });
      await load();
    } catch (err) {
      setError(viewErrorMessage(err, 'Could not change the view.'));
    }
  };

  const remove = async () => {
    const view = confirmDelete;
    setConfirmDelete(null);
    setError('');
    try {
      await deleteView(view._id);
      await load();
    } catch (err) {
      setError(viewErrorMessage(err, 'Could not delete the view.'));
    }
  };

  // The server says what this user may do (canEdit / canDelete); sharing also needs DG/PA.
  const canShare = (v) => !!v && isAdmin && (v.canEdit ?? (v.mine || v.shared));
  const canDelete = (v) => !!v && (v.canDelete ?? (v.mine || (isAdmin && v.shared)));
  const canShareActive = canShare(activeView);
  const canDeleteActive = canDelete(activeView);

  return (
    <Box sx={{ mb: 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderBottom: `1px solid ${tokens.divider || tokens.border}`, minWidth: 0 }}>
        <Tabs
          value={activeIndex >= 0 ? activeIndex : false}
          onChange={(e, index) => onApply(tabs[index].query)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Views"
          sx={{ minWidth: 0, flex: '0 1 auto', minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: 14, px: 1.5 } }}
        >
          {tabs.map((t) => (
            <Tab
              key={t.key}
              label={t.view?.shared ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  {t.label}
                  <PeopleOutlineIcon titleAccess="Shared with everyone" sx={{ fontSize: 16 }} />
                </Box>
              ) : t.label}
            />
          ))}
        </Tabs>
        <Button size="small" onClick={() => setSaving(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>+ Save this view</Button>
        {(canShareActive || canDeleteActive) && (
          <IconButton size="small" aria-label={`Options for the view ${activeView.name}`} onClick={(e) => { setMenuView(activeView); setMenuAnchor(e.currentTarget); }} sx={{ flexShrink: 0 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError('')}>{error}</Alert>}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {canShare(menuView) && (
          <MenuItem onClick={toggleShared}>{menuView.shared ? 'Stop sharing' : 'Share with everyone'}</MenuItem>
        )}
        {canDelete(menuView) && (
          <MenuItem onClick={() => { setMenuAnchor(null); setConfirmDelete(menuView); }} sx={{ color: 'error.main' }}>Delete view</MenuItem>
        )}
      </Menu>
      {saving && <SaveViewDialog canShare={isAdmin} onClose={() => setSaving(false)} onSave={save} />}
      {confirmDelete && (
        <Dialog open onClose={() => setConfirmDelete(null)} fullWidth maxWidth="xs">
          <DialogTitle>{`Delete the view "${confirmDelete.name}"?`}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {confirmDelete.shared ? 'It is shared: it disappears for everyone.' : 'Only the saved tab is removed; no records change.'}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={remove}>Delete view</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default ViewTabs;
