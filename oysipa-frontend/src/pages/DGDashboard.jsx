import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import LifecycleChart from '../components/LifecycleChart';
import IssuesShareWidget from '../components/IssuesShareWidget';
import AnnouncementsWidget from '../components/AnnouncementsWidget';
import apiClient from '../api/api';
import { getAuthenticatedUser } from '../utils/auth';

const DGDashboard = () => {
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = getAuthenticatedUser();

  useEffect(() => {
    const fetchKpiData = async () => {
      try {
        const { data } = await apiClient.get('/api/admin/dashboard-kpis');
        setKpiData(data);
      } catch (err) {
        setError('Failed to fetch KPI data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchKpiData();
  }, []);

  if (loading) {
    return <Typography color="text.secondary">Loading...</Typography>;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  let welcome = null;
  if (user) welcome = user.name ? `Welcome ${user.role}, ${user.name}` : `Welcome ${user.role}`;

  return (
    <Box>
      <PageHeader eyebrow="Oyo State investment pipeline" title="Dashboard" subtitle={welcome} />
      {kpiData && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box
            component="section"
            aria-label="Headline numbers"
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}
          >
            <StatCard label="Total Investors" value={kpiData.totalInvestors} hint="intermediaries and promotion agents not counted" to="/investors" />
            <StatCard label="Total Projects" value={kpiData.totalProjects} hint="all registered projects" to="/projects" />
            <StatCard label="All-Time Interactions" value={kpiData.recentInteractions} hint="all interactions logged" to="/interactions" />
          </Box>
          <Box
            component="section"
            aria-label="SABER indicators"
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}
          >
            <IssuesShareWidget />
            <AnnouncementsWidget />
          </Box>
          <LifecycleChart data={kpiData.projectsByStage} />
        </Box>
      )}
    </Box>
  );
};

export default DGDashboard;