import React, { useState, useEffect } from 'react';
import {
    Box, Typography, List, ListItem, ListItemText, Divider, Paper, Link as MuiLink, Chip, Tooltip, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, Alert,
} from '@mui/material';
import apiClient from '../api/api';
import ServiceCodePicker from './ServiceCodePicker';
import { serviceWording } from '../constants/serviceCodes';

// "Tag services": edits only serviceCodes and creditLinkage of one log.
const TagServicesDialog = ({ log, onClose, onSaved }) => {
    const [serviceCodes, setServiceCodes] = useState(log?.serviceCodes || []);
    const [creditLinkage, setCreditLinkage] = useState(!!log?.creditLinkage);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const { data } = await apiClient.patch(`/api/interactions/${log._id}`, { serviceCodes, creditLinkage });
            onSaved(data);
        } catch (err) {
            setError(err?.response?.status === 403
                ? 'You can only tag interactions of investors assigned to you'
                : (err?.response?.data?.message || 'Failed to tag services.'));
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Tag services</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Typography variant="body2" sx={{ mb: 1 }}>{log.description}</Typography>
                <ServiceCodePicker
                    value={serviceCodes}
                    onChange={setServiceCodes}
                    creditLinkage={creditLinkage}
                    onCreditLinkageChange={setCreditLinkage}
                    disabled={saving}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save tags'}</Button>
            </DialogActions>
        </Dialog>
    );
};

// Code chips (wording as tooltip) and the credit-linkage chip. Also used by InteractionListPage.
export const ServiceChips = ({ log }) => {
    const codes = log.serviceCodes || [];
    if (codes.length === 0 && !log.creditLinkage) return null;
    return (
        <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {codes.map((code) => (
                <Tooltip key={code} title={serviceWording(code)}>
                    <Chip label={code} size="small" color="primary" variant="outlined" />
                </Tooltip>
            ))}
            {log.creditLinkage && <Chip label="Credit linkage" size="small" color="secondary" variant="outlined" />}
        </Box>
    );
};

// Lists the interactions of a project (projectId) or the timeline of an
// investor (investorId: investor-level logs plus logs of its projects).
const InteractionLogList = ({ projectId, investorId, canWrite = false }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tagging, setTagging] = useState(null);

    useEffect(() => {
        if (!projectId && !investorId) return;
        const url = projectId
            ? `/api/projects/${projectId}/interactions`
            : `/api/interactions/investors/${investorId}`;

        const fetchLogs = async () => {
            try {
                setLoading(true);
                const response = await apiClient.get(url);
                setLogs(response.data);
                setError(null);
            } catch (err) {
                setError('Failed to fetch interaction logs.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [projectId, investorId]);

    const handleTagged = (updated) => {
        setLogs((prev) => prev.map((l) => (l._id === updated._id
            ? { ...l, serviceCodes: updated.serviceCodes, creditLinkage: updated.creditLinkage, updatedAt: updated.updatedAt }
            : l)));
        setTagging(null);
    };

    if (loading) {
        return <Typography>Loading logs...</Typography>;
    }

    if (error) {
        return <Typography color="error">{error}</Typography>;
    }

    return (
        <Paper sx={{ p: 3, mt: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom>
                Support Interaction History
            </Typography>
            {logs.length === 0 ? (
                <Typography>
                    {projectId ? 'No interaction logs found for this project.' : 'No interactions logged for this investor yet.'}
                </Typography>
            ) : (
                <List>
                    {logs.map((log, index) => (
                        <React.Fragment key={log._id}>
                            <ListItem
                                alignItems="flex-start"
                                secondaryAction={canWrite ? (
                                    <Button size="small" onClick={() => setTagging(log)}>Tag services</Button>
                                ) : null}
                            >
                                <ListItemText
                                    primary={log.description}
                                    slotProps={{ secondary: { component: 'div' } }}
                                    secondary={
                                        <React.Fragment>
                                            {log.project?.projectTitle && (
                                                <Typography component="span" variant="body2" sx={{ display: 'block' }}>
                                                    {`Project: ${log.project.projectTitle}`}
                                                </Typography>
                                            )}
                                            <Typography
                                                sx={{ display: 'inline' }}
                                                component="span"
                                                variant="body2"
                                                color="text.primary"
                                            >
                                                {`Category: ${log.category} | By: ${log.loggedBy?.name || 'Unknown User'} on ${new Date(log.createdAt).toLocaleDateString()}`}
                                            </Typography>
                                            {log.documentUrl && (
                                                <MuiLink href={log.documentUrl} target="_blank" rel="noopener" sx={{ ml: 1 }}>
                                                    [View Document]
                                                </MuiLink>
                                            )}
                                            <ServiceChips log={log} />
                                        </React.Fragment>
                                    }
                                />
                            </ListItem>
                            {index < logs.length - 1 && <Divider variant="inset" component="li" />}
                        </React.Fragment>
                    ))}
                </List>
            )}
            {tagging && (
                <TagServicesDialog log={tagging} onClose={() => setTagging(null)} onSaved={handleTagged} />
            )}
        </Paper>
    );
};

export default InteractionLogList;
