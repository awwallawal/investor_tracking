import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Breadcrumbs, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link as MuiLink, List, ListItem, ListItemText, Paper, Stack, TextField, Typography,
} from '@mui/material';
import HappenedDateField from '../components/HappenedDateField';
import IssueStatusForm from '../components/IssueStatusForm';
import {
  addIssueAction, deleteIssue, fetchIssue, issueErrorMessage, uploadIssueFile,
} from '../api/issues';
import { DOCUMENT_ACCEPT, documentErrorMessage, openEvidenceFile } from '../api/documents';
import { notifyUntaggedChanged } from '../api/evidence';
import { RESOLVED, STATUS_COLORS, isMouMda } from '../constants/issueFields';
import { dateLine, formatDate } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

const Section = ({ title, children }) => (
  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
    <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{title}</Typography>
    {children}
  </Paper>
);

const ActionForm = ({ issue, onSaved }) => {
  const [date, setDate] = useState('');
  const [by, setBy] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await addIssueAction(issue._id, {
        note: note.trim(), ...(date && { date }), ...(by.trim() && { by: by.trim() }),
      });
      setDate(''); setBy(''); setNote('');
      onSaved(updated);
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to add the action.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2">Add action</Typography>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
      <TextField label="What was done" fullWidth multiline minRows={2} margin="dense" variant="standard" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} required />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="By (leave empty for you)" fullWidth margin="dense" variant="standard" value={by} onChange={(e) => setBy(e.target.value)} disabled={saving} />
        <HappenedDateField label="Action date" value={date} onChange={setDate} disabled={saving} />
      </Stack>
      <Button variant="outlined" onClick={save} disabled={saving || !note.trim()} sx={{ mt: 1 }}>
        {saving ? 'Adding...' : 'Add action'}
      </Button>
    </Box>
  );
};

