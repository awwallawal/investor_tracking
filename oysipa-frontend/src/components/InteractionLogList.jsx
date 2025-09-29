import React, { useState, useEffect } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider, Paper, Link as MuiLink } from '@mui/material';
import apiClient from '../api/api';

const InteractionLogList = ({ projectId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!projectId) return;

        const fetchLogs = async () => {
            try {
                setLoading(true);
                const response = await apiClient.get(`/api/projects/${projectId}/interactions`);
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
    }, [projectId]);

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
                <Typography>No interaction logs found for this project.</Typography>
            ) : (
                <List>
                    {logs.map((log, index) => (
                        <React.Fragment key={log._id}>
                            <ListItem alignItems="flex-start">
                                <ListItemText
                                    primary={log.description}
                                    secondary={
                                        <React.Fragment>
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
                                        </React.Fragment>
                                    }
                                />
                            </ListItem>
                            {index < logs.length - 1 && <Divider variant="inset" component="li" />}
                        </React.Fragment>
                    ))}
                </List>
            )}
        </Paper>
    );
};

export default InteractionLogList;
