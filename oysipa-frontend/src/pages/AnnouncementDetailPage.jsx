import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, Link as MuiLink, Stack, TextField, Typography,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import KeyFacts from '../components/ui/KeyFacts';
import RowList from '../components/ui/RowList';
import StatusBadge from '../components/ui/StatusBadge';
import HappenedDateField from '../components/HappenedDateField';
import AnnouncementForm from '../components/AnnouncementForm';
import apiClient from '../api/api';
import {
  announcementErrorMessage, deleteAnnouncement, fetchAnnouncement, linkAnnouncementInteractions,
  unlinkAnnouncementInteraction, uploadAnnouncementFile,
} from '../api/announcements';
import { DOCUMENT_ACCEPT, documentErrorMessage, openEvidenceFile } from '../api/documents';
import { notifyUntaggedChanged } from '../api/evidence';
import { dateLine, formatDate } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v);

// Opens in a new tab, without giving the page access to this one.
const ExternalLink = ({ href }) => (
  <MuiLink href={href} target="_blank" rel="noopener noreferrer" sx={{ overflowWrap: 'anywhere' }}>{href}</MuiLink>
);

const interactionLine = (log) => `${formatDate(log.interactionDate || log.createdAt)} · ${log.description || log.category || 'Interaction'}`;

const LinkInteractionsDialog = ({ announcement, onClose, onLinked }) => {
  const [logs, setLogs] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const investorId = idOf(announcement.project?.investor);
  const linked = new Set((announcement.supportingInteractions || []).map((l) => String(idOf(l))));

  useEffect(() => {
    let active = true;
    if (!investorId) { setLogs([]); return undefined; }
    // The investor's timeline: investor-level and project interactions.
    apiClient.get(`/api/interactions/investors/${investorId}`)
      .then(({ data }) => { if (active) setLogs(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) { setLogs([]); setError('Could not load the interactions.'); } });
    return () => { active = false; };
  }, [investorId]);

  const candidates = (logs || []).filter((l) => !linked.has(String(l._id)));
  const toggle = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      onLinked(await linkAnnouncementInteractions(announcement._id, chosen));
    } catch (err) {
      setError(announcementErrorMessage(err, 'Failed to link the interactions.'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Link interactions</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 1 }}>Interactions of this project or its investor that show OYSIPA&apos;s support.</DialogContentText>
        {logs === null && <Typography color="text.secondary">Loading...</Typography>}
        {logs !== null && candidates.length === 0 && <Typography color="text.secondary">No other interactions to link.</Typography>}
        <Stack>
          {candidates.map((l) => (
            <FormControlLabel
              key={l._id}
              control={<Checkbox checked={chosen.includes(l._id)} onChange={() => toggle(l._id)} disabled={saving} />}
              label={`${interactionLine(l)}${l.project?.projectTitle ? ` (${l.project.projectTitle})` : ''}`}
              sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { pt: 1, overflowWrap: 'anywhere' } }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || chosen.length === 0}>{saving ? 'Linking...' : 'Link'}</Button>
      </DialogActions>
    </Dialog>
  );
};

