import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';

const InvestorForm = ({ open, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    investorName: '',
    email: '',
    phoneNumber: '',
    sector: '',
    countryOfOrigin: '',
    companyRegistrationInfo: '',
    keyContactPerson: '',
    lifecycleStatus: ''
  });
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    if (open) {
      const fetchStatuses = async () => {
        try {
          const response = await fetch('/api/lifecycle-statuses');
          if (!response.ok) {
            throw new Error('Failed to fetch lifecycle statuses');
          }
          const data = await response.json();
          setStatuses(data);
        } catch (error) {
          console.error("Fetch error:", error);
        }
      };
      fetchStatuses();
    }
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!response.ok) {
        throw new Error('Failed to create investor');
      }
      onSave(); // Trigger refresh and close
    } catch (error) {
      console.error("Submission error:", error);
      // Optionally, show an error message to the user
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Register New Investor</DialogTitle>
      <DialogContent>
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
          <FormControl fullWidth margin="normal">
            <InputLabel id="lifecycle-status-label">Lifecycle Status</InputLabel>
            <Select
              labelId="lifecycle-status-label"
              id="lifecycleStatus"
              name="lifecycleStatus"
              value={formData.lifecycleStatus}
              onChange={handleChange}
              label="Lifecycle Status"
            >
              {statuses.map((status) => (
                <MenuItem key={status._id} value={status._id}>
                  {status.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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