import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Breadcrumbs, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControl, InputLabel, Link as MuiLink, List, ListItem, ListItemText, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import HappenedDateField from '../components/HappenedDateField';
import MdaPicker from '../components/MdaPicker';
import IssueStatusForm from '../components/IssueStatusForm';
import {
  addIssueAction, deleteIssue, fetchIssue, issueErrorMessage, updateIssue, uploadIssueFile,
} from '../api/issues';
import apiClient from '../api/api';
import { DOCUMENT_ACCEPT, documentErrorMessage, openEvidenceFile } from '../api/documents';
import { notifyUntaggedChanged } from '../api/evidence';
import {
  ISSUE_CATEGORIES, NOTE_REQUIRED_STATUSES, REPORTED_VIA, RESOLVED, STATUS_COLORS, issueReference,
} from '../constants/issueFields';
import { useMdas } from '../api/mdas';
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

// Edit details (story 11.7b): category, MDAs, date reported, reported via,
// project (the investor's own) and project text. Status and resolution keep
// their own form; the investor never changes. The server validates as on register.
const EditDetailsDialog = ({ issue, onClose, onSaved }) => {
  const projectId = issue.project?._id || issue.project || '';
  const [initial] = useState(() => ({
    category: issue.category || '',
    description: issue.description || '',
    mdaResponsible: issue.mdaResponsible || [],
    dateReported: issue.dateReported ? String(issue.dateReported).slice(0, 10) : '',
    reportedVia: issue.reportedVia || '',
    project: projectId,
    projectText: issue.projectText || '',
  }));
  const [form, setForm] = useState(initial);
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { mdas, error: mdaError } = useMdas();
  const investorId = issue.investor?._id || issue.investor;

  useEffect(() => {
    if (!investorId) return undefined;
    let active = true;
    apiClient.get(`/api/projects/investors/${investorId}/projects`)
      .then(({ data }) => { if (active) { setProjects(Array.isArray(data) ? data : []); setProjectsError(''); } })
      .catch(() => {
        if (active) { setProjects([]); setProjectsError("Could not load this investor's projects."); }
      });
    return () => { active = false; };
  }, [investorId]);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  // The current project stays choosable even before (or without) the list.
  const projectOptions = projectId && issue.project?.projectTitle && !projects.some((p) => String(p._id) === String(projectId))
    ? [{ _id: projectId, projectTitle: issue.project.projectTitle }, ...projects]
    : projects;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      // Only the fields the user changed are sent, so a stored value no longer
      // on a list (e.g. an unknown MDA code) never blocks other edits.
      // '' clears reported via, project and project text on the server.
      const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
      const body = {
        ...(form.category !== initial.category && { category: form.category }),
        ...(form.description.trim() !== initial.description && { description: form.description.trim() }),
        ...(!sameList(form.mdaResponsible, initial.mdaResponsible) && { mdaResponsible: form.mdaResponsible }),
        ...(form.dateReported && form.dateReported !== initial.dateReported && { dateReported: form.dateReported }),
        ...(form.reportedVia !== initial.reportedVia && { reportedVia: form.reportedVia }),
        ...(String(form.project) !== String(initial.project) && { project: form.project }),
        ...(form.projectText.trim() !== initial.projectText && { projectText: form.projectText.trim() }),
      };
      const updated = Object.keys(body).length ? await updateIssue(issue._id, body) : issue;
      onSaved(updated);
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to save the details.'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit details</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <FormControl fullWidth margin="dense" variant="standard" required>
          <InputLabel id="edit-issue-category-label">Category</InputLabel>
          <Select labelId="edit-issue-category-label" value={form.category} onChange={(e) => set('category')(e.target.value)} disabled={saving}>
            {ISSUE_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Description"
          required
          fullWidth
          multiline
          minRows={3}
          margin="dense"
          variant="standard"
          value={form.description}
          onChange={(e) => set('description')(e.target.value)}
          disabled={saving}
          error={!form.description.trim()}
          helperText={!form.description.trim() ? 'A description is required.' : ' '}
        />
        {mdaError && <Alert severity="warning" sx={{ mt: 1 }}>Could not load the MDA list.</Alert>}
        <MdaPicker
          id="edit-issue-mda"
          mdas={mdas}
          value={form.mdaResponsible}
          onChange={set('mdaResponsible')}
          disabled={saving}
          placeholder="Search by name or abbreviation"
        />
        <HappenedDateField label="Date reported" value={form.dateReported} onChange={set('dateReported')} disabled={saving} helperText="Leave empty to keep it" />
        <FormControl fullWidth margin="dense" variant="standard">
          <InputLabel id="edit-issue-via-label">Reported via</InputLabel>
          <Select labelId="edit-issue-via-label" value={form.reportedVia} onChange={(e) => set('reportedVia')(e.target.value)} disabled={saving}>
            <MenuItem value="">Not recorded</MenuItem>
            {REPORTED_VIA.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        {projectsError && <Alert severity="warning" sx={{ mt: 1 }}>{projectsError}</Alert>}
        <FormControl fullWidth margin="dense" variant="standard" disabled={saving}>
          <InputLabel id="edit-issue-project-label">Project</InputLabel>
          <Select labelId="edit-issue-project-label" value={form.project} onChange={(e) => set('project')(e.target.value)}>
            <MenuItem value="">No project</MenuItem>
            {projectOptions.map((p) => <MenuItem key={p._id} value={p._id}>{p.projectTitle}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Project text"
          fullWidth
          margin="dense"
          variant="standard"
          value={form.projectText}
          onChange={(e) => set('projectText')(e.target.value)}
          disabled={saving}
          helperText="Free text, e.g. the project as named in a loaded issue"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !form.category || !form.description.trim()}>{saving ? 'Saving...' : 'Save details'}</Button>
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
  const [editing, setEditing] = useState(false);
  const { nameOf: mdaName } = useMdas();
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
  const reference = issueReference(issue);

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink component={RouterLink} to="/issues">Investor issues</MuiLink>
        <Typography color="text.primary">{reference || 'Issue'}</Typography>
      </Breadcrumbs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          {reference && <Typography variant="overline" component="p" color="text.secondary">{`Issue ${reference}`}</Typography>}
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
        <Stack direction="row" spacing={1}>
          {canWrite && <Button variant="outlined" onClick={() => setEditing(true)}>Edit details</Button>}
          {isAdmin && <Button color="error" onClick={() => setDeleting(true)}>Delete</Button>}
        </Stack>
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
            {`MDA responsible: ${issue.mdaResponsible.map(mdaName).join(', ')}`}
          </Typography>
        )}
        {issue.status === RESOLVED && (
          <Typography variant="body2" sx={{ mt: 1 }}>{`Resolved ${formatDate(issue.resolvedDate)}: ${issue.resolution}`}</Typography>
        )}
        {issue.status !== RESOLVED && NOTE_REQUIRED_STATUSES.includes(issue.status) && issue.resolution && (
          <Typography variant="body2" sx={{ mt: 1 }}>{`${issue.status}: ${issue.resolution}`}</Typography>
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
      {editing && (
        <EditDetailsDialog issue={issue} onClose={() => setEditing(false)} onSaved={(updated) => { setEditing(false); merge(updated); }} />
      )}
      {deleting && <DeleteDialog issue={issue} onClose={() => setDeleting(false)} onDeleted={() => navigate('/issues')} />}
    </Box>
  );
};

export default IssueDetailPage;
