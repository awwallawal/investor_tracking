import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;
import InteractionListPage from './InteractionListPage';
import apiClient from '../api/api';

describe('InteractionListPage — dates and documents (11.4b)', () => {
  const docLog = {
    _id: 'l9', description: 'Paper meeting', category: 'Meeting', investor: { _id: 'i1', investorName: 'NIPC Contact' },
    loggedBy: { name: 'Officer' }, interactionDate: '2025-03-18T00:00:00.000Z', createdAt: '2026-10-19T09:00:00.000Z',
    documentUrl: 'https://res.cloudinary.com/demo/image/upload/a.pdf',
    documents: [{ _id: 'd1', fileName: 'scan.pdf', documentDate: '2025-03-18T00:00:00.000Z', uploadedAt: '2026-10-19T09:01:00.000Z' }],
  };

  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [docLog] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('shows the happened date with the recorded note, and exactly one legacy View Document link', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    render(<InteractionListPage />);
    expect(await screen.findByText(/on 18 Mar 2025 · recorded 19 Oct 2026/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /view document/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', docLog.documentUrl);
  });

  it('Staff sees no Attach/Remove', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    render(<InteractionListPage />);
    expect(await screen.findByRole('button', { name: 'View scan.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove scan.pdf' })).not.toBeInTheDocument();
  });

  it('Director-General sees Attach and Remove', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    render(<InteractionListPage />);
    expect(await screen.findByRole('button', { name: 'Attach document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove scan.pdf' })).toBeInTheDocument();
  });
});

describe('InteractionListPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the investor name for logs without a project, and shows code and credit chips', async () => {
    apiClient.get.mockResolvedValue({
      data: [
        {
          _id: 'l1', description: 'Briefing letter sent to NIPC', category: 'Email', investor: { _id: 'i1', investorName: 'NIPC Contact' },
          serviceCodes: ['M4', 'A8'], creditLinkage: true, loggedBy: { name: 'Officer' }, createdAt: '2026-10-18T10:00:00.000Z',
        },
        {
          _id: 'l2', description: 'Project call', category: 'Call', project: { _id: 'p1', projectTitle: 'Agro Hub' },
          loggedBy: { name: 'Officer' }, createdAt: '2026-10-17T10:00:00.000Z',
        },
      ],
    });

    render(<InteractionListPage />);

    expect(await screen.findByText('NIPC Contact - Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(screen.getByText('Agro Hub - Project call')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/interactions');
    expect(screen.getByText('M4')).toBeInTheDocument();
    expect(screen.getByText('A8')).toBeInTheDocument();
    expect(screen.getAllByText('Credit linkage')).toHaveLength(1);
  });

  it('shows N/A when there is neither project nor investor', async () => {
    apiClient.get.mockResolvedValue({
      data: [{ _id: 'l3', description: 'Orphan', category: 'Other', loggedBy: { name: 'X' }, createdAt: '2026-10-17T10:00:00.000Z' }],
    });
    render(<InteractionListPage />);
    expect(await screen.findByText('N/A - Orphan')).toBeInTheDocument();
    expect(screen.queryByText('Credit linkage')).not.toBeInTheDocument();
  });
});
