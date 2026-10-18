import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders old records without codes as before (no chips)', async () => {
    apiClient.get.mockResolvedValue({ data: [{ _id: 'o1', description: 'Old', category: 'Meeting', loggedBy: { name: 'A' }, createdAt: '2023-01-01T00:00:00.000Z' }] });
    render(<InteractionLogList projectId={projectId} />);
    expect(await screen.findByText('Old')).toBeInTheDocument();
    expect(screen.getByText(/Category: Meeting/)).toBeInTheDocument();
    expect(screen.queryByText('Credit linkage')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tag services' })).not.toBeInTheDocument();
  });

  it('investor timeline: fetches the investor URL, shows code chips with wording tooltip, credit chip and project title', async () => {
    apiClient.get.mockResolvedValue({
      data: [
        { _id: 'a', description: 'Briefing letter sent to NIPC', category: 'Email', serviceCodes: ['M4'], creditLinkage: true, loggedBy: { name: 'A' }, createdAt: '2026-10-18T00:00:00.000Z' },
        { _id: 'b', description: 'Project call', category: 'Call', project: { _id: 'p1', projectTitle: 'Agro Hub' }, loggedBy: { name: 'A' }, createdAt: '2026-10-17T00:00:00.000Z' },
      ],
    });
    render(<InteractionLogList investorId="inv-1" />);

    expect(await screen.findByText('Briefing letter sent to NIPC')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/interactions/investors/inv-1');
    expect(screen.getByText('M4')).toBeInTheDocument();
    expect(screen.getByText('Credit linkage')).toBeInTheDocument();
    expect(screen.getByText('Project: Agro Hub')).toBeInTheDocument();

    await userEvent.hover(screen.getByText('M4'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Proactively promote priority sectors through network of intermediaries');
  }, 20000);

  it('shows the investor empty message', async () => {
    apiClient.get.mockResolvedValue({ data: [] });
    render(<InteractionLogList investorId="inv-1" />);
    expect(await screen.findByText('No interactions logged for this investor yet.')).toBeInTheDocument();
  });

  it('Tag services: PATCHes only codes and flag, then shows the chip with the category unchanged', async () => {
    apiClient.get.mockResolvedValue({ data: [{ _id: 'o1', description: 'Old meeting', category: 'Meeting', loggedBy: { name: 'A' }, createdAt: '2023-01-01T00:00:00.000Z' }] });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { _id: 'o1', serviceCodes: ['A8'], creditLinkage: true, description: 'Old meeting', category: 'Meeting' } });
    render(<InteractionLogList investorId="inv-1" canWrite />);

    await userEvent.click(await screen.findByRole('button', { name: 'Tag services' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /saber services/i }));
    await userEvent.click(await screen.findByText('A8'));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /credit linkage/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save tags' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/interactions/o1', { serviceCodes: ['A8'], creditLinkage: true }));
    expect(await screen.findByText('A8')).toBeInTheDocument();
    expect(screen.getByText(/Category: Meeting/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 20000);

  it('Tag services: shows the assignment message on 403', async () => {
    apiClient.get.mockResolvedValue({ data: [{ _id: 'o1', description: 'Old', category: 'Meeting', loggedBy: { name: 'A' }, createdAt: '2023-01-01T00:00:00.000Z' }] });
    vi.spyOn(apiClient, 'patch').mockRejectedValue({ response: { status: 403, data: { msg: 'Forbidden' } } });
    render(<InteractionLogList investorId="inv-1" canWrite />);

    await userEvent.click(await screen.findByRole('button', { name: 'Tag services' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save tags' }));
    expect(await screen.findByText('You can only tag interactions of investors assigned to you')).toBeInTheDocument();
  }, 20000);
  it('Delete: hidden without canDelete', async () => {
    apiClient.get.mockResolvedValue({ data: [{ _id: 'd1', description: 'Test log', category: 'Meeting', loggedBy: { name: 'A' }, createdAt: '2023-01-01T00:00:00.000Z' }] });
    render(<InteractionLogList investorId="inv-1" canWrite />);
    expect(await screen.findByText('Test log')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('Delete: confirm calls DELETE and removes the entry', async () => {
    apiClient.get.mockResolvedValue({
      data: [
        { _id: 'd1', description: 'Test log', category: 'Meeting', loggedBy: { name: 'A' }, createdAt: '2023-01-01T00:00:00.000Z' },
        { _id: 'd2', description: 'Keep me', category: 'Call', loggedBy: { name: 'A' }, createdAt: '2023-01-02T00:00:00.000Z' },
      ],
    });
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: { interactions: 1 } } });
    render(<InteractionLogList projectId={projectId} canDelete />);

    expect(await screen.findByText('Test log')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Are you sure? This removes evidence.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Logged twice');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('/api/interactions/d1', { data: { reason: 'Logged twice' } }));
    await waitFor(() => expect(screen.queryByText('Test log')).not.toBeInTheDocument());
    expect(screen.getByText('Keep me')).toBeInTheDocument();
  }, 20000);

  it('Delete: no reason → DELETE without a body; API error keeps the entry', async () => {
    apiClient.get.mockResolvedValue({ data: [{ _id: 'd1', description: 'Test log', category: 'Meeting', loggedBy: { name: 'A' }, createdAt: '2023-01-01T00:00:00.000Z' }] });
    const delSpy = vi.spyOn(apiClient, 'delete').mockRejectedValue({ response: { status: 500, data: { message: 'Could not write the audit record. Nothing was deleted.' } } });
    render(<InteractionLogList projectId={projectId} canDelete />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('/api/interactions/d1', undefined));
    expect(await screen.findByText('Could not write the audit record. Nothing was deleted.')).toBeInTheDocument();
    expect(screen.getAllByText('Test log').length).toBeGreaterThan(0);
  }, 20000);
});
