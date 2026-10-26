import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert, Card } from '@mui/material';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import { jwtDecode } from 'jwt-decode';
import ProjectSummaryCard from '../components/ProjectSummaryCard';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import apiClient from '../api/api';

const StaffDashboard = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decodedToken = jwtDecode(token);
        setUser(decodedToken.user);
      } catch (err) {
        console.error('Error decoding token:', err);
        setError('Invalid session. Please log in again.');
        setLoading(false);
      }
    } else {
      setError('No authentication token found. Please log in.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) {
        return;
      }

      try {
        const { data } = await apiClient.get('/api/staff/dashboard');
        setProjects(data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.response?.data?.msg || 'Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Box>
      <PageHeader
        eyebrow="My work"
        title={user.name ? `Welcome, ${user.name}` : 'Welcome'}
        subtitle={`Role: ${user.role}`}
      />

      <Box
        component="section"
        aria-label="My numbers"
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', mb: 4 }}
      >
        <StatCard label="My assigned projects" value={projects.length} hint="assigned to you" tone="primary" />
      </Box>

      <Typography variant="h5" component="h2" gutterBottom>
        Your Assigned Projects
      </Typography>
      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AssignmentTurnedInOutlinedIcon />}
            title="All Clear!"
            text="You have no projects assigned to you at the moment. When a new project is assigned, it will appear here."
          />
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {projects.map((project) => (
            <ProjectSummaryCard key={project._id} project={project} />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default StaffDashboard;