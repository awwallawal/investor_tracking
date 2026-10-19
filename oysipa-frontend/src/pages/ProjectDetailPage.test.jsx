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
