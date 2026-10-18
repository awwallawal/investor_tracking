import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import InvestorForm from '../components/InvestorForm';
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

const InvestorDirectoryPage = () => {
    const [investors, setInvestors] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [success, setSuccess] = useState('');
    const canDelete = isAdminRole(getCurrentUser()?.role);

    const fetchInvestors = async () => {
        try {
            const response = await apiClient.get('/api/investors');
            setInvestors(response.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    };

    useEffect(() => {
        fetchInvestors();
    }, []);

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
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4">Investor Directory</Typography>
                <Button variant="contained" onClick={() => setIsFormOpen(true)}>
                    Register New Investor
                </Button>
            </Box>
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
            <InvestorForm
              open={isFormOpen}
              onClose={() => setIsFormOpen(false)}
              onSave={handleSave}
            />
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Sector</TableCell>
                        <TableCell>Country</TableCell>
                        {canDelete && <TableCell align="right">Actions</TableCell>}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {investors.map(investor => (
                        <TableRow hover key={investor._id}>
                            <TableCell>
                                <Link to={`/investors/${investor._id}`}>{investor.investorName}</Link>
                            </TableCell>
                            <TableCell>{investor.sector}</TableCell>
                            <TableCell>{investor.countryOfOrigin}</TableCell>
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
            {deleting && (
                <DeleteInvestorDialog investor={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />
            )}
        </Container>
    );
};

export default InvestorDirectoryPage;
