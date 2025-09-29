import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from '@mui/material';

const InvestorEditForm = ({ open, onClose, onSave, investorData }) => {
  const [formData, setFormData] = useState(investorData);

  useEffect(() => {
    setFormData(investorData);
  }, [investorData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/investors/${formData._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!response.ok) {
        throw new Error('Failed to update investor');
      }
      onSave(); // Trigger refresh and close
    } catch (error) {
      console.error("Submission error:", error);
      // Optionally, show an error message to the user
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Edit Investor</DialogTitle>
      <DialogContent>
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
          <TextField
            name="sector"
            label="Sector"
            value={formData.sector || ''}
            onChange={handleChange}
            fullWidth={true}
            required
            margin="normal"
          />
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
