import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import IssuesPage from './IssuesPage';
import apiClient from '../api/api';

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
// GET /api/mdas gets the MDA list; issue GETs go to `issues`.
const routeGet = (issues) => (url, config) => (url === '/api/mdas' ? Promise.resolve({ data: mdaList }) : issues(url, config));

const renderPage = () => render(<MemoryRouter><IssuesPage /></MemoryRouter>);

describe('IssuesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('status and year filters call GET /api/issues with { params: { status, year } }', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(routeGet(() => Promise.resolve({ data: [issue('1', 'Open')] })));
    renderPage();
    expect(await screen.findByText('Investor 1')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/issues');
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Resolved' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', { params: { status: 'Resolved' } }));
    await userEvent.click(screen.getByRole('combobox', { name: /year reported/i }));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/issues', { params: { status: 'Resolved', year: '2025' } }));
  });

  it('a slow response for superseded filters does not overwrite the newer list', async () => {
    let releaseOld;
    vi.spyOn(apiClient, 'get').mockImplementation(routeGet((url, config) => {
      if (!config) return new Promise((r) => { releaseOld = r; });
      return Promise.resolve({ data: [issue('new', 'Resolved')] });
    }));
    renderPage();
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Resolved' }));
    expect(await screen.findByText('Investor new')).toBeInTheDocument();
    releaseOld({ data: [issue('old', 'Open')] });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByText('Investor old')).not.toBeInTheDocument();
    expect(screen.getByText('Investor new')).toBeInTheDocument();
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
});
