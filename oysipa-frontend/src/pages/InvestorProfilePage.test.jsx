import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import InvestorProfilePage from './InvestorProfilePage';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const investor = { _id: 'inv1', investorName: 'Acme Ltd', email: 'a@acme.test', assignedTo: null };

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

// tab: opens the page on that tab (?tab=), as a link or a refresh would.
const renderPage = (tab) => render(
  <MemoryRouter initialEntries={[`/investors/inv1${tab ? `?tab=${tab}` : ''}`]}>
    <Routes>
      <Route path="/investors/:id" element={<><InvestorProfilePage /><LocationProbe /></>} />
    </Routes>
  </MemoryRouter>
);
const findTitle = () => screen.findByRole('heading', { level: 1, name: 'Acme Ltd' });
// The value of one key fact (its dt's dd).
const fact = (label) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

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

    expect(await findTitle()).toBeInTheDocument();
    expect(screen.queryByText('Assign Staff')).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/users/staff');
  });

  it.each(['Director-General', 'Portal-Admin'])('is shown for %s', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await findTitle()).toBeInTheDocument();
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

  it('Staff sees Edit, Add New Project and + Log interaction on an investor assigned to them', async () => {
    mockInvestor({ _id: 'u1', name: 'Me' });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await findTitle()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Log interaction' })).toBeInTheDocument();
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
    renderPage('interactions');

    expect(await screen.findByText('No interactions logged for this investor yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Log interaction' }));
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
    renderPage('interactions');

    expect(await screen.findByRole('heading', { name: 'Interactions' })).toBeInTheDocument();
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
    renderPage('interactions');

    expect(await findTitle()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add New Project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Log interaction' })).not.toBeInTheDocument();
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tag services' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s always sees the write buttons', async (role) => {
    mockInvestor({ _id: 'u2', name: 'Other' });
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await findTitle()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Log interaction' })).toBeInTheDocument();
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
    renderPage('interactions');
    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s sees a Delete button per interaction', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderPage('interactions');
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
    await findTitle();
    expect(fact('Lead source')).toHaveTextContent(/^Intermediary referral$/);
    expect(fact('Lead source detail')).toHaveTextContent(/^Synthetic forum$/);
    expect(fact('Organisation type')).toHaveTextContent(/^Investor$/);
    expect(within(fact('Referred by')).getByRole('link', { name: 'NIPC Synthetic' })).toHaveAttribute('href', '/investors/nipc');
    expect(fact('Website')).toHaveTextContent(/^https:\/\/acme\.example\.test$/);
    expect(fact('Head office')).toHaveTextContent(/^Ibadan$/);
    expect(within(screen.getByRole('region', { name: 'Notes' })).getByText('Synthetic note')).toBeInTheDocument();
  });

  it('shows sector and country details when present (11.14)', async () => {
    const detailed = {
      ...investor, sector: 'Agribusiness', sectorDetail: 'Intermediary (agritech)', countryOfOrigin: 'Nigeria', countryDetail: 'Nigeria Sovereign Investment Authority',
    };
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? detailed : [] }));
    renderPage();
    await findTitle();
    expect(fact('Sector')).toHaveTextContent(/^Agribusiness$/);
    expect(fact('Sector detail')).toHaveTextContent(/^Intermediary \(agritech\)$/);
    expect(fact('Country of origin')).toHaveTextContent(/^Nigeria$/);
    expect(fact('Recorded as')).toHaveTextContent(/^Nigeria Sovereign Investment Authority$/);
  });

  it('old records show "Unknown (pre-T11)" and Investor', async () => {
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? investor : [] }));
    renderPage();
    await findTitle();
    expect(fact('Lead source')).toHaveTextContent(/^Unknown \(pre-T11\)$/);
    expect(fact('Organisation type')).toHaveTextContent(/^Investor$/);
  });

  it('an imported record with no first contact date shows "Not recorded"', async () => {
    const imported = { ...investor, importBatchId: 'b1', createdAt: '2026-10-23T10:00:00.000Z' };
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? imported : [] }));
    renderPage();
    await findTitle();
    expect(fact('First contact')).toHaveTextContent(/^Not recorded$/);
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

  it("lists the investor's issues with a link, category and status badge", async () => {
    mockData({ issueList: issues });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('issues');

    expect(await screen.findByRole('heading', { name: 'Issues' })).toBeInTheDocument();
    const list = await screen.findByRole('table', { name: 'Investor issues' });
    const link = within(list).getByRole('link', { name: 'land/title' });
    expect(link).toHaveAttribute('href', '/issues/iss1');
    expect(within(list).getByRole('link', { name: 'tax/levies' })).toHaveAttribute('href', '/issues/iss2');
    expect(within(list).getByText('Open')).toHaveAttribute('data-tone', 'warning');
    expect(within(list).getByText('Resolved')).toHaveAttribute('data-tone', 'success');
    expect(within(list).getByRole('columnheader', { name: 'Reported' })).toBeInTheDocument();
    // One reported date per issue.
    const dataRows = within(list).getAllByRole('row').slice(1);
    expect(dataRows).toHaveLength(2);
    dataRows.forEach((row) => expect(within(row).getByText(/2026/)).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/api/issues', { params: { investor: 'inv1' } });
    expect(screen.queryByText('No issues registered for this investor.')).not.toBeInTheDocument();
  });

  it('shows the issue reference in the link (11.7b)', async () => {
    mockData({ issueList: [{ ...issues[0], reference: 'ISS-09' }] });
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    renderPage('issues');
    const list = await screen.findByRole('table', { name: 'Investor issues' });
    expect(within(list).getByRole('link', { name: 'ISS-09 · land/title' })).toHaveAttribute('href', '/issues/iss1');
  });

  it('shows the empty state when the investor has no issues', async () => {
    mockData();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('issues');

    expect(await screen.findByText('No issues registered for this investor.')).toBeInTheDocument();
  });

  it('Register issue is shown for Staff on an investor assigned to them', async () => {
    mockData({ assignedTo: { _id: 'u1', name: 'Me' } });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await findTitle()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register issue' })).toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('Register issue is shown for %s', async (role) => {
    mockData();
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await findTitle()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register issue' })).toBeInTheDocument();
  });

  it('Register issue is hidden for Staff on an investor not assigned to them (list still shown)', async () => {
    mockData({ assignedTo: { _id: 'someone-else', name: 'Other' }, issueList: issues });
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage('issues');

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
    renderPage('issues');

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
    expect(await screen.findByRole('link', { name: 'security' }, { timeout: 5000 })).toHaveAttribute('href', '/issues/iss9');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 20000);
});

