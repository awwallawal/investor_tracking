import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectListPage from '../pages/ProjectListPage';
import apiClient from '../api/api';

// Mock the shared API client (the page fetches through apiClient, not axios directly)
vi.mock('../api/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('ProjectListPage', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.get.mockResolvedValue({
      data: [
        { _id: '1', projectTitle: 'Project Alpha', investor: { investorName: 'Investor A' } },
        { _id: '2', projectTitle: 'Project Beta', investor: { investorName: 'Investor B' } },
      ],
    });
  });

  it('renders loading state initially', async () => {
    render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Loading projects...')).toBeInTheDocument();

    // Wait for the loading state to disappear, indicating useEffect has completed
    await waitFor(() => {
      expect(screen.queryByText('Loading projects...')).not.toBeInTheDocument();
    });
  });

  it('renders projects after fetching', async () => {
    render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Project Alpha (Investor: Investor A)')).toBeInTheDocument();
      expect(screen.getByText('Project Beta (Investor: Investor B)')).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects');
  });

  it('renders projects filtered by lifecycleStatus from URL', async () => {
    render(
      <MemoryRouter initialEntries={['/projects?lifecycleStatus=Lead']}>
        <Routes>
          <Route path="/projects" element={<ProjectListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Project Alpha (Investor: Investor A)')).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects?lifecycleStatus=Lead');
    expect(screen.getByText('Project List (Status: Lead)')).toBeInTheDocument();
  });

  it('renders no projects message if none are found', async () => {
    apiClient.get.mockResolvedValueOnce({ data: [] });

    render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No projects found.')).toBeInTheDocument();
    });
  });

  it('renders error message if fetching fails', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('Network Error'));

    render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Error: Failed to fetch projects.')).toBeInTheDocument();
    });
  });
});