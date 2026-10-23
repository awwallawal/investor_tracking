import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import { createFolder, evidenceErrorMessage, fetchFolders } from '../api/evidence';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { formatDate } from '../utils/dates';

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

const countLine = (files, untagged) => `${files} file${files === 1 ? '' : 's'}${untagged ? ` · ${untagged} untagged` : ''}`;

const FolderCard = ({ folder }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardActionArea component={RouterLink} to={`/evidence/${folder._id}`} sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{folder.name}</Typography>
        {folder.folderDate && <Typography variant="body2" color="text.secondary">{formatDate(folder.folderDate)}</Typography>}
        {folder.description && <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{folder.description}</Typography>}
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${folder.fileCount} file${folder.fileCount === 1 ? '' : 's'}`} />
          {folder.untaggedCount > 0 && <Chip size="small" color="warning" label={`${folder.untaggedCount} untagged`} />}
        </Stack>
      </CardContent>
    </CardActionArea>
  </Card>
);

// Evidence library: each top-level folder with its subfolders as cards.
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

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Typography variant="h4" component="h1">Evidence Library</Typography>
        {isAdmin && <Button variant="contained" onClick={() => setCreating(true)}>New folder</Button>}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}
      {!loading && folders.length === 0 && !error && <Typography>No folders yet.</Typography>}
      {folders.map((top) => (
        <Box key={top._id} component="section" sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap', mb: 0.5 }}>
            <Typography variant="h5" component="h2">
              <RouterLink to={`/evidence/${top._id}`} style={{ color: 'inherit' }}>{top.name}</RouterLink>
            </Typography>
            <Typography variant="body2" color="text.secondary">{countLine(top.totalFiles, top.totalUntagged)}</Typography>
          </Stack>
          {top.description && <Typography variant="body2" sx={{ mb: 1 }}>{top.description}</Typography>}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
            {top.children.map((sub) => <FolderCard key={sub._id} folder={sub} />)}
          </Box>
        </Box>
      ))}
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
