import React, { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
  Typography,
} from '@mui/material';
import apiClient from '../api/api';
import { addEvidenceLink, evidenceErrorMessage } from '../api/evidence';
import ServiceCodePicker from './ServiceCodePicker';
import { mainDate } from '../utils/dates';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

const shorten = (s, n = 70) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

const assignedId = (inv) => String(inv?.assignedTo?._id || inv?.assignedTo || '');

const tagLabel = (link) => [
  link.investor?.investorName || 'Investor',
  link.interaction && shorten(link.interaction.description, 40),
  link.serviceCodes?.length ? link.serviceCodes.join(', ') : null,
].filter(Boolean).join(' · ');

// Tag a library file: an investor, optionally one of its interactions, and
// optional SABER codes. The server checks the Staff assignment rule.
const EvidenceTagDialog = ({ file, onClose, onSaved }) => {
  const [investors, setInvestors] = useState([]);
  const [investor, setInvestor] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [interaction, setInteraction] = useState('');
  const [serviceCodes, setServiceCodes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [interactionsError, setInteractionsError] = useState('');

  useEffect(() => {
    let active = true;
    // Staff can tag only investors assigned to them (the server checks too).
    const user = getCurrentUser();
    const staffOnly = !isAdminRole(user?.role);
    apiClient.get('/api/investors')
      .then(({ data }) => {
        if (!active) return;
        const list = (data || []).filter((inv) => !staffOnly || (user?.id && assignedId(inv) === String(user.id)));
        setInvestors(list.sort((a, b) => String(a.investorName).localeCompare(String(b.investorName))));
      })
      .catch((err) => { if (active) setError(evidenceErrorMessage(err, 'Failed to load investors.')); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setInteraction('');
    setInteractions([]);
    setInteractionsError('');
    if (!investor) return undefined;
    let active = true;
    apiClient.get(`/api/interactions/investors/${investor._id}`)
      .then(({ data }) => { if (active) setInteractions(data || []); })
      .catch((err) => {
        if (!active) return;
        setInteractions([]);
        setInteractionsError(evidenceErrorMessage(err, 'Could not load the interactions of this investor.'));
      });
    return () => { active = false; };
  }, [investor]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await addEvidenceLink(file._id, {
        investor: investor._id, interaction: interaction || undefined, serviceCodes,
      });
      onSaved(updated);
    } catch (err) {
      setError(evidenceErrorMessage(err, 'Failed to tag the file.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Tag file</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>{file.fileName}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">Current tags</Typography>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mb: 1 }} aria-label="Current tags">
          {(file.links || []).length === 0
            ? <Chip size="small" color="warning" label="Untagged" />
            : file.links.map((l) => <Chip key={l._id} size="small" label={tagLabel(l)} sx={{ maxWidth: '100%' }} />)}
        </Stack>
        <Autocomplete
          options={investors}
          value={investor}
          onChange={(e, v) => setInvestor(v)}
          getOptionLabel={(o) => o.investorName || ''}
          isOptionEqualToValue={(o, v) => o._id === v._id}
          disabled={saving}
          renderInput={(params) => <TextField {...params} label="Investor" variant="standard" margin="dense" required />}
        />
        <TextField
          select
          label="Interaction (optional)"
          fullWidth
          variant="standard"
          margin="dense"
          value={interaction}
          onChange={(e) => setInteraction(e.target.value)}
          disabled={saving || !investor}
          error={!!interactionsError}
          helperText={interactionsError || (investor && interactions.length === 0 ? 'No interactions for this investor' : ' ')}
        >
          <MenuItem value="">(none: link to the investor only)</MenuItem>
          {interactions.map((log) => (
            <MenuItem key={log._id} value={log._id} sx={{ whiteSpace: 'normal' }}>
              {`${mainDate(log, 'interactionDate')} · ${shorten(log.description)}`}
            </MenuItem>
          ))}
        </TextField>
        <ServiceCodePicker
          value={serviceCodes}
          onChange={setServiceCodes}
          showCreditLinkage={false}
          helperText="SABER services this file shows (optional). They describe the file; services are counted from interactions."
          disabled={saving}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !investor}>{saving ? 'Saving...' : 'Save tag'}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EvidenceTagDialog;
