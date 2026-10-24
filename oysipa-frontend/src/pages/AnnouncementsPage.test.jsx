import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import AnnouncementsPage from './AnnouncementsPage';
import apiClient from '../api/api';

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

describe('AnnouncementsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists date, outlet, project, investor and the OYSIPA named chip; filters refetch', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation((url) => Promise.resolve({ data: url === '/api/projects' ? [] : list }));
    render(<MemoryRouter><AnnouncementsPage /></MemoryRouter>);
    expect(await screen.findByText('Synthetic Gazette')).toBeInTheDocument();
    expect(screen.getByText('23 Apr 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Synthetic Tower').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Synthetic Investor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OYSIPA named', { selector: '.MuiChip-label' })).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/api/announcements');

    await userEvent.click(screen.getByRole('combobox', { name: 'OYSIPA named' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Yes' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { oysipaNamed: 'true' } }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Year' }));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/announcements', { params: { year: '2025', oysipaNamed: 'true' } }));
  });

  it('empty → "No announcements registered."', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    render(<MemoryRouter><AnnouncementsPage /></MemoryRouter>);
    expect(await screen.findByText('No announcements registered.')).toBeInTheDocument();
  });
});
