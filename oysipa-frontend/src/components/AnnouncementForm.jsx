import React, { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Switch, TextField,
} from '@mui/material';
import HappenedDateField from './HappenedDateField';
import apiClient from '../api/api';
import { announcementErrorMessage, createAnnouncement, updateAnnouncement } from '../api/announcements';
import { isHttpUrl } from '../constants/announcementFields';
import { getCurrentUser } from '../utils/currentUser';
import { lagosDay } from '../utils/dates';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v);

// Staff can only register announcements on projects of investors assigned to
// them (the server checks too).
const writableInvestorIds = (investors, user) => new Set((investors || [])
  .filter((i) => user?.role !== 'Staff' || (idOf(i.assignedTo) && String(idOf(i.assignedTo)) === String(user.id)))
  .map((i) => String(i._id)));

const toOption = (p, investorName) => ({
  _id: p._id,
  projectTitle: p.projectTitle,
  investorName: investorName || p.investor?.investorName || '',
});

const formFrom = (a, projectId) => ({
  project: a ? idOf(a.project) : (projectId || ''),
  announcementDate: a?.announcementDate ? lagosDay(a.announcementDate) : '',
  outlet: a?.outlet || '',
  url: a?.url || '',
  archivedCopyUrl: a?.archivedCopyUrl || '',
  oysipaNamed: !!a?.oysipaNamed,
  oysipaRoleText: a?.oysipaRoleText || '',
});

