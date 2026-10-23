import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import InvestorDirectoryPage from './InvestorDirectoryPage';
import apiClient from '../api/api';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const mockInvestors = [
  { _id: '1', investorName: 'John Doe', sector: 'Tech', countryOfOrigin: 'USA' },
  { _id: '2', investorName: 'Jane Smith', sector: 'Agriculture', countryOfOrigin: 'Canada' },
];

const renderPage = () => render(
  <MemoryRouter>
    <InvestorDirectoryPage />
  </MemoryRouter>
);

describe('InvestorDirectoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('renders investor directory and fetched investors', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockInvestors });

    renderPage();

    expect(screen.getByText('Investor Directory')).toBeInTheDocument();

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/investors');
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('Staff: no Delete button and no Actions column', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockInvestors });
    renderPage();
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s: Confirm disabled until a reason is typed; DELETE sends the reason and refetches', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    const getSpy = vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: mockInvestors })
      .mockResolvedValue({ data: [mockInvestors[1]] });
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: { investors: 1, projects: 2, interactions: 4 } } });
    renderPage();

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete John Doe?')).toBeInTheDocument();
    expect(within(dialog).getByText(/This also deletes all its projects and interactions/)).toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', { name: 'Confirm delete' });
    expect(confirm).toBeDisabled();
    const reason = within(dialog).getByLabelText(/reason/i);
    await userEvent.type(reason, '   ');
    expect(confirm).toBeDisabled();
    await userEvent.type(reason, 'Duplicate record');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('/api/investors/1', { data: { reason: 'Duplicate record' } }));
    expect(await screen.findByText(/Deleted John Doe: 1 investor, 2 project\(s\), 4 interaction\(s\)/)).toBeInTheDocument();
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('John Doe')).not.toBeInTheDocument());
  }, 20000);

  it('shows the API error on failure and keeps the investor', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockInvestors });
    vi.spyOn(apiClient, 'delete').mockRejectedValue({ response: { status: 500, data: { message: 'Could not write the audit record. Nothing was deleted.' } } });
    renderPage();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));
    expect(await within(dialog).findByText('Could not write the audit record. Nothing was deleted.')).toBeInTheDocument();
    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
  }, 20000);
});

describe('InvestorDirectoryPage — T11 filters, type chip and Import (11.5 + 11.11)', () => {
  const typed = [
    { _id: '1', investorName: 'John Doe', sector: 'Tech', countryOfOrigin: 'USA', organisationType: 'Investor' },
    { _id: '3', investorName: 'NIPC Synthetic', sector: 'Gov', countryOfOrigin: 'Nigeria', organisationType: 'Intermediary' },
    { _id: '4', investorName: 'Old Record', sector: 'Agro', countryOfOrigin: 'Nigeria' },
  ];
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });
  afterEach(() => localStorage.removeItem('token'));

  it('shows an organisation-type chip on each row (old records show Investor)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: typed });
    renderPage();
    expect(await screen.findByText('NIPC Synthetic')).toBeInTheDocument();
    expect(screen.getByText('Intermediary')).toBeInTheDocument();
    expect(screen.getAllByText('Investor')).toHaveLength(2);
  });

  it('filters by lead source and organisation type through the API', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: typed });
    renderPage();
    await screen.findByText('John Doe');
    await userEvent.click(screen.getByRole('combobox', { name: /organisation type/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Intermediary' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { organisationType: 'Intermediary' } }));
    await userEvent.click(screen.getByRole('combobox', { name: /lead source/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Unknown (pre-T11)' }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/investors', { params: { leadSource: 'Unknown (pre-T11)', organisationType: 'Intermediary' } }));
  }, 20000);

  it('Staff: no Import investors button', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: typed });
    renderPage();
    await screen.findByText('John Doe');
    expect(screen.queryByRole('button', { name: 'Import investors' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s: Import investors opens the dialog', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: typed });
    renderPage();
    await screen.findByText('John Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Import investors' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Run import' })).toBeDisabled();
  });
});
