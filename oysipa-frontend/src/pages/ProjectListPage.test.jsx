import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProjectListPage from '../pages/ProjectListPage';
import apiClient from '../api/api';

// Mock the shared API client (the page fetches through apiClient, not axios directly)
vi.mock('../api/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

const PROJECTS = [
  {
    _id: '1', projectTitle: 'Project Alpha', investor: { _id: 'i1', investorName: 'Investor A' }, lifecycleStatus: { name: 'Lead' }, sector: 'Agribusiness', estimatedValue: 2500000000, currency: 'NGN', estimatedNumberOfJobs: 120,
  },
  {
    _id: '2', projectTitle: 'Project Beta', investor: { _id: 'i2', investorName: 'Investor B' }, lifecycleStatus: { name: 'Commitment' }, estimatedValue: 10000000, currency: 'USD',
  },
];

// Routes apiClient.get by URL; `projects(config)` answers the list.
const mockApi = (projects = () => Promise.resolve({ data: PROJECTS })) => {
  apiClient.get.mockImplementation((url, config) => {
    if (url === '/api/projects') return projects(config);
    if (url === '/api/lifecycle-statuses') return Promise.resolve({ data: [{ name: 'Lead' }, { name: 'Commitment' }] });
    if (url === '/api/views') return Promise.resolve({ data: [] });
    if (url === '/api/users/staff') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
};
const projectCalls = () => apiClient.get.mock.calls.filter(([url]) => url === '/api/projects');
const lastProjectCall = () => projectCalls().at(-1);

let lastLocation;
const Probe = () => {
  lastLocation = useLocation();
  return null;
};
const renderAt = (url = '/projects') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/projects" element={<><ProjectListPage /><Probe /></>} />
    </Routes>
  </MemoryRouter>
);
const facetButton = (facet) => screen.getAllByRole('button', { name: new RegExp(`^${facet}`) })
  .find((b) => b.hasAttribute('aria-haspopup'));

describe('ProjectListPage', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    mockApi();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders loading state initially', async () => {
    renderAt();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
  });

  it('renders projects in a table with investor, stage, value with currency and jobs', async () => {
    renderAt();
    const table = await screen.findByRole('table', { name: 'Projects' });
    expect(within(table).getByRole('link', { name: 'Project Alpha' })).toHaveAttribute('href', '/projects/1');
    expect(within(table).getByRole('link', { name: 'Investor A' })).toHaveAttribute('href', '/investors/i1');
    expect(within(table).getByText('₦2,500,000,000')).toBeInTheDocument();
    expect(within(table).getByText('US$10,000,000')).toBeInTheDocument();
    expect(within(table).getByText('120')).toBeInTheDocument();
    expect(within(table).getAllByText('Commitment').length).toBeGreaterThan(0);
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects');
    expect(screen.getByText('2 of 2 projects')).toBeInTheDocument();
  });

  it('renders projects filtered by lifecycleStatus from URL', async () => {
    renderAt('/projects?lifecycleStatus=Lead');
    await screen.findByText('Project Alpha');
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects', { params: { lifecycleStatus: 'Lead' } });
    expect(screen.getByText('Status: Lead')).toBeInTheDocument();
  });

  it('renders no projects message if none are found', async () => {
    mockApi(() => Promise.resolve({ data: [] }));
    renderAt();
    expect(await screen.findByText('No projects found.')).toBeInTheDocument();
  });

  it('renders an error with Retry if fetching fails', async () => {
    let calls = 0;
    mockApi(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: PROJECTS });
    });
    renderAt();
    expect(await screen.findByText('Failed to fetch projects.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Project Alpha')).toBeInTheDocument();
  });
});

describe('ProjectListPage — sector filter from the URL (11.14)', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    mockApi(() => Promise.resolve({ data: [PROJECTS[0]] }));
  });

  it('passes sector (and lifecycleStatus) to the API and shows removable chips', async () => {
    renderAt('/projects?sector=Real+estate+and+construction&lifecycleStatus=Lead');
    await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects', { params: { lifecycleStatus: 'Lead', sector: 'Real estate and construction' } });
    expect(screen.getByText('Sector: Real estate and construction')).toBeInTheDocument();
    expect(screen.getByText('Status: Lead')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Sector: Real estate and construction' }));
    await waitFor(() => expect(lastProjectCall()).toEqual(['/api/projects', { params: { lifecycleStatus: 'Lead' } }]));
    expect(screen.queryByText('Sector: Real estate and construction')).not.toBeInTheDocument();
  });

  it('a sector not on the list is ignored', async () => {
    renderAt('/projects?sector=Farming&currency=XYZ&investor=nope');
    await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());
    expect(projectCalls()).toEqual([['/api/projects']]);
    expect(screen.queryByText(/^Sector:/)).not.toBeInTheDocument();
  });

  it('a 400 from the server shows its message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApi(() => Promise.reject({ response: { status: 400, data: { message: 'Invalid sector filter.' } } }));
    renderAt('/projects?sector=Agribusiness');
    expect(await screen.findByText(/Invalid sector filter./)).toBeInTheDocument();
  });
});

describe('ProjectListPage — 11.15 filters, sort and export', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    mockApi((config) => Promise.resolve({ data: config?.params?.hasJobs ? [PROJECTS[0]] : PROJECTS, headers: { 'x-total-count': '183' } }));
  });

  it('dashboard jobs click-through: /projects?hasJobs=1&organisationType=Investor', async () => {
    renderAt('/projects?hasJobs=1&organisationType=Investor');
    expect(await screen.findByText('1 of 183 projects')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects', { params: { hasJobs: '1', organisationType: 'Investor' } });
    expect(screen.getByRole('button', { name: 'Remove With jobs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'With jobs' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the "With a value" tab, a currency facet, the investor chip and search are sent', async () => {
    renderAt('/projects?investor=aaaaaaaaaaaaaaaaaaaaaaaa');
    await screen.findByText('Project Alpha');
    expect(screen.getByText('Investor: Investor')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'With a value' }));
    await waitFor(() => expect(lastProjectCall()).toEqual(['/api/projects', { params: { hasValue: '1' } }]));
    await userEvent.click(facetButton('Currency'));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'USD' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'NGN' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(lastProjectCall()).toEqual(['/api/projects', { params: { currency: ['USD', 'NGN'], hasValue: '1' } }]));
    await userEvent.type(screen.getByLabelText('Search projects'), 'alp');
    await waitFor(() => expect(lastProjectCall()).toEqual(['/api/projects', { params: { q: 'alp', currency: ['USD', 'NGN'], hasValue: '1' } }]));
  }, 20000);

  it('sorting by value asks the server and is kept in the URL', async () => {
    renderAt('/projects');
    await screen.findByText('Project Alpha');
    const header = screen.getByRole('columnheader', { name: 'Value' });
    await userEvent.click(within(header).getByRole('button'));
    await waitFor(() => expect(lastProjectCall()).toEqual(['/api/projects', { params: { sort: 'value' } }]));
    expect(new URLSearchParams(lastLocation.search).get('sort')).toBe('value');
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('Export this view sends the current filters', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const base = apiClient.get.getMockImplementation();
    apiClient.get.mockImplementation((url, config) => (url === '/api/export/projects'
      ? Promise.resolve({ data: new Blob(['x'], { type: 'text/csv' }), headers: {} })
      : base(url, config)));
    renderAt('/projects?hasValue=1&organisationType=Investor');
    await screen.findByText('Project Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Export this view (CSV)' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/export/projects', {
      params: { hasValue: '1', organisationType: 'Investor' },
      responseType: 'blob',
    }));
  });
});
