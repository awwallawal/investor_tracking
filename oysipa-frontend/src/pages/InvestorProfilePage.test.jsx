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

describe('InvestorProfilePage — T11 and import fields (11.5)', () => {
  afterEach(() => localStorage.removeItem('token'));

  it('shows lead source, detail, type, referred by, website, head office and notes', async () => {
    const full = {
      ...investor,
      leadSource: 'Intermediary referral',
      leadSourceDetail: 'Synthetic forum',
      organisationType: 'Investor',
      referredBy: { _id: 'nipc', investorName: 'NIPC Synthetic' },
      website: 'https://acme.example.test',
      headOffice: 'Ibadan',
      notes: 'Synthetic note',
    };
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? full : [] }));
    renderPage();
    expect(await screen.findByText('Lead source: Intermediary referral')).toBeInTheDocument();
    expect(screen.getByText('Lead source detail: Synthetic forum')).toBeInTheDocument();
    expect(screen.getByText('Organisation type: Investor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NIPC Synthetic' })).toHaveAttribute('href', '/investors/nipc');
    expect(screen.getByText('Website: https://acme.example.test')).toBeInTheDocument();
    expect(screen.getByText('Head office: Ibadan')).toBeInTheDocument();
    expect(screen.getByText(/Notes: Synthetic note/)).toBeInTheDocument();
  });

  it('old records show "Unknown (pre-T11)" and Investor', async () => {
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? investor : [] }));
    renderPage();
    expect(await screen.findByText('Lead source: Unknown (pre-T11)')).toBeInTheDocument();
    expect(screen.getByText('Organisation type: Investor')).toBeInTheDocument();
  });

  it('an imported record with no first contact date shows "Not recorded"', async () => {
    const imported = { ...investor, importBatchId: 'b1', createdAt: '2026-10-23T10:00:00.000Z' };
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? imported : [] }));
    renderPage();
    expect(await screen.findByText('First contact: Not recorded')).toBeInTheDocument();
  });
});

describe('InvestorProfilePage — Issues section (11.7)', () => {
  const issues = [
    { _id: 'iss1', category: 'land/title', status: 'Open', dateReported: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-02T10:00:00.000Z' },
    { _id: 'iss2', category: 'tax/levies', status: 'Resolved', dateReported: '2026-08-10T00:00:00.000Z', createdAt: '2026-08-10T10:00:00.000Z' },
  ];

  const mockData = ({ assignedTo = null, issueList = [] } = {}) => {
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: { ...investor, assignedTo } });
      if (url === '/api/issues' && config?.params?.investor === 'inv1') return Promise.resolve({ data: issueList });
      return Promise.resolve({ data: [] });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it("lists the investor's issues with a link, category and status chip", async () => {
    mockData({ issueList: issues });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Issues' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Investor issues' });
    const link = within(list).getByRole('link', { name: 'land/title' });
    expect(link).toHaveAttribute('href', '/issues/iss1');
    expect(within(list).getByRole('link', { name: 'tax/levies' })).toHaveAttribute('href', '/issues/iss2');
    expect(within(list).getByText('Open')).toBeInTheDocument();
    expect(within(list).getByText('Resolved')).toBeInTheDocument();
    expect(within(list).getAllByText(/^Reported: /)).toHaveLength(2);
    expect(apiClient.get).toHaveBeenCalledWith('/api/issues', { params: { investor: 'inv1' } });
    expect(screen.queryByText('No issues registered for this investor.')).not.toBeInTheDocument();
  });

  it('shows the issue reference in the link (11.7b)', async () => {
    mockData({ issueList: [{ ...issues[0], reference: 'ISS-09' }] });
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    renderPage();
    const list = await screen.findByRole('list', { name: 'Investor issues' });
    expect(within(list).getByRole('link', { name: 'ISS-09 · land/title' })).toHaveAttribute('href', '/issues/iss1');
  });

  it('shows the empty state when the investor has no issues', async () => {
    mockData();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();

    expect(await screen.findByText('No issues registered for this investor.')).toBeInTheDocument();
  });

  it('Register issue is shown for Staff on an investor assigned to them', async () => {
    mockData({ assignedTo: { _id: 'u1', name: 'Me' } });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register issue' })).toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('Register issue is shown for %s', async (role) => {
    mockData();
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register issue' })).toBeInTheDocument();
  });

  it('Register issue is hidden for Staff on an investor not assigned to them (list still shown)', async () => {
    mockData({ assignedTo: { _id: 'someone-else', name: 'Other' }, issueList: issues });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByRole('link', { name: 'land/title' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register issue' })).not.toBeInTheDocument();
  });

  it('Register issue opens the form with the investor fixed and refreshes the list after save', async () => {
    let current = [];
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: { ...investor, assignedTo: { _id: 'u1', name: 'Me' } } });
      if (url === '/api/issues' && config?.params?.investor === 'inv1') return Promise.resolve({ data: current });
      return Promise.resolve({ data: [] });
    });
    apiClient.post.mockImplementation((url, body) => {
      current = [{ _id: 'iss9', ...body, status: 'Open', dateReported: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-20T10:00:00.000Z' }];
      return Promise.resolve({ data: current[0] });
    });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('No issues registered for this investor.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Register issue' }));
    const dialog = await screen.findByRole('dialog');
    // investorId is fixed: no investor picker and no investor list fetch.
    expect(within(dialog).queryByLabelText(/^Investor/)).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/investors');

    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /Category/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'security' }));
    fireEvent.change(within(dialog).getByLabelText(/Description/), { target: { value: 'Synthetic access road blocked' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/issues', expect.objectContaining({
      investor: 'inv1', category: 'security', description: 'Synthetic access road blocked',
    })));
    expect(await screen.findByRole('link', { name: 'security' })).toHaveAttribute('href', '/issues/iss9');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 20000);
});