describe('InvestorProfilePage — redesign (11.16)', () => {
  const projects = [
    {
      _id: 'p1', projectTitle: 'Synthetic Starch Plant', estimatedValue: 2000000000, currency: 'NGN', estimatedNumberOfJobs: 120, location: 'Iseyin', lifecycleStatus: { name: 'Planning' }, createdAt: '2026-02-01T10:00:00.000Z',
    },
    {
      _id: 'p2', projectTitle: 'Synthetic Feed Mill', estimatedValue: 1000000, currency: 'USD', estimatedNumberOfJobs: 30, location: 'Ogbomoso', lifecycleStatus: { name: 'Execution' }, createdAt: '2026-05-01T10:00:00.000Z',
    },
  ];
  const logs = [
    {
      _id: 'l1', description: 'Synthetic site visit', category: 'Site Visit', serviceCodes: ['A7'], interactionDate: '2026-10-12T00:00:00.000Z', createdAt: '2026-10-12T10:00:00.000Z', loggedBy: { name: 'Officer A' },
      documents: [{ _id: 'd1', fileName: 'site-photos.pdf', uploadedAt: '2026-10-12T11:00:00.000Z' }],
    },
    {
      _id: 'l2', description: 'Lifecycle status changed from "Idea" to "Planning"', category: 'System Update', project: { _id: 'p1', projectTitle: 'Synthetic Starch Plant' }, interactionDate: '2026-09-19T00:00:00.000Z', createdAt: '2026-09-19T10:00:00.000Z', loggedBy: { name: 'Officer A' },
    },
  ];
  const issueList = [
    { _id: 'iss1', reference: 'ISS-09', category: 'land/title', status: 'Open', description: 'Synthetic title delay', dateReported: '2026-10-03T00:00:00.000Z', createdAt: '2026-10-03T10:00:00.000Z' },
  ];
  const announcementList = [
    { _id: 'a1', outlet: 'Synthetic Daily', oysipaNamed: true, announcementDate: '2026-09-02T00:00:00.000Z', createdAt: '2026-09-02T10:00:00.000Z', project: { _id: 'p1', projectTitle: 'Synthetic Starch Plant' } },
  ];
  const fillGaps = {
    year: null,
    investor: 'inv1',
    summary: { checked: 2, complete: 0 },
    groups: [{ investor: { id: 'inv1' }, missing: ['T8b'], projects: [{ id: 'p1', missing: ['T8b'] }, { id: 'p2', missing: ['T5', 'T8b'] }] }],
  };
  const fx = { latest: { USD: { rate: 1500, asOf: '2026-10-01' } } };
  const library = [
    { _id: 'f1', fileName: 'tagged-letter.pdf', uploadedAt: '2026-08-01T10:00:00.000Z', folder: { name: 'Letters' }, links: [{ _id: 'k1', investor: { _id: 'inv1', investorName: 'Acme Ltd' } }] },
    { _id: 'f2', fileName: 'other-investor.pdf', uploadedAt: '2026-08-01T10:00:00.000Z', links: [{ _id: 'k2', investor: { _id: 'inv2', investorName: 'Other' } }] },
  ];
  const changeRows = {
    inv1: [{ _id: 'c1', createdAt: '2026-10-20T10:00:00.000Z', byName: 'DG Synthetic', role: 'Director-General', entity: 'Investor', entityId: 'inv1', action: 'update', changes: [{ field: 'phoneNumber', old: null, new: '+2340000000' }] }],
    p1: [{ _id: 'c2', createdAt: '2026-10-21T10:00:00.000Z', byName: 'Officer A', role: 'Staff', entity: 'InvestmentProject', entityId: 'p1', action: 'update', changes: [{ field: 'location', old: '', new: 'Iseyin' }] }],
    p2: [],
  };

  // extra(url, config): a response (or a rejected promise) that wins over the defaults.
  const mockAll = ({ inv = investor, fill = fillGaps, extra } = {}) => {
    apiClient.get.mockImplementation((url, config) => {
      const own = extra && extra(url, config);
      if (own) return own;
      if (url === '/api/investors/inv1') return Promise.resolve({ data: { ...inv, assignedTo: { _id: 'u1', name: 'Officer A' } } });
      if (url === '/api/projects/investors/inv1/projects') return Promise.resolve({ data: projects });
      if (url === '/api/interactions/investors/inv1') return Promise.resolve({ data: logs });
      if (url === '/api/issues' && config?.params?.investor === 'inv1') return Promise.resolve({ data: issueList });
      if (url === '/api/announcements' && config?.params?.project === 'p1,p2') return Promise.resolve({ data: announcementList });
      if (url === '/api/fill-gaps') return Promise.resolve({ data: fill });
      if (url === '/api/fx-rates') return Promise.resolve({ data: fx });
      if (url === '/api/evidence/files') return Promise.resolve({ data: library });
      if (url === '/api/changelog') {
        const rows = changeRows[config?.params?.entityId] || [];
        return Promise.resolve({ data: { rows, total: rows.length, page: 1, pageSize: 50 } });
      }
      return Promise.resolve({ data: [] });
    });
  };

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => localStorage.removeItem('token'));

  it('DG: breadcrumb, initials, badges, six figures and seven tabs', async () => {
    mockAll();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Investors' })).toHaveAttribute('href', '/investors');
    expect(screen.getByText('AL')).toBeInTheDocument();
    // Stage = the latest project's status.
    const tags = screen.getByRole('list', { name: 'Investor tags' });
    expect(await within(tags).findByText('Execution')).toBeInTheDocument();
    expect(within(tags).getByText('Investor')).toBeInTheDocument();
    const figures = screen.getByRole('list', { name: 'Investor figures' });
    // ₦2bn + US$1m at ₦1,500 = ₦3.5bn, as the dashboard works it out.
    expect(await within(figures).findByText('₦3.5bn')).toBeInTheDocument();
    ['Projects', 'Pipeline value', 'Jobs pledged', 'Interactions', 'Open issues', 'Announcements'].forEach((label) => {
      expect(within(figures).getByText(label)).toBeInTheDocument();
    });
    expect(within(figures).getByText('150')).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Investor sections' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent.replace(/\s*\d+$/, ''))).toEqual(['Overview', 'Projects', 'Interactions', 'Issues', 'Announcements', 'Files', 'History']);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Staff not assigned: no Edit / Log / Register actions and no History tab', async () => {
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? investor : [] }));
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage('history');
    await findTitle();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Log interaction' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register issue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /History/ })).not.toBeInTheDocument();
    // ?tab=history is not theirs: Overview opens and the change log is never asked.
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/changelog', expect.anything());
  });

  it('the tab is kept in the URL: ?tab=issues opens Issues; clicking a tab updates it; unknown → Overview', async () => {
    mockAll();
    localStorage.setItem('token', tokenFor('Director-General'));
    const { unmount } = renderPage('issues');
    expect(await screen.findByRole('table', { name: 'Investor issues' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Issues/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /^Announcements/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/investors/inv1?tab=announcements');
    expect(await screen.findByRole('link', { name: 'Synthetic Daily' })).toHaveAttribute('href', '/announcements/a1');
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByTestId('location').textContent).toBe('/investors/inv1');
    unmount();

    renderPage('nonsense');
    await findTitle();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Overview: activity newest first, projects, completeness with the missing fields and Fill the gaps', async () => {
    mockAll();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    const activity = await screen.findByRole('list', { name: 'Activity' });
    await waitFor(() => expect(within(activity).getAllByRole('listitem')).toHaveLength(4));
    const items = within(activity).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/^Site Visit/);
    expect(items[1]).toMatch(/^Issue registered: ISS-09/);
    expect(items[2]).toMatch(/^Stage changed/);
    expect(items[3]).toMatch(/^Public announcement/);
    expect(within(activity).getByRole('link', { name: 'Issue registered: ISS-09' })).toHaveAttribute('href', '/issues/iss1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/fill-gaps', { params: { year: 'all', investor: 'inv1' } });
    const panel = screen.getByRole('region', { name: 'Record completeness (T1–T11)' });
    expect(await within(panel).findByText('9 of 11 fields complete')).toBeInTheDocument();
    const missing = within(panel).getByRole('list', { name: 'Missing fields' });
    expect(within(missing).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['T5 estimated value', 'T8 phone']);
    expect(within(panel).getByRole('link', { name: 'Fill the gaps' })).toHaveAttribute('href', '/fill-gaps?year=all&officer=all&investor=inv1');

    const projectsPanel = screen.getByRole('region', { name: 'Projects' });
    expect(within(projectsPanel).getByRole('link', { name: 'Synthetic Starch Plant' })).toHaveAttribute('href', '/projects/p1');
    expect(within(projectsPanel).getByText('Iseyin · 120 jobs')).toBeInTheDocument();
  });

  it('a complete record: 11 of 11, no Fill the gaps link', async () => {
    mockAll({ fill: { summary: { checked: 2, complete: 2 }, groups: [] } });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Record completeness (T1–T11)' });
    expect(await within(panel).findByText('11 of 11 fields complete')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Fill the gaps' })).not.toBeInTheDocument();
  });

  it('an Intermediary: completeness not applicable, no pipeline figures, no fill-gaps request', async () => {
    mockAll({ inv: { ...investor, organisationType: 'Intermediary' } });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    const panel = screen.getByRole('region', { name: 'Record completeness (T1–T11)' });
    expect(within(panel).getByText(/Not applicable/)).toBeInTheDocument();
    const figures = screen.getByRole('list', { name: 'Investor figures' });
    expect(within(figures).queryByText('Pipeline value')).not.toBeInTheDocument();
    expect(within(figures).queryByText('Jobs pledged')).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/fill-gaps', expect.anything());
  });

  it('no projects: empty states in the Projects tab and the figures', async () => {
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/investors/inv1' ? investor : [] }));
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('projects');
    expect(await screen.findByText('No projects found for this investor.')).toBeInTheDocument();
    const figures = screen.getByRole('list', { name: 'Investor figures' });
    expect(within(figures).getByText('no project values yet')).toBeInTheDocument();
  });

  it('Files: interaction documents and the library files tagged to this investor only', async () => {
    mockAll();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('files');
    const docs = await screen.findByRole('table', { name: 'Interaction documents' });
    expect(await within(docs).findByText('site-photos.pdf')).toBeInTheDocument();
    expect(within(docs).getByRole('button', { name: 'View site-photos.pdf' })).toBeInTheDocument();
    const lib = screen.getByRole('table', { name: 'Library files' });
    expect(await within(lib).findByText('tagged-letter.pdf')).toBeInTheDocument();
    expect(within(lib).queryByText('other-investor.pdf')).not.toBeInTheDocument();
  });

  it('History (DG): the change log of the investor and each project, newest first', async () => {
    mockAll();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('history');
    const table = await screen.findByRole('table', { name: 'Investor history' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    ['inv1', 'p1', 'p2'].forEach((entityId) => expect(apiClient.get).toHaveBeenCalledWith('/api/changelog', { params: { entityId, page: 1 } }));
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Synthetic Starch Plant')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in the change log' })).toHaveAttribute('href', '/changelog?entityId=inv1');
  });

  // ---------- review fixes (11.16 review triage) ----------
  const fillGapsCalls = () => apiClient.get.mock.calls.filter(([url]) => url === '/api/fill-gaps').length;
  const figure = (label) => within(screen.getByRole('list', { name: 'Investor figures' })).getByText(label).parentElement;

  it('the Fill the gaps link opens the worklist for this investor (investor=<id>)', async () => {
    mockAll();
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Record completeness (T1–T11)' });
    expect(await within(panel).findByRole('link', { name: 'Fill the gaps' })).toHaveAttribute('href', '/fill-gaps?year=all&officer=all&investor=inv1');
  });

  it('saving the edit, project and interaction forms re-checks completeness', async () => {
    mockAll();
    apiClient.put.mockResolvedValue({ data: {} });
    apiClient.post.mockResolvedValue({ data: { _id: 'new' } });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    await waitFor(() => expect(fillGapsCalls()).toBeGreaterThan(0));

    let before = fillGapsCalls();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(fillGapsCalls()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    before = fillGapsCalls();
    fireEvent.click(screen.getByRole('button', { name: 'Add New Project' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fillGapsCalls()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    before = fillGapsCalls();
    await userEvent.click(screen.getByRole('button', { name: '+ Log interaction' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Synthetic follow-up' } });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Email' }));
    await userEvent.click(within(dialog).getByText('Save Log'));
    await waitFor(() => expect(fillGapsCalls()).toBeGreaterThan(before));
  }, 30000);

  it('Interactions tab: a confirmed delete removes the row, the count drops and completeness is re-checked', async () => {
    mockAll();
    apiClient.delete.mockResolvedValue({ data: {} });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('interactions');
    expect(await screen.findByText('Synthetic site visit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Interactions/ })).toHaveTextContent(/Interactions\s*2$/);
    const before = fillGapsCalls();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(screen.queryByText('Synthetic site visit')).not.toBeInTheDocument());
    expect(apiClient.delete).toHaveBeenCalledWith('/api/interactions/l1', undefined);
    expect(screen.getByRole('tab', { name: /^Interactions/ })).toHaveTextContent(/Interactions\s*1$/);
    expect(within(figure('Interactions')).getByText('1')).toBeInTheDocument();
    await waitFor(() => expect(fillGapsCalls()).toBeGreaterThan(before));
  });

  it('Interactions tab: Tag services save changes the code chips', async () => {
    mockAll();
    apiClient.patch.mockResolvedValue({ data: { ...logs[0], serviceCodes: ['M2'], updatedAt: '2026-10-28T10:00:00.000Z' } });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('interactions');
    expect(await screen.findByText('A7')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Tag services' })[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save tags' }));
    expect(await screen.findByText('M2')).toBeInTheDocument();
    expect(screen.queryByText('A7')).not.toBeInTheDocument();
    expect(apiClient.patch).toHaveBeenCalledWith('/api/interactions/l1', expect.objectContaining({ serviceCodes: ['A7'] }));
  });

  it('opening another investor (Referred by) shows only the new investor\'s data', async () => {
    const other = { _id: 'inv2', investorName: 'Tower Synthetic', assignedTo: null };
    mockAll({
      inv: { ...investor, referredBy: { _id: 'inv2', investorName: 'Tower Synthetic' } },
      extra: (url) => {
        if (url === '/api/investors/inv2') return Promise.resolve({ data: other });
        if (url.includes('inv2') || url === '/api/fill-gaps') return Promise.resolve({ data: url === '/api/fill-gaps' ? { summary: { checked: 0, complete: 0 }, groups: [] } : [] });
        return null;
      },
    });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    expect(await screen.findByRole('tab', { name: /^Issues\s*1$/ })).toBeInTheDocument();
    fireEvent.click(within(fact('Referred by')).getByRole('link', { name: 'Tower Synthetic' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tower Synthetic' })).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/investors/inv2');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Issues/ })).toHaveTextContent(/Issues\s*0$/));
    expect(screen.queryByText('Synthetic Starch Plant')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Activity' })).not.toBeInTheDocument();
  });

  it('issues and announcements: "…" while loading, "—" after a failed load', async () => {
    mockAll({
      extra: (url) => {
        if (url === '/api/issues') return new Promise(() => {});
        if (url === '/api/announcements') return Promise.reject(new Error('down'));
        return null;
      },
    });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    expect(within(figure('Open issues')).getByText('…')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Issues/ })).toHaveTextContent(/Issues\s*…$/);
    await waitFor(() => expect(within(figure('Announcements')).getByText('—')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /^Announcements/ })).toHaveTextContent(/Announcements\s*—$/);
  });

  it('a failed issues load: "—" in the figure and the tab, the error in the Issues tab', async () => {
    mockAll({ extra: (url) => (url === '/api/issues' ? Promise.reject(new Error('down')) : null) });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('issues');
    expect(await screen.findByText('Could not load the issues for this investor.')).toBeInTheDocument();
    expect(within(figure('Open issues')).getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Issues/ })).toHaveTextContent(/Issues\s*—$/);
  });

  it('exchange rates fail: NGN only, "rates not available"', async () => {
    mockAll({ extra: (url) => (url === '/api/fx-rates' ? Promise.reject(new Error('down')) : null) });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    expect(await within(figure('Pipeline value')).findByText('NGN only: rates not available')).toBeInTheDocument();
    expect(within(figure('Pipeline value')).getByText('₦2bn')).toBeInTheDocument();
  });

  it('every valued project in "Other": pipeline value — with the reason', async () => {
    mockAll({
      extra: (url) => (url === '/api/projects/investors/inv1/projects'
        ? Promise.resolve({ data: [{ ...projects[0], currency: 'Other' }] })
        : null),
    });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await findTitle();
    expect(await within(figure('Pipeline value')).findByText('Other currency left out of the ₦ total')).toBeInTheDocument();
    expect(within(figure('Pipeline value')).getByText('—')).toBeInTheDocument();
  });

  it('History: one failed record still shows the others\' rows and a partial notice', async () => {
    mockAll({
      extra: (url, config) => (url === '/api/changelog' && config?.params?.entityId === 'p1' ? Promise.reject(new Error('down')) : null),
    });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage('history');
    expect(await screen.findByText('The history of 1 record could not be loaded. The rows below are partial.')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Investor history' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Acme Ltd')).toBeInTheDocument();
  });

  it('timeline: a repeated service code shows once', async () => {
    mockAll({
      extra: (url) => (url === '/api/interactions/investors/inv1'
        ? Promise.resolve({ data: [{ ...logs[0], serviceCodes: ['M2', 'A1', 'M2'] }] })
        : null),
    });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    const activity = await screen.findByRole('list', { name: 'Activity' });
    await within(activity).findByText('A1');
    expect(within(activity).getAllByText('M2')).toHaveLength(1);
  });
});
