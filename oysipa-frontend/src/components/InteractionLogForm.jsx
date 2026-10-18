import React, { useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Button, Select, MenuItem, InputLabel, FormControl, Alert } from '@mui/material';
import apiClient from '../api/api';
import ServiceCodePicker from './ServiceCodePicker';

const INTERACTION_CATEGORIES = [
  'Meeting',
  'Call',
  'Email',
  'Site Visit',
  'System Update',
  'Other',
];

// Logs an interaction against a project (projectId) or, with no project,
// against an investor (investorId).
const InteractionLogForm = ({ open, onClose, onSave, projectId, investorId }) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [serviceCodes, setServiceCodes] = useState([]);
  const [creditLinkage, setCreditLinkage] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const url = projectId
    ? `/api/projects/${projectId}/interactions`
    : `/api/interactions/investors/${investorId}`;

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleSave = async () => {
    if (!description || !category) {
      setError('Both description and category are required.');
      return;
    }

    setError('');
    setUploading(true);
    let documentUrl = '';

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('upload_preset', "investment_tracking_system"); // Actual preset
        formData.append('cloud_name', "dzzipwwbn"); // Actual cloud name

        const cloudinaryResponse = await fetch(
          `https://api.cloudinary.com/v1_1/dzzipwwbn/image/upload`, // Actual cloud name
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!cloudinaryResponse.ok) {
          throw new Error('Failed to upload file to Cloudinary.');
        }
        const cloudinaryData = await cloudinaryResponse.json();
        documentUrl = cloudinaryData.secure_url;
      }

      await apiClient.post(url, {
        description,
        category,
        documentUrl,
        serviceCodes,
        creditLinkage,
      });

      setDescription('');
      setCategory('');
      setServiceCodes([]);
      setCreditLinkage(false);
      setSelectedFile(null);
      onSave();
    } catch (err) {
      let message;
      if (err?.response?.status === 403) {
        message = projectId
          ? 'You can only change projects of investors assigned to you'
          : 'You can only log interactions for investors assigned to you';
      } else {
        message = err?.response?.data?.message || err.message || 'Failed to save interaction log.';
      }
      setError(message);
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Log New Support Interaction</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          autoFocus
          margin="dense"
          label="Interaction Description"
          type="text"
          fullWidth
          multiline
          rows={4}
          variant="standard"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FormControl fullWidth margin="dense" variant="standard">
          <InputLabel id="service-category-label">Service Category</InputLabel>
          <Select
            labelId="service-category-label"
            id="service-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            label="Service Category"
          >
            {INTERACTION_CATEGORIES.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ServiceCodePicker
          value={serviceCodes}
          onChange={setServiceCodes}
          creditLinkage={creditLinkage}
          onCreditLinkageChange={setCreditLinkage}
          disabled={uploading}
        />
        <Button
          variant="contained"
          component="label"
          sx={{ mt: 2 }}
          disabled={uploading}
        >
          {selectedFile ? selectedFile.name : 'Attach Document'}
          <input type="file" hidden onChange={handleFileChange} />
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>Cancel</Button>
        <Button onClick={handleSave} disabled={uploading}>
          {uploading ? 'Saving...' : 'Save Log'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InteractionLogForm;
