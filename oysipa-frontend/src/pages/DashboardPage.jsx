import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import DGDashboard from './DGDashboard';
import StaffDashboard from './StaffDashboard';
import AdminDashboard from './AdminDashboard';
import { CircularProgress, Box } from '@mui/material';

const getRoleFromToken = () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const decodedToken = jwtDecode(token);
      return decodedToken.user.role;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }
  return null;
};

const DashboardPage = () => {
  const userRole = getRoleFromToken();

  if (!userRole) {
    // If no role, redirect to login
    return <Navigate to="/login" replace />;
  }

  switch (userRole) {
    case 'Director-General':
      return <DGDashboard />;
    case 'Portal Administrator':
      return <AdminDashboard />;
    case 'Staff':
      return <StaffDashboard />;
    default:
      // Optional: handle unknown roles
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress />
        </Box>
      );
  }
};

export default DashboardPage;
