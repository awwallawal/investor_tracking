// Evidence library folder page: Tag saves (and the sidebar count drops), the
// Untagged filter, Open through the signed link API, and DG/Admin-only actions.
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import EvidenceFolderPage from './EvidenceFolderPage';
import Sidebar from '../components/Sidebar';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const folder = { _id: 'fold-1', name: 'Forum 2025', parent: { _id: 'top-1', name: 'Programmes and events' } };
const untaggedFile = {
  _id: 'file-1', fileName: 'forum-photo.jpg', size: 2048, uploadedAt: '2026-10-23T09:00:00.000Z', documentDate: '2025-05-15T00:00:00.000Z', links: [],
};
const taggedFile = {
  _id: 'file-2', fileName: 'programme.pdf', size: 4096, uploadedAt: '2026-10-23T09:00:00.000Z',
  links: [{ _id: 'link-1', investor: { _id: 'inv-1', investorName: 'Acme Agro' }, serviceCodes: ['M4'] }],
};

let untaggedCount;
let popup;

const mockApi = () => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/evidence/untagged-count') return { data: { count: untaggedCount } };
    if (url === '/api/views') return { data: [] };
    if (url === '/api/evidence/folders/fold-1/files' && config?.params?.untagged === '1') return { data: { folder, files: [untaggedFile] }, headers: { 'x-total-count': '2' } };
    if (url === '/api/evidence/folders/fold-1/files' && config?.params?.q) return { data: { folder, files: [taggedFile] }, headers: { 'x-total-count': '2' } };
    if (url === '/api/evidence/folders/fold-1/files') return { data: { folder, files: [untaggedFile, taggedFile] }, headers: { 'x-total-count': '2' } };
    if (url === '/api/investors') return { data: [{ _id: 'inv-2', investorName: 'Bower Tower', assignedTo: 'someone-else' }, { _id: 'inv-1', investorName: 'Acme Agro', assignedTo: 'u1' }] };
    if (url === '/api/evidence/folders/top-1/files') return { data: { folder: { _id: 'top-1', name: 'Programmes and events', parent: null }, subfolders: [{ _id: 'fold-1', name: 'Forum 2025', fileCount: 2, untaggedCount: 1 }], files: [] } };
    if (url === '/api/interactions/investors/inv-2') throw Object.assign(new Error('500'), { response: { status: 500, data: { message: 'Server Error' } } });
    if (url === '/api/interactions/investors/inv-1') return { data: [{ _id: 'log-1', description: 'Forum meeting', interactionDate: '2025-05-15T00:00:00.000Z' }] };
    if (url === '/api/evidence/files/file-1/link') return { data: { url: 'https://signed.example.test/file-1' } };
    throw new Error(`unexpected GET ${url}`);
  });
};

let location;
const LocationProbe = () => {
  location = useLocation();
  return null;
};

const renderPage = (start = '/evidence/fold-1') => render(
  <MemoryRouter initialEntries={[start]}>
    <LocationProbe />
    <Sidebar mobileOpen={false} onDrawerToggle={() => {}} />
    <Routes>
      <Route path="/evidence/:folderId" element={<EvidenceFolderPage />} />
    </Routes>
  </MemoryRouter>
);

