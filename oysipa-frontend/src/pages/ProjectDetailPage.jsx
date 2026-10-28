import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Button, Link as MuiLink } from '@mui/material';
import ProjectForm from '../components/ProjectForm';
import InteractionLogForm from '../components/InteractionLogForm';
import InteractionLogList from '../components/InteractionLogList';
import ProjectAnnouncements from '../components/ProjectAnnouncements';
import apiClient from '../api/api';
import { getCurrentUser, isAdminRole } from '../utils/currentUser';
import { dateLine } from '../utils/dates';
import { formatMoney } from '../utils/money';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import KeyFacts from '../components/ui/KeyFacts';
import StatusBadge from '../components/ui/StatusBadge';
import { STAGE_TONE } from '../components/ui/statusTones';

const ProjectDetailPage = () => {
    const [project, setProject] = useState(null);
    const [isEditFormOpen, setIsEditFormOpen] = useState(false);
    const [isLogFormOpen, setIsLogFormOpen] = useState(false);
    const [logRefreshKey, setLogRefreshKey] = useState(0);
    const { id } = useParams();
    const currentUser = getCurrentUser();
    const canDelete = isAdminRole(currentUser?.role);

    const fetchProject = useCallback(async () => {
        try {
            const response = await apiClient.get(`/api/projects/${id}`);
            setProject(response.data);
        } catch (error) {
            console.error("Fetch error:", error);
        }
    }, [id]);

    useEffect(() => {
        fetchProject();
    }, [id, fetchProject]);

    const handleEditFormOpen = () => {
        setIsEditFormOpen(true);
    };

    const handleEditFormSave = () => {
        setIsEditFormOpen(false);
        fetchProject();
        setLogRefreshKey(prevKey => prevKey + 1); // Refresh interaction log
    };

    const handleLogFormOpen = () => {
        setIsLogFormOpen(true);
    };

    const handleLogFormSave = () => {
        setIsLogFormOpen(false);
        setLogRefreshKey(prevKey => prevKey + 1);
    };

    if (!project) {
        return <div>Loading...</div>;
    }

    // DG/Admin can always write. Staff only on projects of investors assigned to
    // them (the backend enforces the same rule; GET populates the investor).
    const assignedTo = project.investor?.assignedTo;
    const canWrite = isAdminRole(currentUser?.role)
        || (currentUser?.role === 'Staff' && !!currentUser?.id
            && String(assignedTo?._id || assignedTo || '') === currentUser.id);

    const investor = project.investor;
    const stage = project.lifecycleStatus?.name;
    const facts = [
        {
            label: 'Investor',
            value: investor?._id
                ? <MuiLink component={Link} to={`/investors/${investor._id}`}>{investor.investorName || 'N/A'}</MuiLink>
                : 'N/A',
        },
        { label: 'Description', value: project.description || 'N/A', multiline: true },
        { label: 'Estimated value', value: formatMoney(project.estimatedValue, project.currency) },
        { label: 'Estimated jobs', value: project.estimatedNumberOfJobs?.toLocaleString() || '0' },
        { label: 'Location', value: project.location || 'N/A' },
        project.sector ? { label: 'Sector', value: project.sector } : null,
        { label: 'Lifecycle status', value: stage ? <StatusBadge label={stage} tone={STAGE_TONE} /> : 'N/A' },
        { label: 'Date registered', value: dateLine(project, 'dateRegistered') || '—' },
    ];

    return (
        <Box sx={{ minWidth: 0 }}>
            <PageHeader
                breadcrumbs={[
                    { label: 'Projects', to: '/projects' },
                    ...(investor?._id ? [{ label: investor.investorName || 'Investor', to: `/investors/${investor._id}` }] : []),
                    { label: project.projectTitle || 'Project' },
                ]}
                eyebrow="Project"
                title={project.projectTitle}
                meta={stage ? <StatusBadge label={stage} tone={STAGE_TONE} /> : null}
                actions={(
                    <>
                        <Button variant="outlined" onClick={handleEditFormOpen}>Edit Project</Button>
                        <Button variant="contained" onClick={handleLogFormOpen}>Log Interaction</Button>
                    </>
                )}
            />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <SectionCard title="Key facts">
                    <KeyFacts items={facts} ariaLabel="Project facts" />
                </SectionCard>

                <ProjectAnnouncements projectId={project._id} canWrite={canWrite} />

                <InteractionLogList projectId={project._id} canWrite={canWrite} canDelete={canDelete} key={logRefreshKey} />
            </Box>

            <ProjectForm
                open={isEditFormOpen}
                onClose={() => setIsEditFormOpen(false)}
                onSave={handleEditFormSave}
                projectData={project}
            />

            <InteractionLogForm
                open={isLogFormOpen}
                onClose={() => setIsLogFormOpen(false)}
                onSave={handleLogFormSave}
                projectId={project._id}
            />
        </Box>
    );
};

export default ProjectDetailPage;
