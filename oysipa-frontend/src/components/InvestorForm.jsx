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

const InvestorForm = ({ open, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    investorName: '',
    email: '',
    phoneNumber: '',
    sector: '',
    countryOfOrigin: '',
    companyRegistrationInfo: '',
    keyContactPerson: '',
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      // Reset form and error on open
      setFormData({
        investorName: '',
        email: '',
        phoneNumber: '',
        sector: '',
        countryOfOrigin: '',
        companyRegistrationInfo: '',
        keyContactPerson: '',
      });
      setError(null);
    }
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); // Clear previous errors

    try {
      await apiClient.post('/api/investors', formData);
      onSave(); // Trigger refresh and close
    } catch (error) {
      console.error("Submission error:", error);
      const message = error.response?.data?.msg || error.response?.data?.error || error.message || 'Failed to create investor';
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
          <TextField
            name="sector"
            label="Sector"
            value={formData.sector}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
          />
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