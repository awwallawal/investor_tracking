import React, { useEffect, useState } from 'react';
import {
  Alert, Button, FormControl, InputLabel,
  MenuItem, Select, TextField,
} from '@mui/material';
import FormDialog, { FormSection } from './ui/FormDialog';
import HappenedDateField from './HappenedDateField';
import MdaPicker from './MdaPicker';
import { useMdas } from '../api/mdas';
import apiClient from '../api/api';
import { createIssue, issueErrorMessage } from '../api/issues';
import { ISSUE_CATEGORIES, REPORTED_VIA } from '../constants/issueFields';
import { getCurrentUser } from '../utils/currentUser';

const EMPTY = {
  investor: '', project: '', dateReported: '', reportedVia: '', mdaResponsible: [], category: '', description: '',
};

// Staff can only register issues for investors assigned to them (the server
// checks too); assignedTo may be an id or a populated user.
const assignedId = (inv) => {
  const a = inv?.assignedTo;
  return a && typeof a === 'object' ? a._id : a;
};
const choosable = (list, user) => (user?.role === 'Staff'
  ? list.filter((i) => assignedId(i) && String(assignedId(i)) === String(user.id))
  : list);

// Register an investor issue. A new issue is always Open; the server sets the
// registered date. `investorId` preselects (and fixes) the investor.
const IssueForm = ({ open, onClose, onSaved, investorId }) => {
  const [form, setForm] = useState({ ...EMPTY, investor: investorId || '' });
  const [investors, setInvestors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { mdas, error: mdaError } = useMdas();

  useEffect(() => {
    if (!open) return undefined;
    setForm({ ...EMPTY, investor: investorId || '' });
    setError('');
    if (investorId) return undefined;
    let active = true;
    apiClient.get('/api/investors')
      .then(({ data }) => {
        if (active) setInvestors(choosable([...(data || [])], getCurrentUser()).sort((a, b) => String(a.investorName).localeCompare(String(b.investorName))));
      })
      .catch(() => { if (active) setInvestors([]); });
    return () => { active = false; };
  }, [open, investorId]);

  useEffect(() => {
    if (!open || !form.investor) { setProjects([]); return undefined; }
    let active = true;
    apiClient.get(`/api/projects/investors/${form.investor}/projects`)
      .then(({ data }) => { if (active) setProjects(data || []); })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, [open, form.investor]);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value, ...(field === 'investor' && { project: '' }) }));

  const canSave = form.investor && form.category && form.description.trim() && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        investor: form.investor,
        category: form.category,
        description: form.description.trim(),
        mdaResponsible: form.mdaResponsible,
        ...(form.project && { project: form.project }),
        ...(form.dateReported && { dateReported: form.dateReported }),
        ...(form.reportedVia && { reportedVia: form.reportedVia }),
      };
      const issue = await createIssue(body);
      onSaved?.(issue);
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to register the issue.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={saving ? undefined : onClose}
      title="Register issue"
      help="An investor's complaint or blocker. Fields marked * are required."
      maxWidth="sm"
      actions={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSave}>{saving ? 'Saving...' : 'Register'}</Button>
        </>
      )}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <FormSection title={investorId ? 'Project' : 'Investor and project'} first>
      {!investorId && (
        <FormControl fullWidth margin="dense" variant="standard" required>
          <InputLabel id="issue-investor-label">Investor</InputLabel>
          <Select labelId="issue-investor-label" value={form.investor} onChange={(e) => set('investor')(e.target.value)} disabled={saving}>
            {investors.map((i) => <MenuItem key={i._id} value={i._id}>{i.investorName}</MenuItem>)}
          </Select>
        </FormControl>
      )}
      <FormControl fullWidth margin="dense" variant="standard" disabled={saving || !form.investor || projects.length === 0}>
        <InputLabel id="issue-project-label">Project (optional)</InputLabel>
        <Select labelId="issue-project-label" value={form.project} onChange={(e) => set('project')(e.target.value)}>
          <MenuItem value="">No project</MenuItem>
          {projects.map((p) => <MenuItem key={p._id} value={p._id}>{p.projectTitle}</MenuItem>)}
        </Select>
      </FormControl>
      </FormSection>
      <FormSection title="The issue">
      <FormControl fullWidth margin="dense" variant="standard" required>
        <InputLabel id="issue-category-label">Category</InputLabel>
        <Select labelId="issue-category-label" value={form.category} onChange={(e) => set('category')(e.target.value)} disabled={saving}>
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
      />
      </FormSection>
      <FormSection title="Reported">
      <HappenedDateField label="Date reported" value={form.dateReported} onChange={set('dateReported')} disabled={saving} />
      <FormControl fullWidth margin="dense" variant="standard">
        <InputLabel id="issue-via-label">Reported via</InputLabel>
        <Select labelId="issue-via-label" value={form.reportedVia} onChange={(e) => set('reportedVia')(e.target.value)} disabled={saving}>
          <MenuItem value="">Not recorded</MenuItem>
          {REPORTED_VIA.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
        </Select>
      </FormControl>
      </FormSection>
      <FormSection title="Who acts">
      {mdaError && <Alert severity="warning" sx={{ mt: 1 }}>Could not load the MDA list.</Alert>}
      <MdaPicker
        id="issue-mda"
        mdas={mdas}
        value={form.mdaResponsible}
        onChange={set('mdaResponsible')}
        disabled={saving}
        placeholder="Search by name or abbreviation"
      />
      </FormSection>
    </FormDialog>
  );
};

export default IssueForm;
