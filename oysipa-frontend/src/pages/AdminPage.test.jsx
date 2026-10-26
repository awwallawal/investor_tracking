import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import AdminPage from './AdminPage';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role, id = 'u1') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id, role } })}.sig`;

const mdaList = [
  { code: 'LANDS AND HOUSING', name: 'Ministry of Lands and Housing', abbreviation: 'Lands & Housing', mou: true },
  { code: 'TRADE', name: 'Ministry of Trade, Investment and Cooperatives', abbreviation: 'Trade', mou: true },
  { code: 'SURVEYOR GENERAL', name: 'Office of the Surveyor General', abbreviation: 'Surveyor General', mou: false },
  { code: 'OTHER', name: 'Other', abbreviation: 'Other', mou: false },
];

const mockGets = () => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
  if (url === '/api/mdas') return Promise.resolve({ data: mdaList });
  return Promise.resolve({ data: [] });
});

const pickSurveyor = async () => {
  await userEvent.type(screen.getByRole('combobox', { name: /mou mdas/i }), 'surveyor');
  await userEvent.click(await screen.findByRole('option', { name: 'Office of the Surveyor General' }));
  await userEvent.keyboard('{Escape}');
};

const renderPage = () => render(<MemoryRouter><AdminPage /></MemoryRouter>);

describe('AdminPage — MoU MDAs (11.7c)', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  // Owner decision 24 Oct 2026: DG and Portal-Admin both manage lifecycle statuses.
  it.each(['Director-General', 'Portal-Admin'])('%s sees the MoU MDAs section and the lifecycle status manager', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    mockGets();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'MoU MDAs' })).toBeInTheDocument();
    expect(await screen.findByText('Ministry of Lands and Housing')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Trade, Investment and Cooperatives')).toBeInTheDocument();
    expect(await screen.findByText('Manage Lifecycle Statuses')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/lifecycle-statuses'));
  });

  it('another role does not get the lifecycle status manager', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGets();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'MoU MDAs' })).toBeInTheDocument();
    expect(screen.queryByText('Manage Lifecycle Statuses')).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/lifecycle-statuses');
  });

  it('DG adds a fifth MoU MDA by search and saves the codes', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockGets();
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      data: mdaList.map((m) => ({ ...m, mou: m.code !== 'OTHER' })),
    });
    renderPage();
    await screen.findByText('Ministry of Lands and Housing');
    await pickSurveyor();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/mdas/mou', { codes: ['LANDS AND HOUSING', 'TRADE', 'SURVEYOR GENERAL'] }));
    expect(await screen.findByText('MoU MDAs saved.')).toBeInTheDocument();
  }, 30000);

  it('a refused save shows the server message', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockGets();
    vi.spyOn(apiClient, 'put').mockRejectedValue({ response: { status: 400, data: { message: 'Invalid MDA: "X"' } } });
    renderPage();
    await screen.findByText('Ministry of Lands and Housing');
    await pickSurveyor();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Invalid MDA: "X"')).toBeInTheDocument();
  });

  it('Save is disabled until the selection changes', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockGets();
    renderPage();
    await screen.findByText('Ministry of Lands and Housing');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await pickSurveyor();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Save is disabled when the list failed to load or is empty', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    vi.spyOn(apiClient, 'get').mockImplementation((url) => (url === '/api/mdas' ? Promise.reject(new Error('down')) : Promise.resolve({ data: [] })));
    const { unmount } = renderPage();
    expect(await screen.findByText('Failed to load the MDA list.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    unmount();
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/mdas'));
    await new Promise((r) => { setTimeout(r, 20); });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByText('No MDA will be marked MoU')).not.toBeInTheDocument();
  });

  it('clearing every MoU MDA shows a warning next to Save', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockGets();
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: mdaList.map((m) => ({ ...m, mou: false })) });
    renderPage();
    await screen.findByText('Ministry of Lands and Housing');
    expect(screen.queryByText('No MDA will be marked MoU')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Clear'));
    expect(await screen.findByText('No MDA will be marked MoU')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/mdas/mou', { codes: [] }));
  });

  it('a save response that is not a list is an error; the previous list is kept', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockGets();
    vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ok: true } });
    renderPage();
    await screen.findByText('Ministry of Lands and Housing');
    await pickSurveyor();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save the MoU MDAs.')).toBeInTheDocument();
    expect(screen.queryByText('MoU MDAs saved.')).not.toBeInTheDocument();
    expect(screen.getByText('Ministry of Lands and Housing')).toBeInTheDocument();
    expect(screen.getByText('Office of the Surveyor General')).toBeInTheDocument();
  }, 30000);
});

describe('AdminPage — Exchange rates (11.14)', () => {
  const fxState = (overrides = {}) => ({
    currencies: ['USD', 'EUR', 'GBP'],
    staleDays: 30,
    latest: {
      USD: {
        rate: 1361.84, asOf: '2026-10-23', source: 'CBN NFEM weighted average', ageDays: 3, stale: false,
      },
      EUR: {
        rate: 1525.12, asOf: '2026-08-01', source: 'Aboki Forex', ageDays: 86, stale: true,
      },
    },
    missing: ['GBP'],
    stale: ['EUR'],
    history: [
      { currency: 'USD', rate: 1361.84, asOf: '2026-10-23', source: 'CBN NFEM weighted average' },
      { currency: 'EUR', rate: 1525.12, asOf: '2026-08-01', source: 'Aboki Forex' },
    ],
    ...overrides,
  });
  const mockFx = (state) => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
    if (url === '/api/fx-rates') return Promise.resolve({ data: state });
    if (url === '/api/mdas') return Promise.resolve({ data: mdaList });
    return Promise.resolve({ data: [] });
  });

  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  it('shows the latest rates, the out-of-date warning, the missing note and the history', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockFx(fxState());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Exchange rates' })).toBeInTheDocument();
    expect(await screen.findByText('Rates out of date (older than 30 days): EUR. Add a current rate.')).toBeInTheDocument();
    expect(screen.getByText(/No rate set for GBP/)).toBeInTheDocument();
    expect(screen.getByTestId('fx-latest-USD')).toHaveTextContent('₦1,361.84 per USD');
    expect(screen.getByTestId('fx-latest-USD')).toHaveTextContent('as of 23 Oct 2026');
    expect(screen.getByTestId('fx-latest-EUR')).toHaveTextContent('(out of date)');
    expect(screen.getByTestId('fx-latest-GBP')).toHaveTextContent('No rate set');
    const history = screen.getByRole('table', { name: 'Exchange rate history' });
    expect(history).toHaveTextContent('Aboki Forex');
  });

  it('adds a dated rate (POST) and shows the new state', async () => {
    localStorage.setItem('token', tokenFor('Portal-Admin'));
    mockFx(fxState());
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: fxState({
        latest: {
          ...fxState().latest,
          GBP: {
            rate: 1787.73, asOf: '2026-10-22', source: 'nairatoday.com', ageDays: 4, stale: false,
          },
        },
        missing: [],
      }),
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Exchange rates' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Currency' }));
    await userEvent.click(await screen.findByRole('option', { name: 'GBP' }));
    await userEvent.type(screen.getByLabelText('₦ per unit'), '1787.73');
    fireEvent.change(screen.getByLabelText('Rate date'), { target: { value: '2026-10-22' } });
    await userEvent.type(screen.getByLabelText('Source'), 'nairatoday.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add rate' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/fx-rates', {
      currency: 'GBP', rate: 1787.73, asOf: '2026-10-22', source: 'nairatoday.com',
    }));
    expect(await screen.findByText('Rate added.')).toBeInTheDocument();
    expect(screen.getByTestId('fx-latest-GBP')).toHaveTextContent('₦1,787.73 per GBP');
    expect(screen.queryByText(/No rate set for/)).not.toBeInTheDocument();
  }, 20000);

  it('checks the form before sending: rate > 0, a date not in the future, a source; shows a server error', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockFx(fxState());
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { data: { message: 'Rate date cannot be in the future.' } } });
    renderPage();
    await screen.findByRole('heading', { name: 'Exchange rates' });
    const add = screen.getByRole('button', { name: 'Add rate' });
    await userEvent.click(add);
    expect(await screen.findByText('Enter the rate in ₦ per unit (more than 0).')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('₦ per unit'), '0');
    await userEvent.click(add);
    expect(screen.getByText('Enter the rate in ₦ per unit (more than 0).')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('₦ per unit'));
    await userEvent.type(screen.getByLabelText('₦ per unit'), '1400');
    await userEvent.click(add);
    expect(screen.getByText('Enter the date of the rate.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rate date'), { target: { value: '2999-01-01' } });
    await userEvent.click(add);
    expect(screen.getByText('The rate date cannot be in the future.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rate date'), { target: { value: '2026-10-01' } });
    await userEvent.click(add);
    expect(screen.getByText('Say where the rate comes from.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Source'), 'CBN');
    await userEvent.click(add);
    expect(await screen.findByText('Rate date cannot be in the future.')).toBeInTheDocument();
  }, 20000);

  it('Staff do not get the exchange-rates section', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockFx(fxState());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'MoU MDAs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Exchange rates' })).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/fx-rates');
  });
});
