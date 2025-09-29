import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/api';

// Mock jwt-decode
vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

// Mock apiClient
vi.mock('../api/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

const MockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: (props) => {
      MockNavigate(props);
      return <div data-testid="mock-navigate" data-to={props.to} />;
    },
    useNavigate: () => vi.fn(), // Keep useNavigate mocked if other tests rely on it
  };
});

describe('DashboardPage', () => {
  const mockStaffUser = {
    id: 'staff123',
    name: 'Test Staff',
    role: 'Staff',
  };
  const mockToken = 'mock-jwt-token';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    localStorage.clear();

    // Mock jwtDecode to return a staff user
    jwtDecode.mockReturnValue({ user: mockStaffUser });
    localStorage.setItem('token', mockToken);

    // Reset MockNavigate before each test
    MockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays loading state initially', () => {
    apiClient.get.mockImplementationOnce(() => new Promise(() => {})); // Never resolve fetch
    render(
      <Router>
        <DashboardPage />
      </Router>
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays assigned projects for a staff member', async () => {
    const mockProjects = [
      { _id: 'proj1', projectTitle: 'Project Alpha', investor: { name: 'Inv A' }, lifecycleStatus: 'Lead' },
      { _id: 'proj2', projectTitle: 'Project Beta', investor: { name: 'Inv B' }, lifecycleStatus: 'Commitment' },
    ];

    apiClient.get.mockResolvedValueOnce({ data: mockProjects });

    render(
      <Router>
        <DashboardPage />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome, Test Staff/i)).toBeInTheDocument();
      expect(screen.getByText(/Your Assigned Projects/i)).toBeInTheDocument();
      expect(screen.getByText(/Project Alpha/i)).toBeInTheDocument();
      expect(screen.getByText(/Project Beta/i)).toBeInTheDocument();
    });
  });

  it('displays "No projects assigned" if no projects are returned', async () => {
    apiClient.get.mockResolvedValueOnce({ data: [] });

    render(
      <Router>
        <DashboardPage />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText(/You have no projects assigned to you at the moment. When a new project is assigned, it will appear here./i)).toBeInTheDocument();
    });
  });

  it('displays an error message if fetching projects fails', async () => {
    apiClient.get.mockRejectedValueOnce({ response: { data: { msg: 'Network error' } } });

    render(
      <Router>
        <DashboardPage />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Network error/i);
    });
  });

  it('displays "Access Denied" if user is not Staff', async () => {
    jwtDecode.mockReturnValue({ user: { id: 'admin123', name: 'Test Admin', role: 'Portal Administrator' } });
    localStorage.setItem('token', mockToken); // Ensure token is set for the effect to run

    render(
      <Router>
        <DashboardPage />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText(/Portal Administration/i)).toBeInTheDocument();
    });
  });

  it('displays "No authentication token found" if no token is present', async () => {
    localStorage.removeItem('token'); // Remove token
    jwtDecode.mockReset(); // Reset the mock to its original implementation

    render(
      <Router>
        <DashboardPage />
      </Router>
    );

    await waitFor(() => {
      expect(MockNavigate).toHaveBeenCalledWith({ to: '/login', replace: true });
    });
  });
});