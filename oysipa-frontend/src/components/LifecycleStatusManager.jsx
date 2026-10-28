import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import SectionCard from './ui/SectionCard';
import RowList from './ui/RowList';
import FormDialog from './ui/FormDialog';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import apiClient from '../api/api';

// The server's message (`message`, or `msg` on older routes), else the fallback.
const errorMessage = (err, fallback) => {
  const data = err && err.response && err.response.data;
  return (data && (data.message || data.msg)) || fallback;
};

// DG and Portal-Admin (the server re-checks the role). Errors are shown in an
// Alert above the list (or inside the edit dialog for a failed save); the list
// and the dialogs stay usable after a failure.
const LifecycleStatusManager = () => {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogError, setDialogError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(null);

  // Keeps the current list on screen while it reloads.
  const fetchStatuses = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/lifecycle-statuses');
      setStatuses(Array.isArray(response.data) ? response.data : []);
      return true;
    } catch (err) {
      console.error(err);
      setError('Failed to load lifecycle statuses.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const handleMove = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= statuses.length) return;

    const newStatuses = [...statuses];
    const [item] = newStatuses.splice(index, 1);
    newStatuses.splice(newIndex, 0, item);
    setStatuses(newStatuses);
    setError(null);

    try {
      await apiClient.put('/api/lifecycle-statuses/reorder', { orderedIds: newStatuses.map((s) => s._id) });
    } catch (err) {
      console.error(err);
      await fetchStatuses(); // back to the stored order
      setError(errorMessage(err, 'Failed to reorder statuses.'));
    }
  };

  const openEdit = (status) => {
    setCurrentStatus(status);
    setDialogError(null);
    setEditOpen(true);
  };

  const handleCreateClick = () => openEdit({ name: '', description: '' });
  const handleEditClick = (status) => openEdit({ _id: status._id, name: status.name || '', description: status.description || '' });

  const handleDeleteClick = (status) => {
    setCurrentStatus(status);
    setDeleteOpen(true);
  };

  const handleClose = () => {
    if (saving) return;
    setEditOpen(false);
    setDeleteOpen(false);
    setDialogError(null);
    setCurrentStatus(null);
  };

  const trimmedName = (currentStatus?.name || '').trim();

  const handleSave = async () => {
    if (!trimmedName || saving) return;
    const body = { name: trimmedName, description: currentStatus.description || '' };
    setSaving(true);
    setDialogError(null);
    try {
      if (currentStatus._id) {
        await apiClient.put(`/api/lifecycle-statuses/${currentStatus._id}`, body);
      } else {
        await apiClient.post('/api/lifecycle-statuses', body);
      }
      setSaving(false);
      setError(null);
      setEditOpen(false);
      setCurrentStatus(null);
      await fetchStatuses();
    } catch (err) {
      console.error(err);
      setSaving(false);
      setDialogError(errorMessage(err, 'Failed to save the status.'));
    }
  };

  const handleDelete = async () => {
    const target = currentStatus;
    setDeleteOpen(false);
    setCurrentStatus(null);
    try {
      await apiClient.delete(`/api/lifecycle-statuses/${target._id}`);
      setError(null);
      await fetchStatuses();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, 'Failed to delete the status.'));
    }
  };

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <SectionCard
      title="Manage Lifecycle Statuses"
      subtitle="The stages a project moves through, in order."
      actions={(
        <Button variant="contained" size="small" onClick={handleCreateClick}>
          Create New Status
        </Button>
      )}
    >
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Edit/Create Dialog */}
      <FormDialog
        open={editOpen}
        onClose={handleClose}
        title={`${currentStatus?._id ? 'Edit' : 'Create'} Lifecycle Status`}
        help="The name shows on projects and the dashboard."
        maxWidth="xs"
        actions={(
          <>
            <Button onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={!trimmedName || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </>
        )}
      >
          {dialogError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {dialogError}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            type="text"
            fullWidth
            variant="standard"
            value={currentStatus?.name || ''}
            onChange={(e) => setCurrentStatus({ ...currentStatus, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Description"
            type="text"
            fullWidth
            variant="standard"
            value={currentStatus?.description || ''}
            onChange={(e) => setCurrentStatus({ ...currentStatus, description: e.target.value })}
          />
      </FormDialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={handleClose}>
        <DialogTitle>Delete Lifecycle Status</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete "{currentStatus?.name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Status List */}
      <RowList
        ariaLabel="Lifecycle statuses"
        empty={loading ? null : 'No statuses yet.'}
        rows={statuses.map((status, index) => ({
          key: status._id,
          primary: status.name,
          secondary: status.description,
          actions: (
            <>
              <IconButton size="small" aria-label="move up" onClick={() => handleMove(index, -1)} disabled={index === 0}>
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="move down"
                onClick={() => handleMove(index, 1)}
                disabled={index === statuses.length - 1}
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label="edit" onClick={() => handleEditClick(status)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label="delete" onClick={() => handleDeleteClick(status)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          ),
        }))}
      />
    </SectionCard>
  );
};

export default LifecycleStatusManager;
