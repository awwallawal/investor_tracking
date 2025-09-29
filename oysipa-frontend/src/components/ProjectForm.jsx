import React, { useState, useEffect } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Button, Select, MenuItem, InputLabel, FormControl } from '@mui/material';
import apiClient from '../api/api';

const ProjectForm = ({ open, onClose, onSave, projectData, investorId }) => {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (projectData) {
            setFormData(projectData);
        } else {
            setFormData({
                projectTitle: '',
                description: '',
                estimatedValue: 0,
                estimatedNumberOfJobs: 0,
                location: '',
                lifecycleStatus: 'Initial Interest',
            });
        }
    }, [projectData, open]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        const method = projectData ? 'put' : 'post';
        const url = projectData 
            ? `/api/projects/${projectData._id}` 
            : `/api/projects/investors/${investorId}/projects`;

        try {
            await apiClient[method](url, formData);
            onSave();
        } catch (error) {
            console.error("Save error:", error);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{projectData ? 'Edit Project' : 'Add New Project'}</DialogTitle>
            <DialogContent>
                <TextField autoFocus margin="dense" name="projectTitle" label="Project Title" type="text" fullWidth variant="standard" value={formData.projectTitle || ''} onChange={handleChange} />
                <TextField margin="dense" name="description" label="Description" type="text" fullWidth multiline rows={4} variant="standard" value={formData.description || ''} onChange={handleChange} />
                <TextField margin="dense" name="estimatedValue" label="Estimated Value" type="number" fullWidth variant="standard" value={formData.estimatedValue || 0} onChange={handleChange} />
                <TextField margin="dense" name="estimatedNumberOfJobs" label="Estimated Number of Jobs" type="number" fullWidth variant="standard" value={formData.estimatedNumberOfJobs || 0} onChange={handleChange} />
                <TextField margin="dense" name="location" label="Location" type="text" fullWidth variant="standard" value={formData.location || ''} onChange={handleChange} />
                <FormControl fullWidth margin="dense" variant="standard">
                    <InputLabel>Lifecycle Status</InputLabel>
                    <Select name="lifecycleStatus" value={formData.lifecycleStatus || 'Initial Interest'} onChange={handleChange}>
                        <MenuItem value="Initial Interest">Initial Interest</MenuItem>
                        <MenuItem value="Lead">Lead</MenuItem>
                        <MenuItem value="Committment">Committment</MenuItem>
                        <MenuItem value="Exisiting Investor">Exisiting Investor</MenuItem>
                        <MenuItem value="Expansion">Expansion</MenuItem>
                        <MenuItem value="Exit">Exit</MenuItem>
                    </Select>
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave}>Save</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ProjectForm;