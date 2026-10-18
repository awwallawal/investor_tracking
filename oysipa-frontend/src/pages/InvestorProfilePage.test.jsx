import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InvestorProfilePage from './InvestorProfilePage';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const investor = { _id: 'inv1', investorName: 'Acme Ltd', email: 'a@acme.test', assignedTo: null };

const renderPage = () => render(
  <MemoryRouter initialEntries={['/investors/inv1']}>
    <Routes>
      <Route path="/investors/:id" element={<InvestorProfilePage />} />
    </Routes>
  </MemoryRouter>
);

describe('InvestorProfilePage — Assign Staff dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: investor });
      if (url === '/api/projects/investors/inv1/projects') return Promise.resolve({ data: [] });
      if (url === '/api/interactions/investors/inv1') return Promise.resolve({ data: [] });
      if (url === '/api/users/staff') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('is hidden for Staff and the staff list is not requested', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.queryByText('Assign Staff')).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/users/staff');
  });

  it.each(['Director-General', 'Portal-Admin'])('is shown for %s', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/users/staff'));
    expect(screen.getAllByText('Assign Staff').length).toBeGreaterThan(0);
  });
});

describe('InvestorProfilePage — write buttons', () => {
  const timeline = [
    { _id: 'l1', description: 'Briefing letter sent to NIPC', category: 'Email', serviceCodes: ['M4'], creditLinkage: false, loggedBy: { name: 'Me' }, createdAt: '2026-10-18T10:00:00.000Z' },
    { _id: 'l2', description: 'Old meeting', category: 'Meeting', project: { _id: 'p1', projectTitle: 'Agro Hub' }, loggedBy: { name: 'Me' }, createdAt: '2026-01-01T10:00:00.000Z' },
  ];

  const mockInvestor = (assignedTo) => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: { ...investor, assignedTo } });
      if (url === '/api/interactions/investors/inv1') return Promise.resolve({ data: timeline });
      return Promise.resolve({ data: [] });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('Staff sees Edit Investor and Add New Project on an investor assigned to them', async () => {
    mockInvestor({ _id: 'u1', name: 'Me' });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Investor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log Interaction' })).toBeInTheDocument();
    expect(screen.queryByText('Assign Staff')).not.toBeInTheDocument();
  });

  it('saving a new interaction refreshes the timeline', async () => {
    let current = [];
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: { ...investor, assignedTo: { _id: 'u1', name: 'Me' } } });
      if (url === '/api/interactions/investors/inv1') return Promise.resolve({ data: current });
      return Promise.resolve({ data: [] });
    });
    apiClient.post.mockImplementation(() => {
      current = [{ _id: 'n1', description: 'Briefing letter sent to NIPC', category: 'Email', serviceCodes: [], loggedBy: { name: 'Me' }, createdAt: '2026-10-18T10:00:00.000Z' }];
      return Promise.resolve({ data: current[0] });
    });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('No interactions logged for this investor yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log Interaction' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Briefing letter sent to NIPC' } });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Email' }));
    await userEvent.click(within(dialog).getByText('Save Log'));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/interactions/investors/inv1', expect.objectContaining({ description: 'Briefing letter sent to NIPC', category: 'Email' })));
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(apiClient.get.mock.calls.filter(([url]) => url === '/api/interactions/investors/inv1').length).toBeGreaterThanOrEqual(2);
  }, 20000);

  it('shows the Interactions timeline with code chips and project titles', async () => {
    mockInvestor({ _id: 'u1', name: 'Me' });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('Interactions')).toBeInTheDocument();
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.getByText('M4')).toBeInTheDocument();
    expect(screen.getByText('Project: Agro Hub')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/interactions/investors/inv1');
    expect(screen.getAllByRole('button', { name: 'Tag services' }).length).toBe(2);
  });

  it.each([
    ['unassigned', null],
    ['assigned to other staff', { _id: 'u2', name: 'Other' }],
  ])('Staff does not see write buttons on an investor %s', async (_label, assignedTo) => {
    mockInvestor(assignedTo);
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Investor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add New Project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log Interaction' })).not.toBeInTheDocument();
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tag services' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s always sees the write buttons', async (role) => {
    mockInvestor({ _id: 'u2', name: 'Other' });
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Investor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log Interaction' })).toBeInTheDocument();
  });
});

describe('InvestorProfilePage — interaction Delete (DG/Admin only)', () => {
  const timeline = [
    { _id: 'l1', description: 'Briefing letter sent to NIPC', category: 'Email', loggedBy: { name: 'Me' }, createdAt: '2026-10-18T10:00:00.000Z' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: { ...investor, assignedTo: { _id: 'u1', name: 'Me' } } });
      if (url === '/api/interactions/investors/inv1') return Promise.resolve({ data: timeline });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('Staff (even assigned) sees no Delete button', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s sees a Delete button per interaction', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderPage();
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });
});
