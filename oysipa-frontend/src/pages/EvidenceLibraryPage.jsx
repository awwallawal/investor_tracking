import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel,
  Link as MuiLink, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import { createFolder, evidenceErrorMessage, fetchFolders } from '../api/evidence';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import {
  EmptyState, FolderCard, FolderGrid, IconTile, StatTile,
} from '../components/EvidenceUi';
import { plural } from '../utils/evidenceUi';

// DG/Admin: a new top-level folder or a subfolder of a top-level folder.
const NewFolderDialog = ({ tops, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [folderDate, setFolderDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const folder = await createFolder({
        name: name.trim(),
        ...(parent && { parent }),
        ...(folderDate && { folderDate }),
        ...(description.trim() && { description: description.trim() }),
      });
      onCreated(folder);
    } catch (err) {
      setError(evidenceErrorMessage(err, 'Failed to create the folder.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>New folder</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField label="Name" required fullWidth margin="dense" variant="standard" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
        <FormControl fullWidth margin="dense" variant="standard">
          <InputLabel id="new-folder-parent">Inside</InputLabel>
          <Select labelId="new-folder-parent" value={parent} onChange={(e) => setParent(e.target.value)} disabled={saving}>
            <MenuItem value="">(top level)</MenuItem>
            {tops.map((t) => <MenuItem key={t._id} value={t._id}>{t.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Date (optional)"
          type="date"
          fullWidth
          margin="dense"
          variant="standard"
          value={folderDate}
          onChange={(e) => setFolderDate(e.target.value)}
          disabled={saving}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField label="Description (optional)" fullWidth multiline minRows={2} margin="dense" variant="standard" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Saving...' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
};

const countLine = (files, untagged) => `${plural(files, 'file')}${untagged ? ` · ${untagged} untagged` : ''}`;

// Evidence library: a summary strip, then each top-level folder with its
// subfolders as cards.
const EvidenceLibraryPage = () => {
  const user = getCurrentUser();
  const isAdmin = isAdminRole(user?.role);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setFolders(await fetchFolders());
      setError('');
    } catch (err) {
      setError(evidenceErrorMessage(err, 'Failed to load the evidence library.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = folders.reduce((acc, top) => ({
    files: acc.files + (top.totalFiles || 0),
    untagged: acc.untagged + (top.totalUntagged || 0),
    folders: acc.folders + 1 + (top.children || []).length,
  }), { files: 0, untagged: 0, folders: 0 });

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Evidence Library</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 560 }}>
            Private files kept once, then tagged to investors, interactions and issues. Files open through a short-lived secure link.
          </Typography>
        </Box>
        {isAdmin && (
          <Button variant="contained" startIcon={<CreateNewFolderOutlined />} onClick={() => setCreating(true)} sx={{ flexShrink: 0 }}>
            New folder
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}

      {!loading && folders.length > 0 && (
        <Box sx={{ display: 'grid', gap: { xs: 1, sm: 2 }, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', mb: 3 }}>
          <StatTile label="Files" value={totals.files} />
          <StatTile label="Untagged" value={totals.untagged} tone={totals.untagged > 0 ? 'warning' : undefined} />
          <StatTile label="Folders" value={totals.folders} />
        </Box>
      )}

      {!loading && folders.length === 0 && !error && <EmptyState icon={FolderOutlined}>No folders yet.</EmptyState>}

      <Stack spacing={{ xs: 2, sm: 3 }}>
        {folders.map((top) => (
          <Paper key={top._id} component="section" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: top.description ? 1 : 2 }}>
              <IconTile icon={FolderOutlined} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" component="h2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                  <MuiLink component={RouterLink} to={`/evidence/${top._id}`} color="inherit" underline="hover">{top.name}</MuiLink>
                </Typography>
                <Typography variant="body2" color="text.secondary">{countLine(top.totalFiles, top.totalUntagged)}</Typography>
              </Box>
            </Stack>
            {top.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>{top.description}</Typography>}
            {(top.children || []).length > 0 ? (
              <FolderGrid>
                {top.children.map((sub) => <FolderCard key={sub._id} folder={sub} />)}
              </FolderGrid>
            ) : (
              <Typography variant="body2" color="text.secondary">No subfolders. Open the folder to see its files.</Typography>
            )}
          </Paper>
        ))}
      </Stack>

      {creating && (
        <NewFolderDialog
          tops={folders}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </Box>
  );
};

export default EvidenceLibraryPage;
