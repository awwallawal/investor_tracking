import React, { useState, useEffect } from 'react';
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Button, Select, MenuItem, InputLabel, FormControl } from '@mui/material';
import apiClient from '../api/api';

const FORBIDDEN_MSG = 'You can only change projects of investors assigned to you';
const GENERIC_MSG = 'Failed to save the project. Please try again.';

const ProjectForm = ({ open, onClose, onSave, projectData, investorId }) => {
    const [formData, setFormData] = useState({});
    const [lifecycleStatuses, setLifecycleStatuses] = useState([]);
    const [saveError, setSaveError] = useState(null);

    useEffect(() => {
        const fetchStatuses = async () => {
            try {
                const response = await apiClient.get('/api/lifecycle-statuses');
                setLifecycleStatuses(response.data);
            } catch (error) {
                console.error("Failed to fetch lifecycle statuses:", error);
            }
        };

        fetchStatuses();
    }, []);

    useEffect(() => {
        setSaveError(null);
        if (projectData) {
            setFormData({
                ...projectData,
                lifecycleStatus: projectData.lifecycleStatus?._id || (lifecycleStatuses.length > 0 ? lifecycleStatuses[0]._id : ''),
            });
        } else {
            setFormData({
                projectTitle: '',
                description: '',
                estimatedValue: 0,
                estimatedNumberOfJobs: 0,
                location: '',
                lifecycleStatus: lifecycleStatuses.length > 0 ? lifecycleStatuses[0]._id : '',
            });
        }
    }, [projectData, open, lifecycleStatuses]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        const method = projectData ? 'put' : 'post';
        const url = projectData 
            ? `/api/projects/${projectData._id}` 
            : `/api/projects/investors/${investorId}/projects`;

        setSaveError(null);
        try {
            await apiClient[method](url, formData);
            onSave();
        } catch (error) {
            console.error("Save error:", error);
            setSaveError(error?.response?.status === 403 ? FORBIDDEN_MSG : GENERIC_MSG);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{projectData ? 'Edit Project' : 'Add New Project'}</DialogTitle>
            <DialogContent>
                {saveError && <Alert severity="error" sx={{ mb: 1 }}>{saveError}</Alert>}
                <TextField autoFocus margin="dense" name="projectTitle" label="Project Title" type="text" fullWidth variant="standard" value={formData.projectTitle || ''} onChange={handleChange} />
                <TextField margin="dense" name="description" label="Description" type="text" fullWidth multiline rows={4} variant="standard" value={formData.description || ''} onChange={handleChange} />
                <TextField margin="dense" name="estimatedValue" label="Estimated Value" type="number" fullWidth variant="standard" value={formData.estimatedValue || 0} onChange={handleChange} />
                <TextField margin="dense" name="estimatedNumberOfJobs" label="Estimated Number of Jobs" type="number" fullWidth variant="standard" value={formData.estimatedNumberOfJobs || 0} onChange={handleChange} />
                <TextField margin="dense" name="location" label="Location" type="text" fullWidth variant="standard" value={formData.location || ''} onChange={handleChange} />
                <FormControl fullWidth margin="dense" variant="standard">
                    <InputLabel>Lifecycle Status</InputLabel>
                    <Select name="lifecycleStatus" value={formData.lifecycleStatus || ''} onChange={handleChange}>
                        {lifecycleStatuses.map(status => (
                            <MenuItem key={status._id} value={status._id}>{status.name}</MenuItem>
                        ))}
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