const UploadDialog = ({ announcement, onClose, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [documentDate, setDocumentDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const upload = async () => {
    if (!file) { setError('Choose a file to attach.'); return; }
    setUploading(true);
    setError('');
    try {
      onUploaded(await uploadAnnouncementFile(announcement._id, file, { documentDate }));
    } catch (err) {
      setError(announcementErrorMessage(err, 'Failed to attach the file.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Attach file</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 1 }}>An archived copy, kept privately in the Evidence library under Announcements.</DialogContentText>
        <Button variant="outlined" component="label" disabled={uploading}>
          {file ? file.name : 'Choose file'}
          <input type="file" hidden accept={DOCUMENT_ACCEPT} aria-label="Announcement file" onChange={(e) => setFile(e.target.files[0] || null)} />
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

const DeleteDialog = ({ announcement, onClose, onDeleted }) => {
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await deleteAnnouncement(announcement._id, reason.trim());
      onDeleted();
    } catch (err) {
      setError(announcementErrorMessage(err, 'Failed to delete the announcement.'));
      setDeleting(false);
    }
  };
  return (
    <Dialog open onClose={deleting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Delete this announcement?</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText sx={{ mb: 2 }}>Its files stay in the Evidence library. A record of the announcement is kept in the audit log.</DialogContentText>
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

// One investment announcement: details, links, supporting interactions, files.
const AnnouncementDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const user = getCurrentUser();
  const isAdmin = isAdminRole(user?.role);
  const investor = announcement?.project?.investor;
  const assignedTo = idOf(investor?.assignedTo);
  const canWrite = isAdmin || (user?.role === 'Staff' && !!assignedTo && String(assignedTo) === String(user?.id));

  const load = useCallback(async () => {
    try {
      setAnnouncement(await fetchAnnouncement(id));
      setError('');
    } catch (err) {
      setError(announcementErrorMessage(err, 'Failed to load the announcement.'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async (file) => {
    setActionError('');
    try {
      await openEvidenceFile(file._id);
    } catch (err) {
      setActionError(documentErrorMessage(err, 'Could not open the file.'));
    }
  };

  const handleUnlink = async (log) => {
    setActionError('');
    try {
      setAnnouncement(await unlinkAnnouncementInteraction(announcement._id, log._id));
    } catch (err) {
      // Already unlinked (e.g. in another tab): show the current list.
      if (err?.response?.status === 404) { load(); return; }
      setActionError(announcementErrorMessage(err, 'Failed to unlink the interaction.'));
    }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!announcement) return <div>Loading...</div>;

  const { project } = announcement;
  const supporting = announcement.supportingInteractions || [];

  const facts = [
    {
      label: 'Project',
      value: project ? <MuiLink component={RouterLink} to={`/projects/${project._id}`}>{project.projectTitle}</MuiLink> : 'Unknown',
    },
    investor ? {
      label: 'Investor',
      value: <MuiLink component={RouterLink} to={`/investors/${investor._id}`}>{investor.investorName}</MuiLink>,
    } : null,
    { label: 'Published', value: dateLine(announcement, 'announcementDate') },
    { label: 'Outlet', value: announcement.outlet },
    { label: 'Link', value: announcement.url ? <ExternalLink href={announcement.url} /> : 'None' },
    { label: 'Archived copy', value: announcement.archivedCopyUrl ? <ExternalLink href={announcement.archivedCopyUrl} /> : 'None' },
    { label: 'OYSIPA named', value: announcement.oysipaNamed ? 'Yes' : 'No' },
    announcement.oysipaRoleText ? { label: 'What it says OYSIPA did', value: announcement.oysipaRoleText, multiline: true } : null,
  ];

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        breadcrumbs={[{ label: 'Investment announcements', to: '/announcements' }, { label: 'Announcement' }]}
        eyebrow="Announcement"
        title={announcement.outlet}
        subtitle={dateLine(announcement, 'announcementDate')}
        meta={<StatusBadge label={announcement.oysipaNamed ? 'OYSIPA named' : 'OYSIPA not named'} />}
        actions={(canWrite || isAdmin) ? (
          <>
            {canWrite && <Button variant="outlined" onClick={() => setEditing(true)}>Edit</Button>}
            {isAdmin && <Button variant="outlined" color="error" onClick={() => setDeleting(true)}>Delete</Button>}
          </>
        ) : null}
      />

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
      {notice && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start' }}>
        <Box sx={{ flex: '999 1 480px', minWidth: 0 }}>
          <SectionCard title="Announcement">
            <KeyFacts items={facts} ariaLabel="Announcement facts" />
            {announcement.createdBy?.name && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{`Recorded by ${announcement.createdBy.name} on ${formatDate(announcement.createdAt)}`}</Typography>
            )}
            {announcement.importNote && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{`Import note: ${announcement.importNote}`}</Typography>}
          </SectionCard>
        </Box>

        <Box sx={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SectionCard
            title="Supporting interactions"
            actions={canWrite ? <Button variant="outlined" size="small" onClick={() => setLinking(true)}>Link interactions</Button> : null}
          >
            <RowList
              ariaLabel="Supporting interactions"
              empty="No interactions linked."
              rows={supporting.map((l) => ({
                key: l._id,
                primary: l.description || l.category || 'Interaction',
                secondary: [formatDate(l.interactionDate || l.createdAt), l.project?.projectTitle].filter(Boolean).join(' · '),
                actions: canWrite ? <Button size="small" onClick={() => handleUnlink(l)}>Unlink</Button> : null,
              }))}
            />
          </SectionCard>

          <SectionCard
            title="Files"
            actions={canWrite ? <Button variant="outlined" size="small" onClick={() => setUploading(true)}>Attach file</Button> : null}
          >
            <RowList
              ariaLabel="Announcement files"
              empty="No files."
              rows={(announcement.files || []).map((f) => ({
                key: f._id,
                primary: f.fileName,
                secondary: formatDate(f.documentDate || f.uploadedAt),
                actions: <Button size="small" onClick={() => handleOpen(f)}>Open</Button>,
              }))}
            />
          </SectionCard>
        </Box>
      </Box>

      <AnnouncementForm
        open={editing}
        announcement={announcement}
        onClose={() => setEditing(false)}
        onSaved={(updated) => { setEditing(false); setAnnouncement(updated); }}
      />
      {linking && (
        <LinkInteractionsDialog
          announcement={announcement}
          onClose={() => setLinking(false)}
          onLinked={(updated) => { setLinking(false); setAnnouncement(updated); }}
        />
      )}
      {uploading && (
        <UploadDialog announcement={announcement} onClose={() => setUploading(false)} onUploaded={(result) => {
            setUploading(false);
            setNotice(result?.linkedExisting ? 'This file was already in the Evidence library; it is now linked here.' : '');
            notifyUntaggedChanged();
            load();
          }}
        />
      )}
      {deleting && <DeleteDialog announcement={announcement} onClose={() => setDeleting(false)} onDeleted={() => navigate('/announcements')} />}
    </Box>
  );
};

export default AnnouncementDetailPage;
