import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/Login';
import DGDashboard from './pages/DGDashboard';
import StaffDashboard from './pages/StaffDashboard';
import UserManagementPage from './pages/UserManagementPage';
import InvestorDirectoryPage from './pages/InvestorDirectoryPage';
import InvestorProfilePage from './pages/InvestorProfilePage'; // Import the profile page
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectListPage from './pages/ProjectListPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminPage from './pages/AdminPage';
import InteractionListPage from './pages/InteractionListPage'; // Import the new page
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import AppLayout from './components/AppLayout'; // Import the correct AppLayout
import EvidenceLibraryPage from './pages/EvidenceLibraryPage';
import EvidenceFolderPage from './pages/EvidenceFolderPage';
import IssuesPage from './pages/IssuesPage';
import IssueDetailPage from './pages/IssueDetailPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import AnnouncementDetailPage from './pages/AnnouncementDetailPage';

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
    // Headings shrink on phones (below 600px) so long titles fit.
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2, '@media (max-width:599.95px)': { fontSize: '26px' } },
    h2: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3, '@media (max-width:599.95px)': { fontSize: '21px' } },
    h3: { fontSize: '20px', fontWeight: 600, lineHeight: 1.4, '@media (max-width:599.95px)': { fontSize: '18px' } },
    h4: { '@media (max-width:599.95px)': { fontSize: '1.5rem', lineHeight: 1.3 } },
    h5: { '@media (max-width:599.95px)': { fontSize: '1.25rem' } },
    body1: { fontSize: '16px', fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5 },
  },
});

const isAuthenticated = () => {
  return localStorage.getItem('token') !== null;
};

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
            <Route path="/investors/new" element={<Navigate to="/investors" replace />} />
            <Route path="/investors/:id" element={<AppLayout><InvestorProfilePage /></AppLayout>} />
            <Route path="/projects" element={<AppLayout><ProjectListPage /></AppLayout>} />
            <Route path="/projects/:id" element={<AppLayout><ProjectDetailPage /></AppLayout>} />
            <Route path="/interactions" element={<AppLayout><InteractionListPage /></AppLayout>} />
            <Route path="/evidence" element={<AppLayout><EvidenceLibraryPage /></AppLayout>} />
            <Route path="/evidence/:folderId" element={<AppLayout><EvidenceFolderPage /></AppLayout>} />
            <Route path="/issues" element={<AppLayout><IssuesPage /></AppLayout>} />
            <Route path="/issues/:id" element={<AppLayout><IssueDetailPage /></AppLayout>} />
            <Route path="/announcements" element={<AppLayout><AnnouncementsPage /></AppLayout>} />
            <Route path="/announcements/:id" element={<AppLayout><AnnouncementDetailPage /></AppLayout>} />
          </Route>

          {/* Admin Protected Routes (MoU MDAs: DG + Portal-Admin; lifecycle statuses: Portal-Admin only, inside the page) */}
          <Route element={<ProtectedRoute allowedRoles={['Director-General', 'Portal-Admin']} />}>
            <Route path="/admin" element={<AppLayout><AdminPage /></AppLayout>} />
          </Route>

        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;