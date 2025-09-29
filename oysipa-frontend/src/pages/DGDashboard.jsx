import React, { useState, useEffect } from 'react';
import KpiWidget from '../components/KpiWidget';
import LifecycleChart from '../components/LifecycleChart';
import apiClient from '../api/api';
import { getAuthenticatedUser } from '../utils/auth';

const DGDashboard = () => {
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = getAuthenticatedUser();

  console.log('DGDashboard user object:', user);

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
    <div>
      {user && <h2>{`Welcome ${user.role}, ${user.name}`}</h2>}
      <h1>Dashboard</h1>
      {kpiData && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          <KpiWidget title="Total Investors" value={kpiData.totalInvestors} navigateTo="/investors" />
          <KpiWidget title="Total Projects" value={kpiData.totalProjects} navigateTo="/projects" />
          <KpiWidget title="All-Time Interactions" value={kpiData.recentInteractions} navigateTo="/interactions" />
          <LifecycleChart data={kpiData.projectsByStage} />
        </div>
      )}
    </div>
  );
};

export default DGDashboard;