import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import IssuesPage from './IssuesPage';
import apiClient from '../api/api';
import * as listExport from '../api/listExport';

vi.mock('../utils/dates', async (importOriginal) => ({
  ...(await importOriginal()),
  todayLagos: () => '2026-06-15',
}));

const issue = (id, status) => ({
  _id: id, status, category: 'other', description: `Issue ${id}`, investor: { investorName: `Investor ${id}` }, dateReported: '2026-03-01T00:00:00.000Z', createdAt: '2026-03-01T10:00:00.000Z',
});

const mdaList = [
  { code: 'LANDS AND HOUSING', name: 'Ministry of Lands and Housing', abbreviation: 'Lands & Housing', mou: true },
  { code: 'TRADE', name: 'Ministry of Trade, Investment and Cooperatives', abbreviation: 'Trade', mou: false },
];
// Side requests by URL; issue GETs go to `issues`.
const routeGet = (issues) => (url, config) => {
  if (url === '/api/mdas') return Promise.resolve({ data: mdaList });
  if (url === '/api/views') return Promise.resolve({ data: [] });
  if (url === '/api/users/staff') return Promise.resolve({ data: [] });
  return issues(url, config);
};
const issueCalls = (get) => get.mock.calls.filter(([u]) => u === '/api/issues');

let location;
let navigate;
const Probe = () => {
  location = useLocation();
  navigate = useNavigate();
  return null;
};
const renderPage = (url = '/issues') => render(<MemoryRouter initialEntries={[url]}><IssuesPage /><Probe /></MemoryRouter>);

describe('IssuesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('status and year facets go to the URL and call GET /api/issues with { params }', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({ data: [issue('1', 'Open')] })));
    renderPage();
    expect(await screen.findByText('Investor 1')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/issues');
    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Resolved/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', { params: { status: 'Resolved' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Year reported' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: '2025' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', { params: { status: 'Resolved', year: '2025' } }));
    expect(location.search).toBe('?status=Resolved&year=2025');
    // Back undoes the last filter.
    act(() => navigate(-1));
    await waitFor(() => expect(location.search).toBe('?status=Resolved'));
    expect(issueCalls(get).at(-1)).toEqual(['/api/issues', { params: { status: 'Resolved' } }]);
  });

  it('a slow response for superseded filters does not overwrite the newer list', async () => {
    let releaseOld;
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet((url, config) => {
      if (!config) return new Promise((r) => { releaseOld = r; });
      return Promise.resolve({ data: [issue('new', 'Resolved')] });
    }));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Resolved/ }));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Investor new')).toBeInTheDocument();
    releaseOld({ data: [issue('old', 'Open')] });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByText('Investor old')).not.toBeInTheDocument();
    expect(screen.getByText('Investor new')).toBeInTheDocument();
  });

  it('a URL restores the filters (refresh); unknown values are ignored', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({ data: [] })));
    renderPage('/issues?status=Open,Lost&year=20x6,2025&category=other&stale=1&officer=me,nobody&sort=date');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', {
      params: {
        status: 'Open', category: 'other', year: '2025', stale: '1', officer: 'me', sort: 'date',
      },
    }));
    expect(issueCalls(get)).toHaveLength(1);
    expect(screen.getByText('Status: Open')).toBeInTheDocument();
    expect(screen.getByText('Officer: Me')).toBeInTheDocument();
    expect(await screen.findByText('No issues registered for these filters.')).toBeInTheDocument();
  });

  it('the built-in tab Stale sets ?stale=1; Open sets both open statuses', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({ data: [] })));
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Stale' }));
    await waitFor(() => expect(location.search).toBe('?stale=1'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', { params: { stale: '1' } }));
    await userEvent.click(screen.getByRole('tab', { name: 'Open' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', { params: { status: ['Open', 'In progress'] } }));
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Export calls the export with the current params', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({ data: [] })));
    const exp = vi.spyOn(listExport, 'exportList').mockResolvedValue('x.csv');
    renderPage('/issues?stale=1&mda=TRADE');
    await userEvent.click(await screen.findByRole('button', { name: /Export this view/ }));
    expect(exp).toHaveBeenCalledWith('issues', { mda: 'TRADE', stale: '1' });
  });

  it('shows MDA names from GET /api/mdas with "(MoU)"; an unknown code shows as itself (11.7c)', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({
      data: [{ ...issue('1', 'Open'), mdaResponsible: ['LANDS AND HOUSING', 'TRADE', 'GONE'] }],
    })));
    renderPage();
    const line = await screen.findByText('MDA: Ministry of Lands and Housing (MoU), Ministry of Trade, Investment and Cooperatives, GONE');
    // In the always-visible investor cell, not the category column hidden on phones.
    expect(line.closest('td')).toBe(screen.getByText('Investor 1').closest('td'));
  });

  it('shows the reference beside the investor (11.7b); a loaded issue without one shows its importRef', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({
      data: [{ ...issue('1', 'Open'), reference: 'ISS-09' }, { ...issue('2', 'Open'), importRef: 'ISS-03' }],
    })));
    renderPage();
    expect((await screen.findByText(/ISS-09/)).closest('td')).toBe(screen.getByText('Investor 1').closest('td'));
    expect(screen.getByText(/ISS-03/).closest('td')).toBe(screen.getByText('Investor 2').closest('td'));
  });

  it('an importRef that is not ISS-NN (e.g. S-LEGACY) is never shown as the reference', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({
      data: [{ ...issue('1', 'Open'), importRef: 'S-LEGACY' }],
    })));
    renderPage();
    expect(await screen.findByText('Investor 1')).toBeInTheDocument();
    expect(screen.queryByText(/S-LEGACY/)).not.toBeInTheDocument();
  });

  it('clicking a row opens the issue', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({ data: [issue('1', 'Open')] })));
    renderPage();
    await userEvent.click(await screen.findByText('Issue 1'));
    expect(location.pathname).toBe('/issues/1');
  });
});
