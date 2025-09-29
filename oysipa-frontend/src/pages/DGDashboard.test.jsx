import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import DGDashboard from './DGDashboard';
import apiClient from '../api/api';
import { getAuthenticatedUser } from '../utils/auth'; // Changed import

// Mock the external dependencies
vi.mock('../api/api');
vi.mock('../utils/auth', () => ({ // Changed mock path and structure
  getAuthenticatedUser: vi.fn(),
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
    // Reset mocks before each test
    vi.clearAllMocks();

    // Setup mock implementations
    getAuthenticatedUser.mockReturnValue(mockUser); // Changed mock assignment
    apiClient.get.mockResolvedValue({ data: mockKpiData });
  });

  it('fetches and displays the KPI data, welcome message, and correct titles', async () => {
    render(
      <BrowserRouter>
        <DGDashboard />
      </BrowserRouter>
    );

    // Wait for the API call to resolve and the component to re-render
    await waitFor(() => {
      // Check for the welcome message
      expect(screen.getByText(`Welcome ${mockUser.role}, ${mockUser.name}`)).toBeInTheDocument();
    });

    // Check for the main title
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    // Check for the KPI widgets with their titles and values
    await waitFor(() => {
        expect(screen.getByText('Total Investors')).toBeInTheDocument();
        expect(screen.getByText(mockKpiData.totalInvestors.toString())).toBeInTheDocument();

        expect(screen.getByText('Total Projects')).toBeInTheDocument();
        expect(screen.getByText(mockKpiData.totalProjects.toString())).toBeInTheDocument();

        expect(screen.getByText('All-Time Interactions')).toBeInTheDocument();
        expect(screen.getByText(mockKpiData.recentInteractions.toString())).toBeInTheDocument();
        
        expect(apiClient.get).toHaveBeenCalledWith('/api/admin/dashboard-kpis');
    });
  });

  it('displays an error message if the API call fails', async () => {
    // Override the mock for this specific test
    apiClient.get.mockRejectedValue(new Error('API Error'));

    render(
      <BrowserRouter>
        <DGDashboard />
      </BrowserRouter>
    );

    // Wait for the error message to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch KPI data.')).toBeInTheDocument();
    });
  });
});