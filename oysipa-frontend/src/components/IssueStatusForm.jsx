import React, { useState } from 'react';
import {
  Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField,
} from '@mui/material';
import { issueErrorMessage, updateIssue } from '../api/issues';
import { ISSUE_STATUSES, RESOLVED } from '../constants/issueFields';

// Change status / resolve. Resolving needs a resolution note (the server checks too).
const IssueStatusForm = ({ issue, onSaved }) => {
  const [status, setStatus] = useState(issue.status);
  const [resolution, setResolution] = useState(issue.resolution || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const needsNote = status === RESOLVED && !resolution.trim();
  const changed = status !== issue.status || resolution.trim() !== (issue.resolution || '');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      onSaved(await updateIssue(issue._id, { status, resolution: resolution.trim() }));
    } catch (err) {
      setError(issueErrorMessage(err, 'Failed to change the status.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="issue-status-label">Status</InputLabel>
          <Select labelId="issue-status-label" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
            {ISSUE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Resolution note"
          size="small"
          fullWidth
          multiline
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          disabled={saving}
          required={status === RESOLVED}
          error={needsNote}
          helperText={needsNote ? 'A resolution note is required to resolve an issue.' : ' '}
        />
        <Button variant="contained" onClick={save} disabled={saving || needsNote || !changed}>
          {saving ? 'Saving...' : 'Save status'}
        </Button>
      </Stack>
    </Box>
  );
};

export default IssueStatusForm;
