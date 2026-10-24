import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import AnnouncementsWidget from './AnnouncementsWidget';
import apiClient from '../api/api';
import { todayLagos } from '../utils/dates';

const thisYear = Number(todayLagos().slice(0, 4));
const renderWidget = () => render(<MemoryRouter><AnnouncementsWidget /></MemoryRouter>);

describe('AnnouncementsWidget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows "1 of 5" with the basic band for the current year', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { year: thisYear, counted: 1, band: 'basic' } });
    renderWidget();
    expect(await screen.findByText('1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Basic band (1–4)')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/admin/announcements-metric', { params: { year: thisYear } });
  });

  it('zero → "0 of 5", none yet; 6 → stretch', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { year: thisYear, counted: 0, band: 'none yet' } });
    const { unmount } = renderWidget();
    expect(await screen.findByText('0 of 5')).toBeInTheDocument();
    expect(screen.getByText('None yet')).toBeInTheDocument();
    unmount();
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { year: thisYear, counted: 6, band: 'stretch' } });
    renderWidget();
    expect(await screen.findByText('6 of 5')).toBeInTheDocument();
    expect(screen.getByText('Stretch band (5 or more)')).toBeInTheDocument();
  });

  it('the year selector refetches for that year; an error shows a message', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { year: 2025, counted: 2, band: 'basic' } });
    renderWidget();
    await screen.findByText('2 of 5');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/admin/announcements-metric', { params: { year: 2025 } }));
    get.mockRejectedValueOnce(new Error('down'));
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: '2024' }));
    expect(await screen.findByText('Could not load the announcements count.')).toBeInTheDocument();
  });
});
