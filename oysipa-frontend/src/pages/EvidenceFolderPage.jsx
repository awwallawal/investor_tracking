import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, FormControlLabel, Link as MuiLink, Paper, Stack, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  deleteEvidenceFile, evidenceErrorMessage, fetchFolderFiles, notifyUntaggedChanged, removeEvidenceLink,
  uploadEvidenceFile,
} from '../api/evidence';
import { DOCUMENT_ACCEPT, documentErrorMessage, openEvidenceFile } from '../api/documents';
import EvidenceTagDialog from '../components/EvidenceTagDialog';
import HappenedDateField from '../components/HappenedDateField';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { formatDate } from '../utils/dates';

const fileDate = (f) => formatDate(f.documentDate || f.uploadedAt);
const fileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const shorten = (s, n = 40) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

const linkLabel = (link) => {
  const parts = [link.investor?.investorName || 'Investor'];
  if (link.interaction) parts.push(shorten(link.interaction.description) || 'interaction');
  if (link.serviceCodes?.length) parts.push(link.serviceCodes.join(', '));
  return parts.join(' · ');
};

// DG/Admin: upload one or more files with an optional shared date and "what".
const AddFilesDialog = ({ folderId, onClose, onDone }) => {
  const [files, setFiles] = useState([]);
  const [documentDate, setDocumentDate] = useState('');
  const [what, setWhat] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);

  const handleUpload = async () => {
    setUploading(true);
    const out = [];
    for (const file of files) {
      try {
        await uploadEvidenceFile(folderId, file, { documentDate, what: what.trim() });
        out.push({ name: file.name, ok: true });
      } catch (err) {
        out.push({ name: file.name, ok: false, message: evidenceErrorMessage(err, 'Upload failed.') });
      }
    }
    setResults(out);
    setUploading(false);
    onDone(out.some((r) => r.ok));
  };

  const failed = results.filter((r) => !r.ok);
  return (
    <Dialog open onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add files</DialogTitle>
      <DialogContent>
        <Button variant="outlined" component="label" disabled={uploading}>
          {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen` : 'Choose files'}
          <input
            type="file"
            hidden
            multiple
            accept={DOCUMENT_ACCEPT}
            aria-label="Evidence files"
            onChange={(e) => { setFiles(Array.from(e.target.files || [])); setResults([]); }}
          />
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>PDF, Word, Excel, JPEG or PNG, up to 10 MB each. No video or audio.</Typography>
        <HappenedDateField label="Document date" value={documentDate} onChange={setDocumentDate} disabled={uploading} helperText="Leave empty when unknown (the upload date is shown)" />
        <TextField label="What (optional)" fullWidth margin="dense" variant="standard" value={what} onChange={(e) => setWhat(e.target.value)} disabled={uploading} />
        {results.length > 0 && (
          <Alert severity={failed.length ? 'warning' : 'success'} sx={{ mt: 2 }}>
            {`${results.length - failed.length} of ${results.length} uploaded.`}
            {failed.map((r, i) => <Box key={`${i}-${r.name}`} sx={{ overflowWrap: 'anywhere' }}>{`${r.name}: ${r.message}`}</Box>)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>{results.length ? 'Close' : 'Cancel'}</Button>
        <Button onClick={handleUpload} disabled={uploading || files.length === 0 || results.length > 0}>
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// DG/Admin: confirm with a reason (required for a file delete, optional for an unlink).
const ConfirmDialog = ({
  title, text, reasonRequired, confirmLabel, onClose, onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handle = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(evidenceErrorMessage(err, 'The action failed.'));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 2, overflowWrap: 'anywhere' }}>{text}</DialogContentText>
        <TextField label={reasonRequired ? 'Reason' : 'Reason (optional)'} required={reasonRequired} fullWidth value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handle} disabled={busy || (reasonRequired && !reason.trim())}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
};

// One folder's files: Open (signed link), Tag (all roles), and for DG/Admin
// Add files, Delete (reason required) and unlink a tag.
const EvidenceFolderPage = () => {
  const { folderId } = useParams();
  const user = getCurrentUser();
  const isAdmin = isAdminRole(user?.role);
  const [folder, setFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [subfolders, setSubfolders] = useState([]);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tagging, setTagging] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [unlinking, setUnlinking] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchFolderFiles(folderId, { untagged: untaggedOnly });
      setFolder(data.folder);
      setSubfolders(data.subfolders || []);
      setFiles(data.files || []);
      setError('');
    } catch (err) {
      setError(evidenceErrorMessage(err, 'Failed to load the folder.'));
    } finally {
      setLoading(false);
    }
  }, [folderId, untaggedOnly]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async (file) => {
    setError('');
    try {
      await openEvidenceFile(file._id);
    } catch (err) {
      setError(documentErrorMessage(err, 'Could not open the file.'));
    }
  };

  const changed = () => { notifyUntaggedChanged(); load(); };

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink component={RouterLink} to="/evidence">Evidence Library</MuiLink>
        {folder?.parent && (
          <MuiLink component={RouterLink} to={`/evidence/${folder.parent._id}`}>{folder.parent.name}</MuiLink>
        )}
        {folder && <Typography color="text.primary">{folder.name}</Typography>}
      </Breadcrumbs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Typography variant="h4" component="h1" sx={{ overflowWrap: 'anywhere' }}>{folder?.name || 'Folder'}</Typography>
        {isAdmin && folder && <Button variant="contained" onClick={() => setAdding(true)}>Add files</Button>}
      </Stack>
      {folder?.folderDate && <Typography variant="body2" color="text.secondary">{formatDate(folder.folderDate)}</Typography>}
      {folder?.description && <Typography variant="body2" sx={{ mb: 1 }}>{folder.description}</Typography>}
      {subfolders.length > 0 && (
        <Box component="nav" aria-label="Subfolders" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Subfolders</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {subfolders.map((sub) => (
              <Chip
                key={sub._id}
                component={RouterLink}
                to={`/evidence/${sub._id}`}
                clickable
                label={`${sub.name} · ${sub.fileCount} file${sub.fileCount === 1 ? '' : 's'}${sub.untaggedCount ? ` · ${sub.untaggedCount} untagged` : ''}`}
                sx={{ maxWidth: '100%' }}
              />
            ))}
          </Stack>
        </Box>
      )}
      <FormControlLabel
        control={<Switch checked={untaggedOnly} onChange={(e) => setUntaggedOnly(e.target.checked)} />}
        label="Untagged only"
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <CircularProgress /> : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Files">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Date</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Size</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {files.length === 0 && (
                <TableRow><TableCell colSpan={5}>{untaggedOnly ? 'No untagged files.' : 'No files in this folder.'}</TableCell></TableRow>
              )}
              {files.map((f) => (
                <TableRow key={f._id}>
                  <TableCell sx={{ overflowWrap: 'anywhere', minWidth: 120 }}>
                    {f.fileName}
                    {f.what && <Typography variant="caption" component="div" color="text.secondary">{f.what}</Typography>}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fileDate(f)}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, whiteSpace: 'nowrap' }}>{fileSize(f.size)}</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      {(f.links || []).length === 0 && <Chip size="small" color="warning" label="Untagged" />}
                      {(f.links || []).map((l) => (
                        <Chip
                          key={l._id}
                          size="small"
                          label={linkLabel(l)}
                          sx={{ maxWidth: '100%' }}
                          {...(isAdmin && { onDelete: () => setUnlinking({ file: f, link: l }) })}
                        />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.5}>
                      <Button size="small" onClick={() => handleOpen(f)} aria-label={`Open ${f.fileName}`}>Open</Button>
                      <Button size="small" onClick={() => setTagging(f)} aria-label={`Tag ${f.fileName}`}>Tag</Button>
                      {isAdmin && (
                        <Button size="small" color="error" onClick={() => setDeleting(f)} aria-label={`Delete ${f.fileName}`}>Delete</Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {tagging && (
        <EvidenceTagDialog
          file={tagging}
          onClose={() => setTagging(null)}
          onSaved={() => { setTagging(null); changed(); }}
        />
      )}
      {adding && (
        <AddFilesDialog
          folderId={folderId}
          onClose={() => setAdding(false)}
          onDone={(any) => { if (any) changed(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete file"
          text={`Delete "${deleting.fileName}" from the library? The stored file is removed. A record is kept in the audit log.`}
          reasonRequired
          confirmLabel="Confirm delete"
          onClose={() => setDeleting(null)}
          onConfirm={async (reason) => { await deleteEvidenceFile(deleting._id, reason); setDeleting(null); changed(); }}
        />
      )}
      {unlinking && (
        <ConfirmDialog
          title="Remove tag"
          text={`Remove the tag "${linkLabel(unlinking.link)}" from "${unlinking.file.fileName}"? The file stays in the library.`}
          confirmLabel="Remove tag"
          onClose={() => setUnlinking(null)}
          onConfirm={async (reason) => {
            await removeEvidenceLink(unlinking.file._id, unlinking.link._id, reason);
            setUnlinking(null);
            changed();
          }}
        />
      )}
    </Box>
  );
};

export default EvidenceFolderPage;
