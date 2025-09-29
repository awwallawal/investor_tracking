import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Box, Typography, Divider } from '@mui/material';
import InvestorEditForm from '../components/InvestorEditForm';
import UserAssignmentDropdown from '../components/UserAssignmentDropdown';
import ProjectList from '../components/ProjectList';
import ProjectForm from '../components/ProjectForm'; // Import ProjectForm
import apiClient from '../api/api';

const InvestorProfilePage = () => {
    const [investor, setInvestor] = useState(null);
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isProjectFormOpen, setIsProjectFormOpen] = useState(false); // State for project form
    const { id } = useParams();

    const fetchInvestorAndProjects = useCallback(async () => {
        try {
            const response = await apiClient.get(`/api/investors/${id}`);
            setInvestor(response.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    }, [id]); // id is a dependency of useCallback

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
        fetchInvestorAndProjects(); // Re-fetch data to update the project list
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

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>{investor.investorName}</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>Email: {investor.email}</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>Phone: {investor.phoneNumber}</Typography>
            <p>Sector: {investor.sector}</p>
            <p>Country of Origin: {investor.countryOfOrigin}</p>
            <p>Company Registration Info: {investor.companyRegistrationInfo}</p>
            <p>Key Contact Person: {investor.keyContactPerson}</p>
            <p>Assigned Staff: {investor.assignedTo ? investor.assignedTo.name : 'Unassigned'}</p>

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button variant="contained" onClick={handleEditClick}>
                    Edit Investor
                </Button>
                <UserAssignmentDropdown
                    investorId={investor._id}
                    currentAssignedUser={investor.assignedTo}
                    onAssign={handleAssignUser}
                />
                <Button variant="contained" color="secondary" onClick={handleProjectFormOpen}>
                    Add New Project
                </Button>
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

            <Divider sx={{ my: 4 }} />

            <ProjectList investorId={investor._id} />

        </Box>
    );
};

export default InvestorProfilePage;
