import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectListPage from '../pages/ProjectListPage';
import axios from 'axios';

vi.mock('axios');

describe('ProjectListPage', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({
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
    expect(axios.get).toHaveBeenCalledWith('/api/projects', expect.any(Object));
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
    expect(axios.get).toHaveBeenCalledWith('/api/projects?lifecycleStatus=Lead', expect.any(Object));
    expect(screen.getByText('Project List (Status: Lead)')).toBeInTheDocument();
  });

  it('renders no projects message if none are found', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

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
    axios.get.mockRejectedValueOnce(new Error('Network Error'));

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