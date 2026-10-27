import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ExportButton from './ExportButton';
import apiClient from '../api/api';

describe('ExportButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  it('downloads the CSV of the current view with the list params', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: new Blob(['Filters: none\n'], { type: 'text/csv' }),
      headers: { 'content-disposition': 'attachment; filename="oysipa-investors-2026-10-27.csv"' },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ExportButton list="investors" params={{ sector: 'Agribusiness,Manufacturing', q: 'agro' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export this view (CSV)' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/export/investors', {
      params: { sector: 'Agribusiness,Manufacturing', q: 'agro' }, responseType: 'blob',
    }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('shows the server message (read from the blob) when the export is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = 'This view has 5,200 rows; exports are limited to 5,000. Narrow the filters.';
    vi.spyOn(apiClient, 'get').mockRejectedValue({
      response: { status: 400, data: new Blob([JSON.stringify({ message })], { type: 'application/json' }) },
    });
    render(<ExportButton list="investors" />);
    await userEvent.click(screen.getByRole('button', { name: 'Export this view (CSV)' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
