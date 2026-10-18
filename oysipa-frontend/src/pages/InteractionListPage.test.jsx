import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InteractionListPage from './InteractionListPage';
import apiClient from '../api/api';

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
