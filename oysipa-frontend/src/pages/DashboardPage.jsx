import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import DGDashboard from './DGDashboard';
import StaffDashboard from './StaffDashboard';
import AdminDashboard from './AdminDashboard';
import { Alert, Box } from '@mui/material';

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
    case 'Portal-Admin':
      return <AdminDashboard />;
    case 'Staff':
      return <StaffDashboard />;
    default:
      // Unknown role: say so instead of spinning forever.
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', p: 2 }}>
          <Alert severity="warning">No access for this role. Please contact the Portal Admin.</Alert>
        </Box>
      );
  }
};

export default DashboardPage;
