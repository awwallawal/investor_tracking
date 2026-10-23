import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import InvestorForm from '../components/InvestorForm';
import ImportInvestorsDialog from '../components/ImportInvestorsDialog';
import { LEAD_SOURCES, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE } from '../constants/investorFields';
import apiClient from '../api/api';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';

// DG/Admin only: deletes the investor, its projects and interactions (reason required).
const DeleteInvestorDialog = ({ investor, onClose, onDeleted }) => {
    const [reason, setReason] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = async () => {
        setDeleting(true);
        setError('');
        try {
            const { data } = await apiClient.delete(`/api/investors/${investor._id}`, { data: { reason: reason.trim() } });
            onDeleted(investor, data.deleted);
        } catch (err) {
            setError(err?.response?.data?.message || err?.response?.data?.msg || 'Failed to delete investor.');
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open onClose={deleting ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle>{`Delete ${investor.investorName}?`}</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <DialogContentText sx={{ mb: 2 }}>
                    This also deletes all its projects and interactions. A record of everything deleted is kept in the audit log.
                </DialogContentText>
                <TextField
                    label="Reason"
                    required
                    fullWidth
                    multiline
                    minRows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={deleting}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={deleting}>Cancel</Button>
                <Button color="error" variant="contained" onClick={handleConfirm} disabled={deleting || !reason.trim()}>
                    {deleting ? 'Deleting...' : 'Confirm delete'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } };

const InvestorDirectoryPage = () => {
    const [investors, setInvestors] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [success, setSuccess] = useState('');
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [leadSource, setLeadSource] = useState('');
    const [organisationType, setOrganisationType] = useState('');
    const canDelete = isAdminRole(getCurrentUser()?.role);
    const canImport = canDelete; // DG/Portal-Admin only (server-enforced too)

    const fetchInvestors = useCallback(async () => {
        try {
            const params = {
                ...(leadSource && { leadSource }),
                ...(organisationType && { organisationType }),
            };
            const response = Object.keys(params).length
                ? await apiClient.get('/api/investors', { params })
                : await apiClient.get('/api/investors');
            setInvestors(response.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    }, [leadSource, organisationType]);

    useEffect(() => {
        fetchInvestors();
    }, [fetchInvestors]);

    const handleSave = () => {
      setIsFormOpen(false);
      fetchInvestors(); // Re-fetch investors to update the list
    };

    const handleDeleted = (investor, counts = {}) => {
        setDeleting(null);
        setSuccess(`Deleted ${investor.investorName}: ${counts.investors ?? 1} investor, ${counts.projects ?? 0} project(s), ${counts.interactions ?? 0} interaction(s).`);
        fetchInvestors();
    };

    return (
        <Container maxWidth="lg" disableGutters sx={{ mt: { xs: 1, sm: 4 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
                <Typography variant="h4" component="h1">Investor Directory</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
                    {canImport && (
                        <Button variant="outlined" onClick={() => setIsImportOpen(true)}>
                            Import investors
                        </Button>
                    )}
                    <Button variant="contained" onClick={() => setIsFormOpen(true)}>
                        Register New Investor
                    </Button>
                </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                    <InputLabel id="filter-leadSource-label">Lead source</InputLabel>
                    <Select labelId="filter-leadSource-label" label="Lead source" value={leadSource} onChange={(e) => setLeadSource(e.target.value)}>
                        <MenuItem value="">All lead sources</MenuItem>
                        {LEAD_SOURCES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="filter-organisationType-label">Organisation type</InputLabel>
                    <Select labelId="filter-organisationType-label" label="Organisation type" value={organisationType} onChange={(e) => setOrganisationType(e.target.value)}>
                        <MenuItem value="">All types</MenuItem>
                        {ORGANISATION_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
            <InvestorForm
              open={isFormOpen}
              onClose={() => setIsFormOpen(false)}
              onSave={handleSave}
            />
            {canImport && (
                <ImportInvestorsDialog
                    open={isImportOpen}
                    onClose={() => setIsImportOpen(false)}
                    onImported={() => fetchInvestors()}
                />
            )}
            <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell sx={hideOnPhone}>Sector</TableCell>
                        <TableCell sx={hideOnPhone}>Country</TableCell>
                        {canDelete && <TableCell align="right">Actions</TableCell>}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {investors.map(investor => (
                        <TableRow hover key={investor._id}>
                            <TableCell>
                                <Link to={`/investors/${investor._id}`}>{investor.investorName}</Link>
                                <Chip
                                    size="small"
                                    label={investor.organisationType || DEFAULT_ORGANISATION_TYPE}
                                    color={(investor.organisationType || DEFAULT_ORGANISATION_TYPE) === DEFAULT_ORGANISATION_TYPE ? 'default' : 'info'}
                                    variant="outlined"
                                    sx={{ ml: 1 }}
                                />
                                {/* On phones the sector and country show under the name. */}
                                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.5 }}>
                                    {[investor.sector, investor.countryOfOrigin].filter(Boolean).join(' · ')}
                                </Typography>
                            </TableCell>
                            <TableCell sx={hideOnPhone}>{investor.sector}</TableCell>
                            <TableCell sx={hideOnPhone}>{investor.countryOfOrigin}</TableCell>
                            {canDelete && (
                                <TableCell align="right">
                                    <Button size="small" color="error" onClick={() => setDeleting(investor)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </TableContainer>
            {deleting && (
                <DeleteInvestorDialog investor={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />
            )}
        </Container>
    );
};

export default InvestorDirectoryPage;
