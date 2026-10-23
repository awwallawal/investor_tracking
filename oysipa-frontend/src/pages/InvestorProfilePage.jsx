import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Box, Typography, Divider } from '@mui/material';
import InvestorEditForm from '../components/InvestorEditForm';
import UserAssignmentDropdown from '../components/UserAssignmentDropdown';
import ProjectList from '../components/ProjectList';
import ProjectForm from '../components/ProjectForm'; // Import ProjectForm
import InteractionLogForm from '../components/InteractionLogForm';
import InteractionLogList from '../components/InteractionLogList';
import apiClient from '../api/api';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { dateLine } from '../utils/dates';
import { DEFAULT_ORGANISATION_TYPE, UNKNOWN_LEAD_SOURCE } from '../constants/investorFields';

const InvestorProfilePage = () => {
    const [investor, setInvestor] = useState(null);
    const [projects, setProjects] = useState([]); // Add state for projects
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isProjectFormOpen, setIsProjectFormOpen] = useState(false); // State for project form
    const [isLogFormOpen, setIsLogFormOpen] = useState(false);
    const [logRefreshKey, setLogRefreshKey] = useState(0);
    const { id } = useParams();
    const currentUser = getCurrentUser();
    const isStaff = currentUser?.role === 'Staff';

    const fetchInvestorAndProjects = useCallback(async () => {
        try {
            // Fetch investor details and projects in parallel
            const [investorResponse, projectsResponse] = await Promise.all([
                apiClient.get(`/api/investors/${id}`),
                apiClient.get(`/api/projects/investors/${id}/projects`)
            ]);
            setInvestor(investorResponse.data);
            setProjects(projectsResponse.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    }, [id]);

    useEffect(() => {
        fetchInvestorAndProjects();
    }, [id, fetchInvestorAndProjects]);

    const handleEditClick = () => {
        setIsEditFormOpen(true);
    };

    const handleEditSave = () => {
        setIsEditFormOpen(false);
        fetchInvestorAndProjects();
    };

    const handleProjectFormOpen = () => {
        setIsProjectFormOpen(true);
    };

    const handleProjectFormSave = () => {
        setIsProjectFormOpen(false);
        fetchInvestorAndProjects(); // This will now re-fetch both investor and projects
    };

    const handleLogFormSave = () => {
        setIsLogFormOpen(false);
        setLogRefreshKey((k) => k + 1); // re-fetch the interactions timeline
    };

    const handleAssignUser = async (userId) => {
        try {
            await apiClient.put(`/api/investors/${investor._id}`, { assignedTo: userId || null });
            fetchInvestorAndProjects();
        } catch (error) {
            console.error("Assignment error:", error);
        }
    };

    if (!investor) {
        return <div>Loading...</div>;
    }

    // DG/Admin can always write. Staff only on investors assigned to them
    // (the backend enforces the same rule; GET populates assignedTo).
    const canWrite = !isStaff
        || (!!currentUser?.id && investor.assignedTo?._id === currentUser.id);

    return (
        <Box sx={{ p: { xs: 0, sm: 3 } }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ overflowWrap: 'anywhere' }}>{investor.investorName}</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>Email: {investor.email}</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>Phone: {investor.phoneNumber}</Typography>
            <p>Sector: {investor.sector}</p>
            <p>Country of Origin: {investor.countryOfOrigin}</p>
            <p>Company Registration Info: {investor.companyRegistrationInfo}</p>
            <p>Key Contact Person: {investor.keyContactPerson}</p>
            <p>Assigned Staff: {investor.assignedTo ? investor.assignedTo.name : 'Unassigned'}</p>
            <p>First contact: {dateLine(investor, 'firstContactDate')}</p>
            <p>Lead source: {investor.leadSource || UNKNOWN_LEAD_SOURCE}</p>
            {investor.leadSourceDetail && <p>Lead source detail: {investor.leadSourceDetail}</p>}
            <p>Organisation type: {investor.organisationType || DEFAULT_ORGANISATION_TYPE}</p>
            {investor.referredBy && (
                <p>Referred by: {investor.referredBy._id
                    ? <Link to={`/investors/${investor.referredBy._id}`}>{investor.referredBy.investorName}</Link>
                    : String(investor.referredBy)}</p>
            )}
            <p>Website: {investor.website || '—'}</p>
            <p>Head office: {investor.headOffice || '—'}</p>
            <Typography component="div" sx={{ my: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                Notes: {investor.notes || '—'}
            </Typography>

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                {canWrite && (
                    <Button variant="contained" onClick={handleEditClick}>
                        Edit Investor
                    </Button>
                )}
                {!isStaff && (
                    <UserAssignmentDropdown
                        investorId={investor._id}
                        currentAssignedUser={investor.assignedTo}
                        onAssign={handleAssignUser}
                    />
                )}
                {canWrite && (
                    <Button variant="contained" color="secondary" onClick={handleProjectFormOpen}>
                        Add New Project
                    </Button>
                )}
            </Box>

            <InvestorEditForm
                open={isEditFormOpen}
                onClose={() => setIsEditFormOpen(false)}
                onSave={handleEditSave}
                investorData={investor}
            />

            <ProjectForm
                open={isProjectFormOpen}
                onClose={() => setIsProjectFormOpen(false)}
                onSave={handleProjectFormSave}
                investorId={investor._id}
            />

            <Divider sx={{ my: { xs: 3, sm: 4 } }} />

            <ProjectList projects={projects} />

            <Divider sx={{ my: 4 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h5" component="h2">Interactions</Typography>
                {canWrite && (
                    <Button variant="contained" onClick={() => setIsLogFormOpen(true)}>
                        Log Interaction
                    </Button>
                )}
            </Box>

            <InteractionLogList investorId={investor._id} canWrite={canWrite} canDelete={isAdminRole(currentUser?.role)} key={logRefreshKey} />

            <InteractionLogForm
                open={isLogFormOpen}
                onClose={() => setIsLogFormOpen(false)}
                onSave={handleLogFormSave}
                investorId={investor._id}
            />

        </Box>
    );
};

export default InvestorProfilePage;
