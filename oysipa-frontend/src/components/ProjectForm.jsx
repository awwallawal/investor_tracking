import React, { useState, useEffect } from 'react';
import { Alert, Box, TextField, Button, Select, MenuItem, InputLabel, FormControl } from '@mui/material';
import FormDialog, { FormSection } from './ui/FormDialog';
import apiClient from '../api/api';
import HappenedDateField from './HappenedDateField';
import { lagosDay } from '../utils/dates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../constants/investorFields';
import SectorFields from './SectorFields';

const FORBIDDEN_MSG = 'You can only change projects of investors assigned to you';
const GENERIC_MSG = 'Failed to save the project. Please try again.';

const ProjectForm = ({ open, onClose, onSave, projectData, investorId }) => {
    const [formData, setFormData] = useState({});
    const [lifecycleStatuses, setLifecycleStatuses] = useState([]);
    const [saveError, setSaveError] = useState(null);
    const [dateRegistered, setDateRegistered] = useState('');
    const [statusChangeDate, setStatusChangeDate] = useState('');
    const originalDateRegistered = lagosDay(projectData?.dateRegistered);
    const originalStatusId = projectData?.lifecycleStatus?._id || projectData?.lifecycleStatus || '';

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

    // Date fields reset only when the dialog opens or the project changes (not
    // when the statuses arrive, so a typed date is kept).
    useEffect(() => {
        setDateRegistered(lagosDay(projectData?.dateRegistered));
        setStatusChangeDate('');
    }, [projectData, open]);

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
                currency: DEFAULT_CURRENCY,
                estimatedNumberOfJobs: 0,
                location: '',
                sector: '',
                sectorDetail: '',
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
        const payload = { ...formData };
        delete payload.dateRegistered;
        // Empty sector: the server uses the investor's sector (create) or keeps it (edit).
        if (!payload.sector) delete payload.sector;
        // Empty means today on create; on edit it is sent only when corrected.
        if (dateRegistered && (!projectData || dateRegistered !== originalDateRegistered)) {
            payload.dateRegistered = dateRegistered;
        }
        if (statusChanged && statusChangeDate) payload.statusChangeDate = statusChangeDate;
        try {
            await apiClient[method](url, payload);
            onSave();
        } catch (error) {
            console.error("Save error:", error);
            setSaveError(error?.response?.status === 403
                ? FORBIDDEN_MSG
                : (error?.response?.data?.message || GENERIC_MSG));
        }
    };

    // "Status changed on" appears only when an existing project's status changes.
    const statusChanged = !!projectData && !!formData.lifecycleStatus && formData.lifecycleStatus !== originalStatusId;

    return (
        <FormDialog
            open={open}
            onClose={onClose}
            title={projectData ? 'Edit Project' : 'Add New Project'}
            help={projectData ? 'Changes are recorded in the change log. A status change also logs a System Update.' : 'Value, location and jobs count for SABER T5–T7.'}
            actions={(
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave}>Save</Button>
                </>
            )}
        >
                {saveError && <Alert severity="error" sx={{ mb: 1 }}>{saveError}</Alert>}
                <FormSection title="Project" first>
                <TextField autoFocus margin="dense" name="projectTitle" label="Project Title" type="text" fullWidth variant="standard" value={formData.projectTitle || ''} onChange={handleChange} />
                <TextField margin="dense" name="description" label="Description" type="text" fullWidth multiline rows={4} variant="standard" value={formData.description || ''} onChange={handleChange} />
                </FormSection>
                <FormSection title="Value and jobs">
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <FormControl margin="dense" variant="standard" sx={{ minWidth: 100 }}>
                        <InputLabel id="currency-label">Currency</InputLabel>
                        <Select labelId="currency-label" name="currency" value={formData.currency || DEFAULT_CURRENCY} onChange={handleChange}>
                            {CURRENCIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <TextField margin="dense" name="estimatedValue" label="Estimated Value" type="number" fullWidth variant="standard" value={formData.estimatedValue || 0} onChange={handleChange} />
                </Box>
                <TextField margin="dense" name="estimatedNumberOfJobs" label="Estimated Number of Jobs" type="number" fullWidth variant="standard" value={formData.estimatedNumberOfJobs || 0} onChange={handleChange} />
                </FormSection>
                <FormSection title="Sector and location">
                <SectorFields
                    values={formData}
                    onChange={(name, value) => setFormData(prev => ({ ...prev, [name]: value }))}
                    emptyLabel={projectData ? undefined : "Use the investor's sector"}
                    helperText={projectData ? undefined : "Leave as is to use the investor's sector."}
                />
                <TextField margin="dense" name="location" label="Location" type="text" fullWidth variant="standard" value={formData.location || ''} onChange={handleChange} />
                </FormSection>
                <FormSection title="Status and dates">
                <FormControl fullWidth margin="dense" variant="standard">
                    <InputLabel id="lifecycleStatus-label">Lifecycle Status</InputLabel>
                    <Select labelId="lifecycleStatus-label" name="lifecycleStatus" value={formData.lifecycleStatus || ''} onChange={handleChange}>
                        {lifecycleStatuses.map(status => (
                            <MenuItem key={status._id} value={status._id}>{status.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {statusChanged && (
                    <HappenedDateField
                        name="statusChangeDate"
                        label="Status changed on"
                        value={statusChangeDate}
                        onChange={setStatusChangeDate}
                    />
                )}
                <HappenedDateField
                    name="dateRegistered"
                    label="Date registered"
                    value={dateRegistered}
                    onChange={setDateRegistered}
                    helperText={projectData && originalDateRegistered ? 'Correct it if the paper record shows another date' : 'Leave empty for today'}
                />
                </FormSection>
        </FormDialog>
    );
};

export default ProjectForm;