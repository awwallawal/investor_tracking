import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import AnnouncementDetailPage from './AnnouncementDetailPage';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role, id = 'u1') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id, role } })}.sig`;

const announcement = (assignedTo = 'u1') => ({
  _id: 'a1',
  project: { _id: 'p1', projectTitle: 'Synthetic Tower', investor: { _id: 'inv1', investorName: 'Synthetic Investor', assignedTo } },
  announcementDate: '2026-04-23T00:00:00.000Z',
  createdAt: '2026-10-24T10:00:00.000Z',
  outlet: 'Synthetic Gazette',
  url: 'https://news.example.test/a',
  archivedCopyUrl: 'https://archive.example.test/a',
  oysipaNamed: true,
  oysipaRoleText: 'Facilitated approvals',
  createdBy: { name: 'Officer One' },
  supportingInteractions: [{
    _id: 'l1', description: 'Site visit with investor', interactionDate: '2026-03-01T00:00:00.000Z', project: { _id: 'p1', projectTitle: 'Synthetic Tower' },
  }],
  files: [{ _id: 'f1', fileName: 'copy.pdf', uploadedAt: '2026-04-24T09:00:00.000Z' }],
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/announcements/a1']}>
    <Routes><Route path="/announcements/:id" element={<AnnouncementDetailPage />} /></Routes>
  </MemoryRouter>
);

const WRITE_BUTTONS = ['Edit', 'Link interactions', 'Attach file', 'Unlink'];

describe('AnnouncementDetailPage', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  it('shows every field, links in a new tab, supporting interactions with date and description, and files', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: announcement() });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Synthetic Gazette' })).toBeInTheDocument();
    expect(screen.getByText('Synthetic Tower')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Investor')).toBeInTheDocument();
    expect(screen.getByText('Published', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^23 Apr 2026 · recorded 24 Oct 2026$/);
    const link = screen.getByRole('link', { name: 'https://news.example.test/a' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'https://archive.example.test/a' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('What it says OYSIPA did', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^Facilitated approvals$/);
    expect(screen.getByText('Site visit with investor')).toBeInTheDocument();
    expect(screen.getByText('1 Mar 2026 · Synthetic Tower')).toBeInTheDocument();
    expect(screen.getByText('copy.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    // Assigned Staff: write buttons, but no Delete.
    WRITE_BUTTONS.forEach((name) => expect(screen.getByRole('button', { name })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('Staff not assigned to the investor can read it but see no write buttons', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: announcement('someone-else') });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Synthetic Gazette' })).toBeInTheDocument();
    expect(screen.getByText('Site visit with investor')).toBeInTheDocument();
    [...WRITE_BUTTONS, 'Delete'].forEach((name) => expect(screen.queryByRole('button', { name })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('DG sees Delete; it needs a reason', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: announcement(undefined) });
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: { announcements: 1 } } });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Confirm delete' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'Duplicate');
    await userEvent.click(confirm);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/announcements/a1', { data: { reason: 'Duplicate' } }));
  });

  it("link interactions: lists the investor's other interactions and links the chosen ones", async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    vi.spyOn(apiClient, 'get').mockImplementation((url) => Promise.resolve({
      data: url === '/api/interactions/investors/inv1'
        ? [{ _id: 'l1', description: 'Site visit with investor' }, { _id: 'l2', description: 'Follow-up call', interactionDate: '2026-03-05T00:00:00.000Z' }]
        : announcement(),
    }));
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: announcement() });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Link interactions' }));
    const box = await screen.findByRole('checkbox', { name: /Follow-up call/ });
    // Already linked l1 is not offered again.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/announcements/a1/interactions', { interactions: ['l2'] }));
  });

  it('Unlink calls DELETE /api/announcements/a1/interactions/l1 and the row disappears', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: announcement() });
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { ...announcement(), supportingInteractions: [] } });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/announcements/a1/interactions/l1'));
    await waitFor(() => expect(screen.queryByText('Site visit with investor')).not.toBeInTheDocument());
    expect(screen.getByText('No interactions linked.')).toBeInTheDocument();
  });

  it('Unlink 404 (already unlinked) reloads the announcement', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    const get = vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: announcement() })
      .mockResolvedValue({ data: { ...announcement(), supportingInteractions: [] } });
    vi.spyOn(apiClient, 'delete').mockRejectedValue({ response: { status: 404, data: { message: 'Interaction not linked.' } } });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No interactions linked.')).toBeInTheDocument();
  });

  it('upload posts FormData to /api/announcements/a1/files and the page re-fetches; an existing library file says so', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: announcement() });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'f2', linkedExisting: true } });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Attach file' }));
    const file = new File(['%PDF-x'], 'copy2.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Announcement file'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/announcements/a1/files', expect.any(FormData)));
    expect(post.mock.calls[0][1].get('file').name).toBe('copy2.pdf');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('This file was already in the Evidence library; it is now linked here.')).toBeInTheDocument();
  });
});
