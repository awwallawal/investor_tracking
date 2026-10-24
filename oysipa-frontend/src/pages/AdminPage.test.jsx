import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('DG sees the MoU MDAs section but not the lifecycle status manager', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    mockGets();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'MoU MDAs' })).toBeInTheDocument();
    expect(await screen.findByText('Ministry of Lands and Housing')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Trade, Investment and Cooperatives')).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/lifecycle-statuses');
  });

  it('Portal-Admin sees both sections', async () => {
    localStorage.setItem('token', tokenFor('Portal-Admin'));
    mockGets();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'MoU MDAs' })).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/lifecycle-statuses'));
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
