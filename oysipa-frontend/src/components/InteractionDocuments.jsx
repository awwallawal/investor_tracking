import React, { useState } from 'react';
import {
  Box, Typography, Button, Link as MuiLink, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Alert, TextField,
} from '@mui/material';
import apiClient from '../api/api';
import {
  DOCUMENT_ACCEPT, documentErrorMessage, openInteractionDocument, uploadInteractionDocument,
} from '../api/documents';
import HappenedDateField from './HappenedDateField';
import { dateLine, formatDate } from '../utils/dates';

const AttachDocumentDialog = ({ log, onClose, onAttached }) => {
  const [file, setFile] = useState(null);
  const [documentDate, setDocumentDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) {
      setError('Choose a file to attach.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const doc = await uploadInteractionDocument(log._id, file, documentDate);
      onAttached(doc);
    } catch (err) {
      setError(documentErrorMessage(err, 'Failed to attach the document.'));
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Attach document</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" sx={{ mb: 1 }}>{log.description}</Typography>
        <Button variant="outlined" component="label" disabled={uploading}>
          {file ? file.name : 'Choose file'}
          <input
            type="file"
            hidden
            accept={DOCUMENT_ACCEPT}
            aria-label="Document file"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </Button>
        <HappenedDateField label="Document date" value={documentDate} onChange={setDocumentDate} disabled={uploading} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>Cancel</Button>
        <Button onClick={handleUpload} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</Button>
      </DialogActions>
    </Dialog>
  );
};

// DG/Admin only: remove a wrongly attached document (audited first on the server).
const RemoveDocumentDialog = ({ log, doc, onClose, onRemoved }) => {
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setRemoving(true);
    setError('');
    try {
      const trimmed = reason.trim();
      await apiClient.delete(`/api/interactions/${log._id}/documents/${doc._id}`, trimmed ? { data: { reason: trimmed } } : undefined);
      onRemoved(doc);
    } catch (err) {
      setError(documentErrorMessage(err, 'Failed to remove the document.'));
      console.error(err);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open onClose={removing ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Remove document</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 2 }}>
          {`Remove "${doc.fileName}" from this interaction? The file is deleted from storage.`}
        </DialogContentText>
        <TextField label="Reason (optional)" fullWidth value={reason} onChange={(e) => setReason(e.target.value)} disabled={removing} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={removing}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={removing}>
          {removing ? 'Removing...' : 'Confirm remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Documents of one interaction: the legacy public documentUrl link (kept as it
// was), private documents with "View" (signed link), "Attach document" for
// writers and "Remove" for DG/Admin.
const InteractionDocuments = ({ log, canWrite = false, canDelete = false, onDocumentsChange }) => {
  const [attaching, setAttaching] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');
  const docs = log.documents || [];

  const handleView = async (doc) => {
    setError('');
    try {
      await openInteractionDocument(log._id, doc._id);
    } catch (err) {
      setError(documentErrorMessage(err, 'Could not open the document.'));
      console.error(err);
    }
  };

  const handleAttached = (doc) => {
    setAttaching(false);
    onDocumentsChange?.([...docs, doc]);
  };

  const handleRemoved = (doc) => {
    setRemoving(null);
    onDocumentsChange?.(docs.filter((d) => d._id !== doc._id));
  };

  if (!log.documentUrl && docs.length === 0 && !canWrite) return null;

  return (
    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
      {log.documentUrl && (
        <MuiLink href={log.documentUrl} target="_blank" rel="noopener" sx={{ display: 'inline-block', mr: 1 }}>
          [View Document]
        </MuiLink>
      )}
      {docs.map((doc) => (
        <Box component="span" key={doc._id} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography component="span" variant="body2">
            {`${doc.fileName} (${dateLine({ ...doc, createdAt: doc.uploadedAt }, 'documentDate') || formatDate(doc.uploadedAt)})`}
          </Typography>
          <Button size="small" onClick={() => handleView(doc)} aria-label={`View ${doc.fileName}`}>View</Button>
          {canDelete && (
            <Button size="small" color="error" onClick={() => setRemoving(doc)} aria-label={`Remove ${doc.fileName}`}>Remove</Button>
          )}
        </Box>
      ))}
      {canWrite && (
        <Button size="small" onClick={() => setAttaching(true)}>Attach document</Button>
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {attaching && <AttachDocumentDialog log={log} onClose={() => setAttaching(false)} onAttached={handleAttached} />}
      {removing && <RemoveDocumentDialog log={log} doc={removing} onClose={() => setRemoving(null)} onRemoved={handleRemoved} />}
    </Box>
  );
};

export default InteractionDocuments;
