import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import IssuesShareWidget from './IssuesShareWidget';
import apiClient from '../api/api';
import { todayLagos } from '../utils/dates';

const thisYear = Number(todayLagos().slice(0, 4));
const renderWidget = () => render(<MemoryRouter><IssuesShareWidget /></MemoryRouter>);

describe('IssuesShareWidget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the share, the counts and the band for the current year', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { year: thisYear, total: 3, resolved: 1, withdrawn: 1, share: 1 / 3, band: 'below basic' },
    });
    renderWidget();
    expect(await screen.findByText('33%')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 resolved (1 withdrawn, not counted)')).toBeInTheDocument();
    expect(screen.getByText('Below basic (under 50%)')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/admin/issues-metric', { params: { year: thisYear } });
  });

  it('zero issues → "No issues registered", not 0%', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { year: thisYear, total: 0, resolved: 0, withdrawn: 0, share: null, band: null },
    });
    renderWidget();
    expect(await screen.findByText('No issues registered')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('the year selector refetches for that year', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { year: 2025, total: 4, resolved: 4, withdrawn: 0, share: 1, band: 'stretch' },
    });
    renderWidget();
    await screen.findByText('100%');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/admin/issues-metric', { params: { year: 2025 } }));
    expect(screen.getByText('Stretch band (over 75%)')).toBeInTheDocument();
  });

  it('only Withdrawn issues -> "No issues counted (N withdrawn)"', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { year: thisYear, total: 0, resolved: 0, withdrawn: 2, share: null, band: null },
    });
    renderWidget();
    expect(await screen.findByText('No issues counted (2 withdrawn)')).toBeInTheDocument();
  });

  it('a year change clears the old numbers while the new year loads', async () => {
    let release;
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: { year: thisYear, total: 4, resolved: 4, withdrawn: 0, share: 1, band: 'stretch' } })
      .mockImplementationOnce(() => new Promise((r) => { release = r; }));
    renderWidget();
    await screen.findByText('100%');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    release({ data: { year: 2025, total: 2, resolved: 1, withdrawn: 0, share: 0.5, band: 'basic' } });
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });
});
