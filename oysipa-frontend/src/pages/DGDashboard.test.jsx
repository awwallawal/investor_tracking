import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import DGDashboard from './DGDashboard';
import apiClient from '../api/api';
import { getAuthenticatedUser } from '../utils/auth';

// Mock external dependencies
vi.mock('../api/api');
vi.mock('../utils/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));
// A fixed "today" so the year selector (and the snapshot) do not change with the calendar.
vi.mock('../utils/dates', async (importOriginal) => ({
  ...(await importOriginal()),
  todayLagos: () => '2026-06-15',
}));

describe('DGDashboard', () => {
  const mockKpiData = {
    totalInvestors: 150,
    totalProjects: 60,
    recentInteractions: 500,
    projectsByStage: [
      { stage: 'Lead', count: 20 },
      { stage: 'Commitment', count: 40 },
    ],
  };

  const mockUser = {
    name: 'Test User',
    role: 'Director-General',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockReturnValue(mockUser);
    apiClient.get.mockImplementation((url) => Promise.resolve({
      data: url === '/api/admin/issues-metric'
        ? { year: 2026, total: 0, resolved: 0, withdrawn: 0, share: null, band: null }
        : mockKpiData,
    }));
  });

  it('fetches and displays KPI data and welcome message correctly', async () => {
    render(
      <BrowserRouter>
        <DGDashboard />
      </BrowserRouter>
    );

    // ✅ Use findByText for simpler async waits
    expect(await screen.findByText(`Welcome ${mockUser.role}, ${mockUser.name}`))
      .toBeInTheDocument();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    // KPI Data Checks
    expect(await screen.findByText('Total Investors')).toBeInTheDocument();
    expect(screen.getByText(mockKpiData.totalInvestors.toString())).toBeInTheDocument();

    expect(await screen.findByText('Total Projects')).toBeInTheDocument();
    expect(screen.getByText(mockKpiData.totalProjects.toString())).toBeInTheDocument();

    expect(await screen.findByText('All-Time Interactions')).toBeInTheDocument();
    expect(screen.getByText(mockKpiData.recentInteractions.toString())).toBeInTheDocument();

    // Ensure API was called correctly
    expect(apiClient.get).toHaveBeenCalledWith('/api/admin/dashboard-kpis');

    // Resolved-share widget (DLR 4.5)
    expect(await screen.findByText('Investor issues resolved')).toBeInTheDocument();
    expect(await screen.findByText('No issues registered')).toBeInTheDocument();
  });

  it('displays an error message if API call fails', async () => {
    apiClient.get.mockRejectedValue(new Error('API Error'));

    render(
      <BrowserRouter>
        <DGDashboard />
      </BrowserRouter>
    );

    // Check for user-friendly error
    expect(await screen.findByText('Failed to fetch KPI data.')).toBeInTheDocument();

    // Ensure KPI data is not displayed
    expect(screen.queryByText('Total Investors')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Projects')).not.toBeInTheDocument();
  });

  it('matches snapshot after successful render', async () => {
    render(
      <BrowserRouter>
        <DGDashboard />
      </BrowserRouter>
    );

    await screen.findByText(`Welcome ${mockUser.role}, ${mockUser.name}`);
    await screen.findByText('No issues registered');
    expect(document.body).toMatchSnapshot();
  });

  // Optional: Enable if you implement a loading indicator in DGDashboard
  it.skip('shows loading indicator before data loads', async () => {
    apiClient.get.mockImplementation(() => new Promise(() => {})); // Simulate pending request

    render(
      <BrowserRouter>
        <DGDashboard />
      </BrowserRouter>
    );

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
