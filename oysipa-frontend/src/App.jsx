import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { createTheme, ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/Login';
import DGDashboard from './pages/DGDashboard';
import StaffDashboard from './pages/StaffDashboard';
import UserManagementPage from './pages/UserManagementPage';
import InvestorDirectoryPage from './pages/InvestorDirectoryPage';
import InvestorForm from './components/InvestorForm';
import InvestorProfilePage from './pages/InvestorProfilePage'; // Import the profile page
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectListPage from './pages/ProjectListPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminPage from './pages/AdminPage';
import InteractionListPage from './pages/InteractionListPage'; // Import the new page
import ProtectedRoute from './components/ProtectedRoute';
import { jwtDecode } from 'jwt-decode';
import DashboardPage from './pages/DashboardPage';

// Define the theme based on front-end-spec.md
const theme = createTheme({
  palette: {
    primary: {
      main: '#850504',
    },
    secondary: {
      main: '#F9F9F9',
    },
    accent: {
      main: '#0A558C',
    },
    success: {
      main: '#198754',
    },
    warning: {
      main: '#FFC107',
    },
    error: {
      main: '#DC3545',
    },
    text: {
      primary: '#212529',
      secondary: '#6C757D',
    },
    background: {
      default: '#F9F9F9',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Poppins, sans-serif',
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3 },
    h3: { fontSize: '20px', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '16px', fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5 },
  },
});

const isAuthenticated = () => {
  return localStorage.getItem('token') !== null;
};

const getRoleFromToken = () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const decodedToken = jwtDecode(token);
      console.log('Decoded Token:', decodedToken);
      console.log('Extracted Role:', decodedToken.user.role);
      return decodedToken.user.role; // Assuming role is stored in token.user.role
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }
  return null;
};

// Main App Layout for protected routes
const AppLayout = ({ children }) => (
  <Box sx={{ display: 'flex' }}>
    <CssBaseline />
    <Header />
    <Sidebar />
    <Box component="main" sx={{ flexGrow: 1, p: 3, mt: '64px' }}>
      {children}
    </Box>
  </Box>
);


function App() {

  return (
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              isAuthenticated() ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          {/* General Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route
              path="/dashboard"
              element={
                <AppLayout>
                  <DashboardPage />
                </AppLayout>
              }
            />
            <Route path="/users" element={<AppLayout><UserManagementPage /></AppLayout>} />
            <Route path="/investors" element={<AppLayout><InvestorDirectoryPage /></AppLayout>} />
            <Route path="/investors/new" element={<AppLayout><InvestorForm /></AppLayout>} />
            <Route path="/investors/:id" element={<AppLayout><InvestorProfilePage /></AppLayout>} />
            <Route path="/projects" element={<AppLayout><ProjectListPage /></AppLayout>} />
            <Route path="/projects/:id" element={<AppLayout><ProjectDetailPage /></AppLayout>} />
            <Route path="/interactions" element={<AppLayout><InteractionListPage /></AppLayout>} />
          </Route>

          {/* Admin Protected Routes */}
          <Route element={<ProtectedRoute allowedRoles={['Portal-Admin']} />}>
            <Route path="/admin" element={<AppLayout><AdminPage /></AppLayout>} />
          </Route>

        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;