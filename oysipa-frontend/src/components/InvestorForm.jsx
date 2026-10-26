import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import apiClient from '../api/api';
import HappenedDateField from './HappenedDateField';
import InvestorT11Fields from './InvestorT11Fields';
import SectorFields from './SectorFields';
import { DEFAULT_ORGANISATION_TYPE, INTERMEDIARY_REFERRAL } from '../constants/investorFields';

const EMPTY_FORM = {
  investorName: '',
  email: '',
  phoneNumber: '',
  sector: '',
  sectorDetail: '',
  countryOfOrigin: '',
  companyRegistrationInfo: '',
  keyContactPerson: '',
  leadSource: '',
  leadSourceDetail: '',
  organisationType: DEFAULT_ORGANISATION_TYPE,
  referredBy: '',
  website: '',
  headOffice: '',
  notes: '',
};

const InvestorForm = ({ open, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    ...EMPTY_FORM,
  });
  const [firstContactDate, setFirstContactDate] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      // Reset form and error on open
      setFormData({ ...EMPTY_FORM });
      setFirstContactDate('');
      setError(null);
    }
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const setField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); // Clear previous errors
    // T11: lead source is required for new records (the server checks too).
    if (!formData.leadSource) {
      setError('Choose a lead source.');
      return;
    }
    if (!formData.sector) {
      setError('Choose a sector (or "Not recorded").');
      return;
    }

    try {
      const payload = { ...formData };
      if (payload.leadSource !== INTERMEDIARY_REFERRAL || !payload.referredBy) delete payload.referredBy;
      // Empty first contact date means today (set by the server).
      await apiClient.post('/api/investors', { ...payload, ...(firstContactDate && { firstContactDate }) });
      onSave(); // Trigger refresh and close
    } catch (error) {
      console.error("Submission error:", error);
      const message = error.response?.data?.message || error.response?.data?.msg || error.response?.data?.error || error.message || 'Failed to create investor';
      setError(message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Register New Investor</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            name="investorName"
            label="Investor Name"
            value={formData.investorName}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
          />
          <TextField
            name="email"
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            fullWidth
            margin="normal"
          />
          <TextField
            name="phoneNumber"
            label="Phone Number"
            value={formData.phoneNumber}
            onChange={handleChange}
            fullWidth
            margin="normal"
          />
          <SectorFields values={formData} onChange={setField} required />
          <TextField
            name="countryOfOrigin"
            label="Country of Origin"
            value={formData.countryOfOrigin}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
          />
          <TextField
            name="companyRegistrationInfo"
            label="Company Registration Info"
            value={formData.companyRegistrationInfo}
            onChange={handleChange}
            fullWidth
            margin="normal"
          />
          <TextField
            name="keyContactPerson"
            label="Key Contact Person"
            value={formData.keyContactPerson}
            onChange={handleChange}
            fullWidth
            margin="normal"
          />
          <InvestorT11Fields values={formData} onChange={setField} isCreate />
          <HappenedDateField
            name="firstContactDate"
            label="First contact date"
            value={firstContactDate}
            onChange={setFirstContactDate}
            margin="normal"
          />
          <TextField
            name="website"
            label="Website"
            value={formData.website}
            onChange={handleChange}
            fullWidth
            margin="normal"
          />
          <TextField
            name="headOffice"
            label="Head office"
            value={formData.headOffice}
            onChange={handleChange}
            fullWidth
            margin="normal"
          />
          <TextField
            name="notes"
            label="Notes"
            value={formData.notes}
            onChange={handleChange}
            fullWidth
            multiline
            minRows={2}
            margin="normal"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Submit</Button>
      </DialogActions>
    </Dialog>
  );
};

export default InvestorForm;