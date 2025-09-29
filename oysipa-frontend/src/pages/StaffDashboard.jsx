import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { jwtDecode } from 'jwt-decode';
import ProjectSummaryCard from '../components/ProjectSummaryCard';
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
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Welcome, {user.name}
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Role: {user.role}
      </Typography>

      <>
        <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>
          Your Assigned Projects
        </Typography>
        {projects.length === 0 ? (
          <Paper elevation={0} sx={{ textAlign: 'center', p: 4, backgroundColor: 'grey.100' }}>
            <Typography variant="h6" gutterBottom>
              All Clear!
            </Typography>
            <Typography variant="body1">
              You have no projects assigned to you at the moment. When a new project is assigned, it will appear here.
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {projects.map((project) => (
              <ProjectSummaryCard key={project._id} project={project} />
            ))}
          </Box>
        )}
      </>
    </Box>
  );
};

export default StaffDashboard;