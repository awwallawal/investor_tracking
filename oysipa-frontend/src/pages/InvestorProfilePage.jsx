import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Box, Typography, Divider } from '@mui/material';
import InvestorEditForm from '../components/InvestorEditForm';
import UserAssignmentDropdown from '../components/UserAssignmentDropdown';
import ProjectList from '../components/ProjectList';
import ProjectForm from '../components/ProjectForm'; // Import ProjectForm
import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/api';

// Same decoding as components/ProtectedRoute.jsx
const getRoleFromToken = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        return jwtDecode(token).user.role;
    } catch (error) {
        console.error('Error decoding token:', error);
        return null;
    }
};

const InvestorProfilePage = () => {
    const [investor, setInvestor] = useState(null);
    const [projects, setProjects] = useState([]); // Add state for projects
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isProjectFormOpen, setIsProjectFormOpen] = useState(false); // State for project form
    const { id } = useParams();
    const isStaff = getRoleFromToken() === 'Staff';

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
                {!isStaff && (
                    <UserAssignmentDropdown
                        investorId={investor._id}
                        currentAssignedUser={investor.assignedTo}
                        onAssign={handleAssignUser}
                    />
                )}
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

            <ProjectList projects={projects} />

        </Box>
    );
};

export default InvestorProfilePage;
