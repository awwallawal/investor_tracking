// Evidence library page: folder cards with counts and links, and "New folder"
// for DG/Admin only.
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import EvidenceLibraryPage from './EvidenceLibraryPage';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const tree = [
  {
    _id: 'top-1', key: 'programmes', name: 'Programmes and events', description: 'Summits and forums', totalFiles: 69, totalUntagged: 68,
    children: [
      { _id: 'sub-1', key: 'programmes/forum', name: 'Forum 2025', folderDate: '2025-05-15T00:00:00.000Z', fileCount: 5, untaggedCount: 4 },
      { _id: 'sub-2', key: 'programmes/expo', name: 'Expo', fileCount: 1, untaggedCount: 0 },
    ],
  },
];

const renderPage = () => render(<MemoryRouter><EvidenceLibraryPage /></MemoryRouter>);

describe('EvidenceLibraryPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: tree });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('shows each top folder with totals, and subfolder cards with counts and links', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByText('69 files · 68 untagged')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Programmes and events' })).toHaveAttribute('href', '/evidence/top-1');
    const forum = screen.getByRole('link', { name: /Forum 2025/ });
    expect(forum).toHaveAttribute('href', '/evidence/sub-1');
    expect(within(forum).getByText('15 May 2025')).toBeInTheDocument();
    expect(within(forum).getByText('5 files')).toBeInTheDocument();
    expect(within(forum).getByText('4 untagged')).toBeInTheDocument();
    const expo = screen.getByRole('link', { name: /Expo/ });
    expect(within(expo).getByText('1 file')).toBeInTheDocument();
    expect(within(expo).queryByText(/untagged/)).not.toBeInTheDocument();
  });

  it('Staff see no "New folder"', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    await screen.findByText('Forum 2025');
    expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s creates a subfolder: createFolder sends parent', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'new' } });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New folder' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Oyo Business Forum');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Inside/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Programmes and events' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/evidence/folders', { name: 'Oyo Business Forum', parent: 'top-1' }));
  }, 30000);
});
