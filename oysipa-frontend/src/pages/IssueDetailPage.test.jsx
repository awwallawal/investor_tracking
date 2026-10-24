import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import IssueDetailPage from './IssueDetailPage';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role, id = 'u1') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id, role } })}.sig`;

const issue = {
  _id: 'i1',
  investor: { _id: 'inv1', investorName: 'Synthetic Investor', assignedTo: 'u1' },
  category: 'land/title',
  description: 'C of O delayed',
  status: 'Open',
  dateReported: '2026-03-01T00:00:00.000Z',
  dateRegistered: '2026-03-02T10:00:00.000Z',
  createdAt: '2026-03-02T10:00:00.000Z',
  mdaResponsible: ['Ministry of Lands, Housing and Urban Development'],
  actions: [
    { _id: 'a1', date: '2026-03-03T00:00:00.000Z', by: 'Lands desk', note: 'Letter to Lands', recordedBy: { name: 'Officer One' }, recordedAt: '2026-03-03T09:00:00.000Z' },
  ],
  files: [{ _id: 'f1', fileName: 'scan.pdf', uploadedAt: '2026-03-03T09:00:00.000Z' }],
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/issues/i1']}>
    <Routes><Route path="/issues/:id" element={<IssueDetailPage />} /></Routes>
  </MemoryRouter>
);

describe('IssueDetailPage', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  it('shows the issue, MoU flag, the actions with who/when and the files', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: issue });
    renderPage();
    expect(await screen.findByText('Synthetic Investor')).toBeInTheDocument();
    expect(screen.getByText(/Ministry of Lands, Housing and Urban Development \(MoU\)/)).toBeInTheDocument();
    expect(screen.getByText('Letter to Lands')).toBeInTheDocument();
    expect(screen.getByText(/3 Mar 2026 · Lands desk · recorded by Officer One on 3 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText('scan.pdf')).toBeInTheDocument();
    // Assigned Staff can write; only DG/Admin can delete.
    expect(screen.getByRole('button', { name: 'Add action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('Staff not assigned: read only', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'someone-else'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: issue });
    renderPage();
    await screen.findByText('Letter to Lands');
    expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save status' })).not.toBeInTheDocument();
  });

  it('adds an action and shows it', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: issue });
    const added = { ...issue, files: undefined, actions: [...issue.actions, { _id: 'a2', date: '2026-03-04T00:00:00.000Z', by: 'DG', note: 'Site visit', recordedBy: { name: 'DG' }, recordedAt: '2026-03-04T09:00:00.000Z' }] };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: added });
    renderPage();
    await screen.findByText('Letter to Lands');
    await userEvent.type(screen.getByLabelText(/what was done/i), 'Site visit');
    await userEvent.click(screen.getByRole('button', { name: 'Add action' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/issues/i1/actions', { note: 'Site visit' }));
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    // Files are kept after an update.
    expect(within(document.body).getByText('scan.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
