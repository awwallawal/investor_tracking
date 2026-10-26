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
import { lagosDay } from '../utils/dates';
import InvestorT11Fields from './InvestorT11Fields';
import SectorFields from './SectorFields';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

const InvestorEditForm = ({ open, onClose, onSave, investorData }) => {
  const [formData, setFormData] = useState(investorData);
  const [error, setError] = useState(null);
  const originalFirstContact = lagosDay(investorData?.firstContactDate);
  const [firstContactDate, setFirstContactDate] = useState(originalFirstContact);

  useEffect(() => {
    setFormData(investorData);
    setFirstContactDate(lagosDay(investorData?.firstContactDate));
  }, [investorData]);

  useEffect(() => {
    if (open) {
      setError(null); // Reset error on open
    }
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const setField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }));
  // Lead source is fixed after create; only DG/Admin can correct it (server-enforced too).
  const canEditLeadSource = isAdminRole(getCurrentUser()?.role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); // Clear previous errors

    try {
      const payload = { ...formData };
      // Sent only when corrected; empty never clears the stored date.
      if (firstContactDate && firstContactDate !== originalFirstContact) payload.firstContactDate = firstContactDate;
      await apiClient.put(`/api/investors/${formData._id}`, payload);
      onSave(); // Trigger refresh and close
    } catch (error) {
      console.error("Submission error:", error);
      const message = error.response?.status === 403
        ? 'You can only change investors assigned to you'
        : error.response?.data?.message || error.response?.data?.msg || error.response?.data?.error || error.message || 'Failed to update investor';
      setError(message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Edit Investor</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            name="investorName"
            label="Investor Name"
            value={formData.investorName || ''}
            onChange={handleChange}
            fullWidth={true}
            required
            margin="normal"
          />
          <TextField
            name="email"
            label="Email"
            type="email"
            value={formData.email || ''}
            onChange={handleChange}
            fullWidth={true}
            margin="normal"
          />
          <TextField
            name="phoneNumber"
            label="Phone Number"
            value={formData.phoneNumber || ''}
            onChange={handleChange}
            fullWidth={true}
            margin="normal"
          />
          <SectorFields values={formData || {}} onChange={setField} required />
          <TextField
            name="countryOfOrigin"
            label="Country of Origin"
            value={formData.countryOfOrigin || ''}
            onChange={handleChange}
            fullWidth={true}
            required
            margin="normal"
          />
          <TextField
            name="companyRegistrationInfo"
            label="Company Registration Info"
            value={formData.companyRegistrationInfo || ''}
            onChange={handleChange}
            fullWidth={true}
            margin="normal"
          />
          <TextField
            name="keyContactPerson"
            label="Key Contact Person"
            value={formData.keyContactPerson || ''}
            onChange={handleChange}
            fullWidth={true}
            margin="normal"
          />
          <HappenedDateField
            name="firstContactDate"
            label="First contact date"
            value={firstContactDate}
            onChange={setFirstContactDate}
            margin="normal"
            helperText={originalFirstContact ? 'Correct it if the paper record shows another date' : 'Leave empty to keep the recorded date'}
          />
          <InvestorT11Fields
            values={formData || {}}
            onChange={setField}
            canEditLeadSource={canEditLeadSource}
            selfId={formData?._id}
          />
          <TextField
            name="website"
            label="Website"
            value={formData.website || ''}
            onChange={handleChange}
            fullWidth={true}
            margin="normal"
          />
          <TextField
            name="headOffice"
            label="Head office"
            value={formData.headOffice || ''}
            onChange={handleChange}
            fullWidth={true}
            margin="normal"
          />
          <TextField
            name="notes"
            label="Notes"
            value={formData.notes || ''}
            onChange={handleChange}
            fullWidth={true}
            multiline
            minRows={2}
            margin="normal"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Save Changes</Button>
      </DialogActions>
    </Dialog>
  );
};

export default InvestorEditForm;
