import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import InvestorDirectoryPage from './InvestorDirectoryPage';
import apiClient from '../api/api';

describe('InvestorDirectoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders investor directory and fetched investors', async () => {
    const mockInvestors = [
      { _id: '1', investorName: 'John Doe', sector: 'Tech', countryOfOrigin: 'USA' },
      { _id: '2', investorName: 'Jane Smith', sector: 'Agriculture', countryOfOrigin: 'Canada' },
    ];

    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockInvestors });

    render(
      <MemoryRouter>
        <InvestorDirectoryPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Investor Directory')).toBeInTheDocument();

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/investors');
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });
});
