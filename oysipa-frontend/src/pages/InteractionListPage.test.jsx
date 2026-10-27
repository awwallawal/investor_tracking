import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InteractionListPage from './InteractionListPage';
import apiClient from '../api/api';
import * as listExport from '../api/listExport';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

let location;
let navigate;
const Probe = () => {
  location = useLocation();
  navigate = useNavigate();
  return null;
};
const renderAt = (url = '/interactions') => render(
  <MemoryRouter initialEntries={[url]}>
    <InteractionListPage />
    <Probe />
  </MemoryRouter>,
);

// GET by URL: views and staff are side requests; interactions go to `logs`.
const mockGet = (logs) => vi.spyOn(apiClient, 'get').mockImplementation((url, config) => {
  if (url === '/api/views') return Promise.resolve({ data: [] });
  if (url === '/api/users/staff') return Promise.resolve({ data: [{ _id: 'a'.repeat(24), name: 'Officer Synthetic' }] });
  return Promise.resolve(typeof logs === 'function' ? logs(url, config) : { data: logs });
});
const interactionCalls = (get) => get.mock.calls.filter(([u]) => u === '/api/interactions');

describe('InteractionListPage — dates and documents (11.4b)', () => {
  const docLog = {
    _id: 'l9', description: 'Paper meeting', category: 'Meeting', investor: { _id: 'i1', investorName: 'NIPC Contact' },
    loggedBy: { name: 'Officer' }, interactionDate: '2025-03-18T00:00:00.000Z', createdAt: '2026-10-19T09:00:00.000Z',
    documentUrl: 'https://res.cloudinary.com/demo/image/upload/a.pdf',
    documents: [{ _id: 'd1', fileName: 'scan.pdf', documentDate: '2025-03-18T00:00:00.000Z', uploadedAt: '2026-10-19T09:01:00.000Z' }],
  };

  beforeEach(() => { mockGet([docLog]); });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('shows the happened date with the recorded note, and exactly one legacy View Document link', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderAt();
    expect((await screen.findAllByText(/18 Mar 2025 · recorded 19 Oct 2026/)).length).toBeGreaterThan(0);
    const links = screen.getAllByRole('link', { name: /view document/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', docLog.documentUrl);
  });

  it('Staff sees no Attach/Remove', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderAt();
    expect(await screen.findByRole('button', { name: 'View scan.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove scan.pdf' })).not.toBeInTheDocument();
  });

  it('Director-General sees Attach and Remove', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    renderAt();
    expect(await screen.findByRole('button', { name: 'Attach document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove scan.pdf' })).toBeInTheDocument();
  });
});

describe('InteractionListPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('falls back to the investor name for logs without a project, and shows code and credit chips', async () => {
    const get = mockGet([
      {
        _id: 'l1', description: 'Briefing letter sent to NIPC', category: 'Email', investor: { _id: 'i1', investorName: 'NIPC Contact' },
        serviceCodes: ['M4', 'A8'], creditLinkage: true, loggedBy: { name: 'Officer' }, createdAt: '2026-10-18T10:00:00.000Z',
      },
      {
        _id: 'l2', description: 'Project call', category: 'Call', project: { _id: 'p1', projectTitle: 'Agro Hub' },
        loggedBy: { name: 'Officer' }, createdAt: '2026-10-17T10:00:00.000Z',
      },
    ]);
    renderAt();
    expect(await screen.findByText('NIPC Contact')).toBeInTheDocument();
    expect(screen.getByText(/- Briefing letter sent to NIPC/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agro Hub' })).toHaveAttribute('href', '/projects/p1');
    expect(get).toHaveBeenCalledWith('/api/interactions');
    expect(screen.getByText('M4')).toBeInTheDocument();
    expect(screen.getByText('A8')).toBeInTheDocument();
    expect(screen.getAllByText('Credit linkage')).toHaveLength(1);
  });

  it('shows N/A when there is neither project nor investor', async () => {
    mockGet([{ _id: 'l3', description: 'Orphan', category: 'Other', loggedBy: { name: 'X' }, createdAt: '2026-10-17T10:00:00.000Z' }]);
    renderAt();
    expect(await screen.findByText('N/A - Orphan')).toBeInTheDocument();
    expect(screen.queryByText('Credit linkage')).not.toBeInTheDocument();
  });

  it('a category facet goes to the URL and to one request; Back restores', async () => {
    const get = mockGet([]);
    renderAt();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/interactions'));
    await userEvent.click(screen.getByRole('button', { name: 'Category' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Meeting/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/interactions', { params: { category: 'Meeting' } }));
    expect(location.search).toBe('?category=Meeting');
    expect(interactionCalls(get)).toHaveLength(2);
    await userEvent.keyboard('{Escape}');
    act(() => navigate(-1));
    await waitFor(() => expect(location.search).toBe(''));
    await waitFor(() => expect(interactionCalls(get)).toHaveLength(3));
    expect(interactionCalls(get)[2]).toEqual(['/api/interactions']);
  });

  it('a URL restores the filters (refresh); unknown values are ignored', async () => {
    const get = mockGet([]);
    renderAt('/interactions?category=Meeting,Party&serviceCode=M4,Z9&noCode=1&year=2025&from=2026-13-01&loggedBy=me&sort=-date');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/interactions', {
      params: {
        category: 'Meeting', serviceCode: 'M4', noCode: '1', loggedBy: 'me', year: '2025', sort: '-date',
      },
    }));
    expect(interactionCalls(get)).toHaveLength(1);
    expect(screen.getByText('Category: Meeting')).toBeInTheDocument();
    expect(screen.getByText('Without a SABER code', { selector: 'span span' })).toBeInTheDocument();
    expect(screen.getByText('Logged by: Me')).toBeInTheDocument();
    expect(screen.queryByText(/Party/)).not.toBeInTheDocument();
  });

  it('the built-in tab "Without a SABER code" sets ?noCode=1', async () => {
    const get = mockGet([]);
    renderAt();
    await userEvent.click(await screen.findByRole('tab', { name: 'Without a SABER code' }));
    await waitFor(() => expect(location.search).toBe('?noCode=1'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/interactions', { params: { noCode: '1' } }));
    expect(screen.getByRole('tab', { name: 'Without a SABER code' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Export calls the export with the current params', async () => {
    mockGet([]);
    const exp = vi.spyOn(listExport, 'exportList').mockResolvedValue('x.csv');
    renderAt('/interactions?serviceCode=A8&q=forum');
    await userEvent.click(await screen.findByRole('button', { name: /Export this view/ }));
    expect(exp).toHaveBeenCalledWith('interactions', { q: 'forum', serviceCode: 'A8' });
  });

  it('shows "N of M" from X-Total-Count', async () => {
    mockGet(() => ({ data: [{ _id: 'l3', description: 'Orphan', category: 'Other', createdAt: '2026-10-17T10:00:00.000Z' }], headers: { 'x-total-count': '40' } }));
    renderAt('/interactions?category=Other');
    expect(await screen.findByText('1 of 40 interactions')).toBeInTheDocument();
  });
});
