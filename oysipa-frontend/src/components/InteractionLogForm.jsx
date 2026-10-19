import React, { useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Button, Select, MenuItem, InputLabel, FormControl, Alert } from '@mui/material';
import apiClient from '../api/api';
import ServiceCodePicker from './ServiceCodePicker';
import HappenedDateField from './HappenedDateField';
import { DOCUMENT_ACCEPT, documentErrorMessage, uploadInteractionDocument } from '../api/documents';

const INTERACTION_CATEGORIES = [
  'Meeting',
  'Call',
  'Email',
  'Site Visit',
  'System Update',
  'Other',
];

const DOC_NOT_ATTACHED = 'Interaction saved; document not attached';

// Logs an interaction against a project (projectId) or, with no project,
// against an investor (investorId). A chosen file is uploaded through the
// backend (private storage) after the interaction is saved.
const InteractionLogForm = ({ open, onClose, onSave, projectId, investorId }) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [interactionDate, setInteractionDate] = useState('');
  const [serviceCodes, setServiceCodes] = useState([]);
  const [creditLinkage, setCreditLinkage] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  // Set when the interaction was saved but its document upload failed.
  const [savedLogId, setSavedLogId] = useState(null);

  const url = projectId
    ? `/api/projects/${projectId}/interactions`
    : `/api/interactions/investors/${investorId}`;

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const reset = () => {
    setDescription('');
    setCategory('');
    setInteractionDate('');
    setServiceCodes([]);
    setCreditLinkage(false);
    setSelectedFile(null);
    setSavedLogId(null);
    setError('');
  };

  const finish = () => {
    reset();
    onSave();
  };

  // Returns true when the document is attached.
  const attachDocument = async (logId) => {
    try {
      await uploadInteractionDocument(logId, selectedFile, interactionDate);
      return true;
    } catch (err) {
      setSavedLogId(logId);
      setError(`${DOC_NOT_ATTACHED}: ${documentErrorMessage(err, 'the upload failed.')}`);
      console.error(err);
      return false;
    }
  };

  const handleSave = async () => {
    if (!description || !category) {
      setError('Both description and category are required.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const { data } = await apiClient.post(url, {
        description,
        category,
        serviceCodes,
        creditLinkage,
        // Empty means today (set by the server).
        ...(interactionDate && { interactionDate }),
      });

      if (selectedFile && !(await attachDocument(data?._id))) return;
      finish();
    } catch (err) {
      let message;
      if (err?.response?.status === 403) {
        message = projectId
          ? 'You can only change projects of investors assigned to you'
          : 'You can only log interactions for investors assigned to you';
      } else {
        message = err?.response?.data?.message || err?.message || 'Failed to save interaction log.';
      }
      setError(message);
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleRetry = async () => {
    setError('');
    setUploading(true);
    try {
      if (await attachDocument(savedLogId)) finish();
    } finally {
      setUploading(false);
    }
  };

  // Once saved, closing still refreshes the list (the interaction exists).
  const handleClose = () => {
    if (savedLogId) {
      finish();
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={uploading ? undefined : handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Log New Support Interaction</DialogTitle>
      <DialogContent>
        {error && <Alert severity={savedLogId ? 'warning' : 'error'} sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          autoFocus
          margin="dense"
          label="Interaction Description"
          type="text"
          fullWidth
          multiline
          rows={4}
          variant="standard"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={uploading || !!savedLogId}
        />
        <FormControl fullWidth margin="dense" variant="standard">
          <InputLabel id="service-category-label">Service Category</InputLabel>
          <Select
            labelId="service-category-label"
            id="service-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            label="Service Category"
            disabled={uploading || !!savedLogId}
          >
            {INTERACTION_CATEGORIES.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <HappenedDateField
          label="Date it happened"
          value={interactionDate}
          onChange={setInteractionDate}
          disabled={uploading || !!savedLogId}
        />
        <ServiceCodePicker
          value={serviceCodes}
          onChange={setServiceCodes}
          creditLinkage={creditLinkage}
          onCreditLinkageChange={setCreditLinkage}
          disabled={uploading || !!savedLogId}
        />
        <Button
          variant="contained"
          component="label"
          sx={{ mt: 2 }}
          disabled={uploading}
        >
          {selectedFile ? selectedFile.name : 'Attach Document'}
          <input type="file" hidden accept={DOCUMENT_ACCEPT} onChange={handleFileChange} />
        </Button>
      </DialogContent>
      <DialogActions>
        {savedLogId ? (
          <>
            <Button onClick={finish} disabled={uploading}>Close without document</Button>
            <Button onClick={handleRetry} disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading...' : 'Retry'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button onClick={handleSave} disabled={uploading}>
              {uploading ? 'Saving...' : 'Save Log'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default InteractionLogForm;
