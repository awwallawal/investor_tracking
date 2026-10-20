import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import KpiWidget from '../components/KpiWidget';
import LifecycleChart from '../components/LifecycleChart';
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
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <Box>
      <Typography variant="h4" component="h1">Dashboard</Typography>
      {user && (
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          {`Welcome ${user.role}, ${user.name}`}
        </Typography>
      )}
      {kpiData && (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
            <KpiWidget title="Total Investors" value={kpiData.totalInvestors} navigateTo="/investors" />
            <KpiWidget title="Total Projects" value={kpiData.totalProjects} navigateTo="/projects" />
            <KpiWidget title="All-Time Interactions" value={kpiData.recentInteractions} navigateTo="/interactions" />
          </Box>
          <LifecycleChart data={kpiData.projectsByStage} />
        </>
      )}
    </Box>
  );
};

export default DGDashboard;