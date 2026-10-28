import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControl, InputLabel, Link as MuiLink, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import FormDialog, { FormSection } from '../components/ui/FormDialog';
import KeyFacts from '../components/ui/KeyFacts';
import RowList from '../components/ui/RowList';
import StatusBadge from '../components/ui/StatusBadge';
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
  ISSUE_CATEGORIES, NOTE_REQUIRED_STATUSES, REPORTED_VIA, RESOLVED, issueReference,
} from '../constants/issueFields';
import { useMdas } from '../api/mdas';
import { dateLine, formatDate } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

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
    <FormDialog
      open
      onClose={saving ? undefined : onClose}
      title="Edit details"
      help="Status and resolution have their own form. The investor never changes."
      actions={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.category || !form.description.trim()}>{saving ? 'Saving...' : 'Save details'}</Button>
        </>
      )}
    >
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <FormSection title="The issue" first>
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
        </FormSection>
        <FormSection title="Who acts and when">
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
        </FormSection>
        <FormSection title="Project">
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
        </FormSection>
    </FormDialog>
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

  let outcome = null;
  if (issue.status === RESOLVED) outcome = `Resolved ${formatDate(issue.resolvedDate)}: ${issue.resolution}`;
  else if (NOTE_REQUIRED_STATUSES.includes(issue.status) && issue.resolution) outcome = `${issue.status}: ${issue.resolution}`;
  const facts = [
    { label: 'Reported', value: `${dateLine(issue, 'dateReported')}${issue.reportedVia ? ` · via ${issue.reportedVia}` : ''}` },
    { label: 'Registered', value: formatDate(issue.dateRegistered) || '—' },
    (issue.project || issue.projectText) ? {
      label: 'Project',
      value: issue.project ? <MuiLink component={RouterLink} to={`/projects/${issue.project._id}`}>{issue.project.projectTitle}</MuiLink> : issue.projectText,
    } : null,
    issue.mdaResponsible?.length > 0 ? { label: 'MDA responsible', value: issue.mdaResponsible.map(mdaName).join(', ') } : null,
    outcome ? { label: 'Outcome', value: outcome, multiline: true } : null,
  ];

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        breadcrumbs={[{ label: 'Investor issues', to: '/issues' }, { label: reference || 'Issue' }]}
        eyebrow={reference ? `Issue ${reference}` : 'Investor issue'}
        title={issue.investor ? (
          <MuiLink component={RouterLink} to={`/investors/${issue.investor._id}`} underline="hover">{issue.investor.investorName}</MuiLink>
        ) : 'Investor issue'}
        meta={(
          <>
            <StatusBadge label={issue.status} />
            {issue.category && <StatusBadge label={issue.category} />}
          </>
        )}
        actions={(canWrite || isAdmin) ? (
          <>
            {canWrite && <Button variant="outlined" onClick={() => setEditing(true)}>Edit details</Button>}
            {isAdmin && <Button variant="outlined" color="error" onClick={() => setDeleting(true)}>Delete</Button>}
          </>
        ) : null}
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start' }}>
        <Box sx={{ flex: '999 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SectionCard title="Issue">
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 2, overflowWrap: 'anywhere' }}>{issue.description}</Typography>
            <KeyFacts items={facts} ariaLabel="Issue facts" />
            {issue.importNote && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{`Import note: ${issue.importNote}`}</Typography>}
          </SectionCard>

          <SectionCard title="Actions">
            <RowList
              ariaLabel="Issue actions"
              empty="No actions yet."
              rows={actions.map((a) => ({
                key: a._id,
                primary: a.note,
                preWrap: true,
                secondary: `${formatDate(a.date)}${a.by ? ` · ${a.by}` : ''} · recorded by ${a.recordedBy?.name || 'unknown'} on ${formatDate(a.recordedAt)}`,
              }))}
            />
            {canWrite && <ActionForm issue={issue} onSaved={merge} />}
          </SectionCard>
        </Box>

        <Box sx={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {canWrite && (
            <SectionCard title="Status">
              <IssueStatusForm key={`${issue.status}-${issue.resolution || ''}`} issue={issue} onSaved={merge} />
            </SectionCard>
          )}

          <SectionCard
            title="Files"
            actions={canWrite ? <Button variant="outlined" size="small" onClick={() => setUploading(true)}>Attach file</Button> : null}
          >
            {fileError && <Alert severity="error" sx={{ mb: 1 }}>{fileError}</Alert>}
            <RowList
              ariaLabel="Issue files"
              empty="No files."
              rows={(issue.files || []).map((f) => ({
                key: f._id,
                primary: f.fileName,
                secondary: formatDate(f.documentDate || f.uploadedAt),
                actions: <Button size="small" onClick={() => handleOpen(f)}>Open</Button>,
              }))}
            />
          </SectionCard>
        </Box>
      </Box>

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
