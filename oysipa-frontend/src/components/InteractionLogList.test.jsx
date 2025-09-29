import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import InteractionLogList from './InteractionLogList';
import apiClient from '../api/api';

describe('InteractionLogList', () => {
  const projectId = 'test-project-123';

  beforeEach(() => {
    vi.spyOn(apiClient, 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show loading state initially', () => {
    render(<InteractionLogList projectId={projectId} />);
    expect(screen.getByText('Loading logs...')).toBeInTheDocument();
  });

  it('should display interaction logs when fetch is successful', async () => {
    const mockLogs = [
      {
        _id: '1',
        description: 'Second log entry',
        category: 'Email',
        loggedBy: { name: 'Jane Doe' },
        createdAt: '2023-10-27T12:00:00.000Z',
      },
      {
        _id: '2',
        description: 'First log entry',
        category: 'Meeting',
        loggedBy: { name: 'John Doe' },
        createdAt: '2023-10-26T10:00:00.000Z',
      },
    ];
    apiClient.get.mockResolvedValue({ data: mockLogs });

    render(<InteractionLogList projectId={projectId} />);

    await waitFor(() => {
      expect(screen.getByText('Second log entry')).toBeInTheDocument();
      expect(screen.getByText(/By: Jane Doe/)).toBeInTheDocument();
      expect(screen.getByText('First log entry')).toBeInTheDocument();
      expect(screen.getByText(/By: John Doe/)).toBeInTheDocument();
    });

    expect(apiClient.get).toHaveBeenCalledWith(`/api/projects/${projectId}/interactions`);
  });

  it('should display a document link if documentUrl exists', async () => {
    const mockLogsWithDoc = [
      {
        _id: '3',
        description: 'Log with document',
        category: 'Other',
        loggedBy: { name: 'Test User' },
        createdAt: '2023-10-28T10:00:00.000Z',
        documentUrl: 'http://example.com/test-doc.pdf',
      },
    ];
    apiClient.get.mockResolvedValue({ data: mockLogsWithDoc });

    render(<InteractionLogList projectId={projectId} />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /view document/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'http://example.com/test-doc.pdf');
    });
  });

  it('should display a message when no logs are found', async () => {
    apiClient.get.mockResolvedValue({ data: [] });

    render(<InteractionLogList projectId={projectId} />);

    await waitFor(() => {
      expect(screen.getByText('No interaction logs found for this project.')).toBeInTheDocument();
    });
  });

  it('should display an error message when fetch fails', async () => {
    apiClient.get.mockRejectedValue(new Error('API Error'));

    render(<InteractionLogList projectId={projectId} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch interaction logs.')).toBeInTheDocument();
    });
  });
});