describe('EvidenceFolderPage', () => {
  beforeEach(() => {
    untaggedCount = 68;
    mockApi();
    popup = { location: { href: '' }, close: vi.fn(), opener: window };
    vi.spyOn(window, 'open').mockImplementation(() => popup);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('lists files with their date (upload date when empty) and tag chips', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    const row = (await screen.findByText('forum-photo.jpg')).closest('li');
    expect(within(row).getByText('15 May 2025')).toBeInTheDocument();
    expect(within(row).getByText('Untagged')).toBeInTheDocument();
    const tagged = screen.getByText('programme.pdf').closest('li');
    expect(within(tagged).getByText('23 Oct 2026')).toBeInTheDocument();
    expect(within(tagged).getByText('Acme Agro · M4')).toBeInTheDocument();
  });

  it('Staff sees Open and Tag but no Delete, no Add files and no tag removal', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    await screen.findByText('forum-photo.jpg');
    expect(screen.getByRole('button', { name: 'Open forum-photo.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag forum-photo.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add files' })).not.toBeInTheDocument();
    expect(screen.getByText('Acme Agro · M4').closest('.MuiChip-root').querySelector('.MuiChip-deleteIcon')).toBeNull();
  });

  it('DG/Admin sees Delete and Add files', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await screen.findByText('forum-photo.jpg');
    expect(screen.getByRole('button', { name: 'Delete forum-photo.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument();
  });

  it('Untagged only writes ?untagged=1 and asks the API for it', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    await screen.findByText('programme.pdf');
    expect(screen.getByText('2 of 2 files')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Untagged only' }));
    expect(location.search).toBe('?untagged=1');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/evidence/folders/fold-1/files', { params: { untagged: '1' } }));
    await waitFor(() => expect(screen.queryByText('programme.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('forum-photo.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Untagged only' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('?q= and ?untagged=1 on load filter the request (global search link) and show chips', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage('/evidence/fold-1?q=programme.pdf&type=pdf,video');
    expect(await screen.findByText('programme.pdf')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/evidence/folders/fold-1/files', { params: { q: 'programme.pdf', type: 'pdf' } });
    expect(screen.queryByText('forum-photo.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('Search: "programme.pdf"')).toBeInTheDocument();
    expect(screen.getByText('Type: PDF')).toBeInTheDocument();
    expect(screen.getByLabelText('Search files')).toHaveValue('programme.pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(location.search).toBe(''));
    expect(await screen.findByText('forum-photo.jpg')).toBeInTheDocument();
  });

  it('type facet and sort land in the URL and the request', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage('/evidence/fold-1?untagged=1');
    await screen.findByText('forum-photo.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Type' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Image/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/evidence/folders/fold-1/files', { params: { untagged: '1', type: 'image' } }));
    await userEvent.click(screen.getByRole('button', { name: /Sort:/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Name, A–Z' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/evidence/folders/fold-1/files', { params: { untagged: '1', type: 'image', sort: 'name' } }));
    expect(location.search).toBe('?untagged=1&type=image&sort=name');
  });

  it('Export this view downloads the folder view with its filters', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const created = vi.fn(() => 'blob:x');
    const revoked = vi.fn();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
    renderPage('/evidence/fold-1?untagged=1');
    await screen.findByText('forum-photo.jpg');
    apiClient.get.mockImplementationOnce(async () => ({ data: new Blob(['a,b']), headers: { 'content-disposition': 'attachment; filename="oysipa-evidence-2026-10-27.csv"' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Export this view (CSV)' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/export/evidence', { params: { untagged: '1', folder: 'fold-1' }, responseType: 'blob' }));
    await waitFor(() => expect(created).toHaveBeenCalled());
  });

  it('Open opens a tab, then points it at the signed link from the API', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open forum-photo.jpg' }));
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(popup.location.href).toBe('https://signed.example.test/file-1'));
    expect(apiClient.get).toHaveBeenCalledWith('/api/evidence/files/file-1/link');
  });

  it('Tag saves investor and interaction; the sidebar badge drops from 68 to 67', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async () => {
      untaggedCount = 67;
      return { data: { ...untaggedFile, links: [{ _id: 'link-9', investor: { investorName: 'Acme Agro' } }] } };
    });
    renderPage();
    expect(await screen.findByText('68')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag forum-photo.jpg' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Investor/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Acme Agro' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Interaction/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Forum meeting/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save tag' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/evidence/files/file-1/links', {
      investor: 'inv-1', interaction: 'log-1', serviceCodes: [],
    }));
    expect(await screen.findByText('67')).toBeInTheDocument();
  }, 30000);

  it('a top-level folder shows its subfolders as links; the breadcrumb parent is a link', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const { unmount } = renderPage('/evidence/top-1');
    const sub = await screen.findByRole('link', { name: /Forum 2025 · 2 files · 1 untagged/ });
    expect(sub).toHaveAttribute('href', '/evidence/fold-1');
    unmount();
    renderPage();
    expect(await screen.findByRole('link', { name: 'Programmes and events' })).toHaveAttribute('href', '/evidence/top-1');
  });

  it('Tag dialog: Staff see only investors assigned to them, the current tags, no credit-linkage box', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag programme.pdf' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Acme Agro · M4')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Credit linkage/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Investor/ }));
    expect(await screen.findByRole('option', { name: 'Acme Agro' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bower Tower' })).not.toBeInTheDocument();
  });

  it('Tag dialog: DG sees every investor; a failed interactions load shows an error', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag forum-photo.jpg' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Investor/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bower Tower' }));
    expect(await within(dialog).findByText('Server Error')).toBeInTheDocument();
    expect(within(dialog).queryByText('No interactions for this investor')).not.toBeInTheDocument();
  });
});
