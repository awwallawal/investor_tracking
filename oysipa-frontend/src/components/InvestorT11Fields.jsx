import React, { useEffect, useState } from 'react';
import {
  FormControl, FormHelperText, InputLabel, MenuItem, Select, TextField,
} from '@mui/material';
import apiClient from '../api/api';
import {
  INTERMEDIARY_REFERRAL, LEAD_SOURCES, NEW_LEAD_SOURCES, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE,
} from '../constants/investorFields';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';

// Lead source (T11), its detail, organisation type and "Referred by" for the
// new-investor and edit forms. `values` holds the four fields; `onChange(name, value)`.
// New records: lead source required, "Unknown (pre-T11)" not offered.
// Edit: lead source read-only unless canEditLeadSource (DG/Admin).
const InvestorT11Fields = ({ values, onChange, isCreate = false, canEditLeadSource = true, selfId }) => {
  const [intermediaries, setIntermediaries] = useState([]);
  const showReferredBy = values.leadSource === INTERMEDIARY_REFERRAL;
  const leadSourceLocked = !isCreate && !canEditLeadSource;
  const options = isCreate ? NEW_LEAD_SOURCES : LEAD_SOURCES;

  useEffect(() => {
    if (!showReferredBy) return undefined;
    let active = true;
    apiClient.get('/api/investors', { params: { organisationType: 'Intermediary' } })
      .then((res) => { if (active) setIntermediaries(Array.isArray(res?.data) ? res.data : []); })
      .catch((err) => console.error('Failed to fetch intermediaries:', err));
    return () => { active = false; };
  }, [showReferredBy]);

  const referredId = idOf(values.referredBy);
  // Keep the stored referrer selectable even before the list arrives.
  const referrers = intermediaries.filter((i) => i._id !== selfId);
  if (referredId && !referrers.some((i) => i._id === referredId) && values.referredBy?.investorName) {
    referrers.push(values.referredBy);
  }

  return (
    <>
      <FormControl fullWidth margin="normal" required={isCreate} disabled={leadSourceLocked}>
        <InputLabel id="leadSource-label">Lead source</InputLabel>
        <Select
          labelId="leadSource-label"
          label="Lead source"
          name="leadSource"
          value={values.leadSource || ''}
          onChange={(e) => onChange('leadSource', e.target.value)}
          inputProps={{ 'data-testid': 'leadSource' }}
        >
          {options.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </Select>
        <FormHelperText>
          {leadSourceLocked
            ? 'Set when the record was created. Only the DG or Portal-Admin can correct it.'
            : 'How this organisation first came to OYSIPA (SABER T11).'}
        </FormHelperText>
      </FormControl>
      <TextField
        name="leadSourceDetail"
        label="Lead source detail"
        value={values.leadSourceDetail || ''}
        onChange={(e) => onChange('leadSourceDetail', e.target.value)}
        fullWidth
        margin="normal"
      />
      {showReferredBy && (
        <FormControl fullWidth margin="normal">
          <InputLabel id="referredBy-label">Referred by</InputLabel>
          <Select
            labelId="referredBy-label"
            label="Referred by"
            name="referredBy"
            value={referrers.some((i) => i._id === referredId) ? referredId : ''}
            onChange={(e) => onChange('referredBy', e.target.value)}
            disabled={leadSourceLocked}
          >
            <MenuItem value=""><em>Not recorded</em></MenuItem>
            {referrers.map((i) => <MenuItem key={i._id} value={i._id}>{i.investorName}</MenuItem>)}
          </Select>
          <FormHelperText>
            {intermediaries.length === 0 ? 'No Intermediary records yet. Register the intermediary first.' : 'Lists Intermediary records.'}
          </FormHelperText>
        </FormControl>
      )}
      <FormControl fullWidth margin="normal">
        <InputLabel id="organisationType-label">Organisation type</InputLabel>
        <Select
          labelId="organisationType-label"
          label="Organisation type"
          name="organisationType"
          value={values.organisationType || DEFAULT_ORGANISATION_TYPE}
          onChange={(e) => onChange('organisationType', e.target.value)}
        >
          {ORGANISATION_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </Select>
        <FormHelperText>Only Investor records count in investor totals.</FormHelperText>
      </FormControl>
    </>
  );
};

export default InvestorT11Fields;
