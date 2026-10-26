import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { jwtDecode } from 'jwt-decode';
import StaffDashboard from './StaffDashboard';
import apiClient from '../api/api';
import { makeMine, emptyMine } from '../test/analyticsFixtures';

vi.mock('jwt-decode', () => ({ jwtDecode: vi.fn() }));
vi.mock('../api/api', () => ({ default: { get: vi.fn() } }));

const api = (mine, projects = []) => apiClient.get.mockImplementation((url) => {
  if (url === '/api/analytics/mine') return Promise.resolve({ data: mine });
  if (url === '/api/staff/dashboard') return Promise.resolve({ data: projects });
  return Promise.reject(new Error(url));
});

const renderPage = () => render(<MemoryRouter><StaffDashboard /></MemoryRouter>);

describe('Staff "My work" (11.14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('token', 'mock');
    jwtDecode.mockReturnValue({ user: { id: 'u1', name: 'Officer A', role: 'Staff' } });
  });
  afterEach(() => localStorage.clear());

  it('shows my numbers from /api/analytics/mine', async () => {
    api(makeMine());
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Officer A' })).toBeInTheDocument();
    expect(screen.getByText('You look after 12 investors. Here is what needs you today.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/analytics/mine');

    const numbers = screen.getByRole('region', { name: 'My numbers' });
    expect(within(numbers).getByText('12')).toBeInTheDocument();
    expect(within(numbers).getByText('₦4.5bn')).toBeInTheDocument();
    expect(within(numbers).getByText('across 9 projects (₦ equivalent)')).toBeInTheDocument();
    expect(within(numbers).getByText('7')).toBeInTheDocument();
    expect(within(numbers).getByText('interactions · 3 last month')).toBeInTheDocument();
    expect(within(numbers).getByText('2')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Register issue' })).toHaveAttribute('href', '/issues');
    expect(screen.getByRole('link', { name: '+ Log interaction' })).toHaveAttribute('href', '/interactions');
  });

  it('"Needs your attention" shows the five counts with links', async () => {
    api(makeMine());
    renderPage();
    await screen.findByRole('region', { name: 'Needs your attention' });
    const expectRow = (key, count, title, href) => {
      const row = screen.getByTestId(`attention-${key}`);
      expect(row).toHaveTextContent(count);
      expect(row).toHaveTextContent(title);
      expect(row).toHaveAttribute('href', href);
    };
    expectRow('noContact', '4', 'No contact in 60+ days', '/investors');
    expectRow('missingFields', '5', 'Records missing T1–T11 fields', '/investors');
    expectRow('staleIssues', '1', 'Open issues waiting on an action', '/issues');
    expect(screen.getByTestId('attention-staleIssues')).toHaveTextContent('Last action more than 14 days ago.');
    expectRow('untaggedInteractions', '6', 'Interactions without a SABER code', '/interactions');
    expectRow('untaggedFiles', '87', 'Files in the library waiting for a tag', '/evidence');
  });

  it('shows my stages, recent interactions and the state at a glance', async () => {
    api(makeMine());
    renderPage();
    const stages = await screen.findByRole('img', { name: 'My pipeline by stage: Lead 4, Commitment 5' });
    expect(within(stages).getByRole('link', { name: 'Commitment: 5' })).toHaveAttribute('href', '/projects?lifecycleStatus=Commitment');
    const recent = screen.getByRole('region', { name: 'Recent on my investors' });
    expect(within(recent).getByText('Site visit')).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: 'Sample Agro Processing Ltd' })).toHaveAttribute('href', '/investors/i1');
    expect(within(recent).getByText('12 Oct 2026 · you')).toBeInTheDocument();
    const glance = screen.getByRole('region', { name: 'Oyo State at a glance' });
    expect(glance).toHaveTextContent('177 investors · 183 projects');
    expect(glance).toHaveTextContent('₦1.26tn pipeline (₦ equivalent) · 14,957 jobs pledged');
  });

  it('with 0 assigned investors: zeros and an empty state', async () => {
    api(emptyMine());
    renderPage();
    expect(await screen.findByText('No investors assigned to you yet')).toBeInTheDocument();
    expect(screen.getByText('You look after 0 investors. Here is what needs you today.')).toBeInTheDocument();
    const numbers = screen.getByRole('region', { name: 'My numbers' });
    expect(within(numbers).getAllByText('0').length).toBeGreaterThanOrEqual(3);
    expect(within(numbers).getByText('₦0')).toBeInTheDocument();
    ['noContact', 'missingFields', 'staleIssues', 'untaggedInteractions', 'untaggedFiles'].forEach((k) => {
      expect(screen.getByTestId(`attention-${k}`)).toHaveTextContent(/^0/);
    });
    expect(screen.getByText('No projects on your investors yet.')).toBeInTheDocument();
    expect(screen.getByText('No interactions logged yet.')).toBeInTheDocument();
  });

  it('a failed /mine load still shows the assigned projects, with a warning', async () => {
    apiClient.get.mockImplementation((url) => (url === '/api/analytics/mine'
      ? Promise.reject(new Error('down'))
      : Promise.resolve({ data: [{ _id: 'p1', projectTitle: 'Project Alpha', investor: { investorName: 'A' }, lifecycleStatus: { name: 'Lead' } }] })));
    renderPage();
    expect(await screen.findByText('Could not load your numbers.')).toBeInTheDocument();
    expect(screen.getByText(/Project Alpha/)).toBeInTheDocument();
  });
});
