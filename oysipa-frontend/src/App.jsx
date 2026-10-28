import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import LoginPage from './pages/Login';
import UserManagementPage from './pages/UserManagementPage';
import InvestorDirectoryPage from './pages/InvestorDirectoryPage';
import InvestorProfilePage from './pages/InvestorProfilePage'; // Import the profile page
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectListPage from './pages/ProjectListPage';
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
import ChangeLogPage from './pages/ChangeLogPage';
import SaberReportPage from './pages/SaberReportPage';
import FillGapsPage from './pages/FillGapsPage';

const isAuthenticated = () => {
  return localStorage.getItem('token') !== null;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
            <Route path="/fill-gaps" element={<AppLayout><FillGapsPage /></AppLayout>} />
          </Route>

          {/* Admin Protected Routes (MoU MDAs: DG + Portal-Admin; lifecycle statuses: Portal-Admin only, inside the page) */}
          <Route element={<ProtectedRoute allowedRoles={['Director-General', 'Portal-Admin']} />}>
            <Route path="/admin" element={<AppLayout><AdminPage /></AppLayout>} />
            {/* Read-only ChangeLog viewer (story 11.10) */}
            <Route path="/changelog" element={<AppLayout><ChangeLogPage /></AppLayout>} />
            {/* SABER report / verifier export (story 11.9) */}
            <Route path="/saber-report" element={<AppLayout><SaberReportPage /></AppLayout>} />
          </Route>

        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;