import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import AnnouncementsPage from './AnnouncementsPage';
import apiClient from '../api/api';
import * as listExport from '../api/listExport';

vi.mock('../utils/dates', async (importOriginal) => ({
  ...(await importOriginal()),
  todayLagos: () => '2026-06-15',
}));

const list = [
  {
    _id: 'a1', outlet: 'Synthetic Gazette', oysipaNamed: true, announcementDate: '2026-04-23T00:00:00.000Z', createdAt: '2026-04-23T10:00:00.000Z',
    project: { _id: 'p1', projectTitle: 'Synthetic Tower', investor: { _id: 'inv1', investorName: 'Synthetic Investor' } },
  },
  {
    _id: 'a2', outlet: 'Other Daily', oysipaNamed: false, announcementDate: '2025-01-10T00:00:00.000Z', createdAt: '2025-01-10T10:00:00.000Z',
    project: { _id: 'p2', projectTitle: 'Synthetic Farm', investor: { _id: 'inv2', investorName: 'Second Investor' } },
  },
];
const PID = 'b'.repeat(24);
const projects = [{ _id: PID, projectTitle: 'Synthetic Port', investor: { investorName: 'Port Investor' } }];

const mockGet = (rows = list) => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
  if (url === '/api/projects') return Promise.resolve({ data: projects });
  if (url === '/api/views') return Promise.resolve({ data: [] });
  return Promise.resolve({ data: rows });
});
const listCalls = (get) => get.mock.calls.filter(([u]) => u === '/api/announcements');

let location;
let navigate;
const Probe = () => {
  location = useLocation();
  navigate = useNavigate();
  return null;
};
const renderAt = (url = '/announcements') => render(<MemoryRouter initialEntries={[url]}><AnnouncementsPage /><Probe /></MemoryRouter>);

describe('AnnouncementsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists date, outlet, project, investor and the OYSIPA named chip; facets refetch and go to the URL', async () => {
    const get = mockGet();
    renderAt();
    expect(await screen.findByText('Synthetic Gazette')).toBeInTheDocument();
    expect(screen.getByText('23 Apr 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Synthetic Tower').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Synthetic Investor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OYSIPA named', { selector: '[data-tone="success"]' })).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/api/announcements');

    await userEvent.click(screen.getByRole('button', { name: 'OYSIPA named' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Yes/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { oysipaNamed: 'true' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Year' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: '2025' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { year: '2025', oysipaNamed: 'true' } }));
    expect(location.search).toBe('?oysipaNamed=true&year=2025');
    act(() => navigate(-1));
    await waitFor(() => expect(location.search).toBe('?oysipaNamed=true'));
  });

  it('?year= and ?oysipaNamed= set the starting filters (dashboard click-through)', async () => {
    const get = mockGet();
    renderAt('/announcements?year=2025&oysipaNamed=true');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { year: '2025', oysipaNamed: 'true' } }));
    expect(get).not.toHaveBeenCalledWith('/api/announcements');
    expect(listCalls(get)).toHaveLength(1);
    expect(screen.getByText('OYSIPA named: Yes')).toBeInTheDocument();
  });

  it('a ?year= or ?oysipaNamed= not offered is ignored', async () => {
    const get = mockGet();
    renderAt('/announcements?year=1999&oysipaNamed=maybe&project=bad');
    expect(await screen.findByText('Synthetic Gazette')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/announcements');
    expect(get.mock.calls.some(([u, o]) => u === '/api/announcements' && o)).toBe(false);
  });

  it('choosing a project writes ?project=<id>; its chip shows the title', async () => {
    const get = mockGet();
    renderAt();
    await screen.findByText('Synthetic Gazette');
    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }));
    await userEvent.click(await screen.findByRole('option', { name: /Synthetic Port/ }));
    await waitFor(() => expect(location.search).toBe(`?project=${PID}`));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { project: PID } }));
    expect(screen.getByText('Project: Synthetic Port')).toBeInTheDocument();
  });

  it('a date range from the URL is sent; Export uses the current params', async () => {
    const get = mockGet();
    const exp = vi.spyOn(listExport, 'exportList').mockResolvedValue('x.csv');
    renderAt('/announcements?from=2026-01-01&to=2026-03-31&q=gazette');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { q: 'gazette', from: '2026-01-01', to: '2026-03-31' } }));
    await userEvent.click(screen.getByRole('button', { name: /Export this view/ }));
    expect(exp).toHaveBeenCalledWith('announcements', { q: 'gazette', from: '2026-01-01', to: '2026-03-31' });
  });

  it('empty → "No announcements registered."', async () => {
    mockGet([]);
    renderAt();
    expect(await screen.findByText('No announcements registered.')).toBeInTheDocument();
  });
});
