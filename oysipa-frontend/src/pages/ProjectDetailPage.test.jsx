import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetailPage from './ProjectDetailPage';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const project = { _id: 'p1', projectTitle: 'Agro Hub', investor: { _id: 'inv1', investorName: 'Acme Ltd' }, lifecycleStatus: { name: 'Idea' } };
const logs = [
  { _id: 'l1', description: 'Site visit', category: 'Meeting', loggedBy: { name: 'Me' }, createdAt: '2026-10-18T10:00:00.000Z' },
];

const renderPage = () => render(
  <MemoryRouter initialEntries={['/projects/p1']}>
    <Routes>
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
    </Routes>
  </MemoryRouter>
);

describe('ProjectDetailPage — write actions (Attach document, Tag services)', () => {
  const projectFor = (assignedTo) => ({ ...project, investor: { ...project.investor, assignedTo } });
  const setup = (proj) => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/projects/p1') return Promise.resolve({ data: proj });
      if (url === '/api/projects/p1/interactions') return Promise.resolve({ data: logs });
      return Promise.resolve({ data: [] });
    });
  };

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => localStorage.removeItem('token'));

  it('assigned Staff sees Attach document and Tag services', async () => {
    setup(projectFor('u1'));
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag services' })).toBeInTheDocument();
  });

  it('unassigned Staff sees neither', async () => {
    setup(projectFor('someone-else'));
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tag services' })).not.toBeInTheDocument();
  });

  it('unknown role sees neither', async () => {
    setup(projectFor('u1'));
    localStorage.setItem('token', tokenFor('Visitor'));
    renderPage();
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tag services' })).not.toBeInTheDocument();
  });

  it('Director-General sees both', async () => {
    setup(projectFor(undefined));
    localStorage.setItem('token', tokenFor('Director-General'));
    renderPage();
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag services' })).toBeInTheDocument();
  });
});

describe('ProjectDetailPage — announcements section (11.8)', () => {
  const projectFor = (assignedTo) => ({ ...project, investor: { ...project.investor, assignedTo } });
  const setup = (proj) => {
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/api/projects/p1') return Promise.resolve({ data: proj });
      if (url === '/api/announcements' && config?.params?.project === 'p1') {
        return Promise.resolve({
          data: [{ _id: 'a1', outlet: 'Synthetic Gazette', oysipaNamed: true, announcementDate: '2026-04-23T00:00:00.000Z', createdAt: '2026-04-23T10:00:00.000Z' }],
        });
      }
      return Promise.resolve({ data: [] });
    });
  };

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => localStorage.removeItem('token'));

  it("lists the project's announcements; assigned Staff can register one", async () => {
    setup(projectFor('u1'));
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Synthetic Gazette' })).toHaveAttribute('href', '/announcements/a1');
    expect(screen.getByText('OYSIPA named')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register announcement' })).toBeInTheDocument();
  });

  it('unassigned Staff sees them but cannot register', async () => {
    setup(projectFor('someone-else'));
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Synthetic Gazette' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register announcement' })).not.toBeInTheDocument();
  });
});

describe('ProjectDetailPage — interaction Delete (DG/Admin only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/projects/p1') return Promise.resolve({ data: project });
      if (url === '/api/projects/p1/interactions') return Promise.resolve({ data: logs });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('Staff sees no Delete button', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s sees one Delete per interaction', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderPage();
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });
});

describe('ProjectDetailPage — value with currency (11.5)', () => {
  afterEach(() => localStorage.removeItem('token'));
  it.each([
    [{ estimatedValue: 10000000, currency: 'USD' }, 'US$10,000,000'],
    [{ estimatedValue: 2500000000, currency: 'NGN' }, '₦2,500,000,000'],
    [{ estimatedValue: 5000 }, '₦5,000'],
  ])('%o → %s', async (fields, shown) => {
    apiClient.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/projects/p1' ? { ...project, ...fields } : [] }));
    renderPage();
    expect(await screen.findByText(shown)).toBeInTheDocument();
  });
});