const UploadDialog = ({ issue, onClose, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [documentDate, setDocumentDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const upload = async () => {
    if (!file) { setError('Choose a file to attach.'); return; }
    setUploading(true);
    setError('');
    try {
      await uploadIssueFile(issue._id, file, { documentDate });
      onUploaded();
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to attach the file.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Attach file</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 1 }}>The file is kept privately in the Evidence library, under Investor issues.</DialogContentText>
        <Button variant="outlined" component="label" disabled={uploading}>
          {file ? file.name : 'Choose file'}
          <input type="file" hidden accept={DOCUMENT_ACCEPT} aria-label="Issue file" onChange={(e) => setFile(e.target.files[0] || null)} />
        </Button>
        <HappenedDateField label="Document date" value={documentDate} onChange={setDocumentDate} disabled={uploading} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>Cancel</Button>
        <Button onClick={upload} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</Button>
      </DialogActions>
    </Dialog>
  );
};

const DeleteDialog = ({ issue, onClose, onDeleted }) => {
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await deleteIssue(issue._id, reason.trim());
      onDeleted();
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to delete the issue.'));
      setDeleting(false);
    }
  };
  return (
    <Dialog open onClose={deleting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Delete this issue?</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 2 }}>Its files stay in the Evidence library. A record of the issue is kept in the audit log.</DialogContentText>
        <TextField label="Reason" required fullWidth multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={deleting} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={deleting || !reason.trim()}>
          {deleting ? 'Deleting...' : 'Confirm delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// One investor issue: details, actions timeline, status / resolve and files.
const IssueDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [issue, setIssue] = useState(null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const user = getCurrentUser();
  const isAdmin = isAdminRole(user?.role);
  const assignedTo = issue?.investor?.assignedTo;
  const canWrite = isAdmin || (user?.role === 'Staff' && !!assignedTo && String(assignedTo?._id || assignedTo) === String(user?.id));

  const load = useCallback(async () => {
    try {
      setIssue(await fetchIssue(id));
      setError('');
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to load the issue.'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Updates return the issue without its files: keep the files we have.
  const merge = (updated) => setIssue((prev) => ({ ...updated, files: prev?.files || [] }));

  const handleOpen = async (file) => {
    setFileError('');
    try {
      await openEvidenceFile(file._id);
    } catch (err) {
      setFileError(documentErrorMessage(err, 'Could not open the file.'));
    }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!issue) return <div>Loading...</div>;

  const actions = [...(issue.actions || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink component={RouterLink} to="/issues">Investor issues</MuiLink>
        <Typography color="text.primary">{issue.importRef || 'Issue'}</Typography>
      </Breadcrumbs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ overflowWrap: 'anywhere' }}>
            {issue.investor ? (
              <MuiLink component={RouterLink} to={`/investors/${issue.investor._id}`} underline="hover">{issue.investor.investorName}</MuiLink>
            ) : 'Investor issue'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
            <Chip label={issue.status} color={STATUS_COLORS[issue.status] || 'default'} />
            <Chip label={issue.category} variant="outlined" />
          </Stack>
        </Box>
        {isAdmin && <Button color="error" onClick={() => setDeleting(true)}>Delete</Button>}
      </Stack>

      <Section title="Issue">
        <Typography sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{issue.description}</Typography>
        <Typography variant="body2">{`Reported: ${dateLine(issue, 'dateReported')}${issue.reportedVia ? ` · via ${issue.reportedVia}` : ''}`}</Typography>
        <Typography variant="body2">{`Registered: ${formatDate(issue.dateRegistered)}`}</Typography>
        {(issue.project || issue.projectText) && (
          <Typography variant="body2">
            {'Project: '}
            {issue.project ? <MuiLink component={RouterLink} to={`/projects/${issue.project._id}`}>{issue.project.projectTitle}</MuiLink> : issue.projectText}
          </Typography>
        )}
        {issue.mdaResponsible?.length > 0 && (
          <Typography variant="body2">
            {`MDA responsible: ${issue.mdaResponsible.map((m) => (isMouMda(m) ? `${m} (MoU)` : m)).join(', ')}`}
          </Typography>
        )}
        {issue.status === RESOLVED && (
          <Typography variant="body2" sx={{ mt: 1 }}>{`Resolved ${formatDate(issue.resolvedDate)}: ${issue.resolution}`}</Typography>
        )}
        {issue.importNote && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{`Import note: ${issue.importNote}`}</Typography>}
      </Section>

      <Section title="Actions">
        {actions.length === 0 && <Typography color="text.secondary">No actions yet.</Typography>}
        <List dense disablePadding>
          {actions.map((a) => (
            <ListItem key={a._id} disableGutters alignItems="flex-start">
              <ListItemText
                primary={a.note}
                secondary={`${formatDate(a.date)}${a.by ? ` · ${a.by}` : ''} · recorded by ${a.recordedBy?.name || 'unknown'} on ${formatDate(a.recordedAt)}`}
                slotProps={{ primary: { sx: { whiteSpace: 'pre-wrap' } } }}
              />
            </ListItem>
          ))}
        </List>
        {canWrite && <ActionForm issue={issue} onSaved={merge} />}
      </Section>

      {canWrite && (
        <Section title="Status">
          <IssueStatusForm key={`${issue.status}-${issue.resolution || ''}`} issue={issue} onSaved={merge} />
        </Section>
      )}

      <Section title="Files">
        {fileError && <Alert severity="error" sx={{ mb: 1 }}>{fileError}</Alert>}
        {(issue.files || []).length === 0 && <Typography color="text.secondary">No files.</Typography>}
        <List dense disablePadding>
          {(issue.files || []).map((f) => (
            <ListItem key={f._id} disableGutters secondaryAction={<Button size="small" onClick={() => handleOpen(f)}>Open</Button>}>
              <ListItemText primary={f.fileName} secondary={formatDate(f.documentDate || f.uploadedAt)} slotProps={{ primary: { sx: { overflowWrap: 'anywhere', pr: 6 } } }} />
            </ListItem>
          ))}
        </List>
        {canWrite && <Button variant="outlined" onClick={() => setUploading(true)} sx={{ mt: 1 }}>Attach file</Button>}
      </Section>

      {uploading && (
        <UploadDialog issue={issue} onClose={() => setUploading(false)} onUploaded={() => { setUploading(false); notifyUntaggedChanged(); load(); }} />
      )}
      {deleting && <DeleteDialog issue={issue} onClose={() => setDeleting(false)} onDeleted={() => navigate('/issues')} />}
    </Box>
  );
};

export default IssueDetailPage;