// Register (or, with `announcement`, edit) an investment announcement.
// `projectId` preselects and fixes the project (project page). On edit the
// project can change only to another project of the same investor.
const AnnouncementForm = ({
  open, onClose, onSaved, announcement, projectId,
}) => {
  const editing = !!announcement;
  const [form, setForm] = useState(() => formFrom(announcement, projectId));
  const [initial, setInitial] = useState(() => formFrom(announcement, projectId));
  const [options, setOptions] = useState([]);
  const [optionsError, setOptionsError] = useState('');
  const [noProjects, setNoProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const start = formFrom(announcement, projectId);
    setForm(start);
    setInitial(start);
    setError('');
    setNoProjects(false);
    if (projectId && !editing) return undefined;
    let active = true;
    const load = async () => {
      try {
        if (editing) {
          const investor = announcement.project?.investor;
          const investorId = idOf(investor);
          if (!investorId) { setOptions(announcement.project?._id ? [toOption(announcement.project)] : []); return; }
          const { data } = await apiClient.get(`/api/projects/investors/${investorId}/projects`);
          if (active) setOptions((data || []).map((p) => toOption(p, investor?.investorName)));
        } else {
          const [{ data: projects }, { data: investors }] = await Promise.all([
            apiClient.get('/api/projects'),
            apiClient.get('/api/investors'),
          ]);
          const allowed = writableInvestorIds(investors, getCurrentUser());
          const list = (projects || [])
            .filter((p) => allowed.has(String(idOf(p.investor))))
            .map((p) => toOption(p))
            .sort((a, b) => a.projectTitle.localeCompare(b.projectTitle));
          if (active) {
            setOptions(list);
            setNoProjects(list.length === 0 && getCurrentUser()?.role === 'Staff');
          }
        }
        if (active) setOptionsError('');
      } catch {
        if (active) { setOptions([]); setOptionsError('Could not load the projects.'); }
      }
    };
    load();
    return () => { active = false; };
  }, [open, announcement, projectId, editing]);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const projectMissing = editing && !idOf(announcement.project);
  const selected = options.find((o) => String(o._id) === String(form.project)) || null;

  const urlError = form.url.trim() && !isHttpUrl(form.url.trim());
  const archivedError = form.archivedCopyUrl.trim() && !isHttpUrl(form.archivedCopyUrl.trim());
  const roleMissing = form.oysipaNamed && !form.oysipaRoleText.trim();
  const canSave = form.project && form.announcementDate && form.outlet.trim()
    && !urlError && !archivedError && !roleMissing && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const trimmed = {
        outlet: form.outlet.trim(),
        url: form.url.trim(),
        archivedCopyUrl: form.archivedCopyUrl.trim(),
        oysipaRoleText: form.oysipaRoleText.trim(),
      };
      let saved;
      if (editing) {
        // Only the changed fields are sent ('' clears a link).
        const body = {
          ...(String(form.project) !== String(initial.project) && { project: form.project }),
          ...(form.announcementDate !== initial.announcementDate && { announcementDate: form.announcementDate }),
          ...(trimmed.outlet !== initial.outlet && { outlet: trimmed.outlet }),
          ...(trimmed.url !== initial.url && { url: trimmed.url }),
          ...(trimmed.archivedCopyUrl !== initial.archivedCopyUrl && { archivedCopyUrl: trimmed.archivedCopyUrl }),
          ...(form.oysipaNamed !== initial.oysipaNamed && { oysipaNamed: form.oysipaNamed }),
          ...(trimmed.oysipaRoleText !== initial.oysipaRoleText && { oysipaRoleText: trimmed.oysipaRoleText }),
        };
        saved = Object.keys(body).length ? await updateAnnouncement(announcement._id, body) : announcement;
      } else {
        saved = await createAnnouncement({
          project: form.project,
          announcementDate: form.announcementDate,
          outlet: trimmed.outlet,
          ...(trimmed.url && { url: trimmed.url }),
          ...(trimmed.archivedCopyUrl && { archivedCopyUrl: trimmed.archivedCopyUrl }),
          oysipaNamed: form.oysipaNamed,
          ...(trimmed.oysipaRoleText && { oysipaRoleText: trimmed.oysipaRoleText }),
        });
      }
      onSaved?.(saved);
    } catch (err) {
      setError(announcementErrorMessage(err, editing ? 'Failed to save the announcement.' : 'Failed to register the announcement.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? 'Edit announcement' : 'Register announcement'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {optionsError && <Alert severity="warning" sx={{ mb: 1 }}>{optionsError}</Alert>}
        {noProjects && <Alert severity="info" sx={{ mb: 1 }}>You have no assigned investors&apos; projects to register on.</Alert>}
        {projectMissing && <Alert severity="warning" sx={{ mb: 1 }}>This announcement&apos;s project could not be loaded.</Alert>}
        {!(projectId && !editing) && (
          <Autocomplete
            options={options}
            value={selected}
            onChange={(e, value) => set('project')(value ? value._id : '')}
            getOptionLabel={(o) => (o.investorName ? `${o.projectTitle} — ${o.investorName}` : o.projectTitle || '')}
            isOptionEqualToValue={(o, v) => String(o._id) === String(v._id)}
            disabled={saving}
            renderInput={(params) => (
              <TextField {...params} label="Project" required margin="dense" variant="standard" placeholder="Search by project or investor" />
            )}
          />
        )}
        <HappenedDateField
          label="Announcement date"
          required
          value={form.announcementDate}
          onChange={set('announcementDate')}
          disabled={saving}
          helperText="When it was published"
        />
        <TextField
          label="Outlet"
          required
          fullWidth
          margin="dense"
          variant="standard"
          value={form.outlet}
          onChange={(e) => set('outlet')(e.target.value)}
          disabled={saving}
          helperText="Who published it, e.g. a newspaper or the State website"
        />
        <TextField
          label="Link"
          fullWidth
          margin="dense"
          variant="standard"
          value={form.url}
          onChange={(e) => set('url')(e.target.value)}
          disabled={saving}
          error={!!urlError}
          helperText={urlError ? 'Use a link starting with http:// or https://' : ' '}
        />
        <TextField
          label="Archived copy link"
          fullWidth
          margin="dense"
          variant="standard"
          value={form.archivedCopyUrl}
          onChange={(e) => set('archivedCopyUrl')(e.target.value)}
          disabled={saving}
          error={!!archivedError}
          helperText={archivedError ? 'Use a link starting with http:// or https://' : 'e.g. a web archive link'}
        />
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Switch checked={form.oysipaNamed} onChange={(e) => set('oysipaNamed')(e.target.checked)} disabled={saving} />}
          label="OYSIPA named"
        />
        <TextField
          label="What it says OYSIPA did"
          required={form.oysipaNamed}
          fullWidth
          multiline
          minRows={2}
          margin="dense"
          variant="standard"
          value={form.oysipaRoleText}
          onChange={(e) => set('oysipaRoleText')(e.target.value)}
          disabled={saving}
          error={roleMissing}
          helperText={roleMissing ? 'Required when OYSIPA is named' : ' '}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving...' : (editing ? 'Save' : 'Register')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AnnouncementForm;
