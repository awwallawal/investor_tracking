import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import LifecycleStatusManager from './LifecycleStatusManager';
import apiClient from '../api/api';

// ✅ Ensure full module mock before imports are used
vi.mock('../api/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('LifecycleStatusManager', () => {
  const mockStatuses = [
    { _id: '1', name: 'Initial', description: 'Initial stage' },
    { _id: '2', name: 'Lead', description: 'Lead stage' },
    { _id: '3', name: 'Prospect', description: 'Prospect stage' },
  ];

  beforeEach(() => {
    apiClient.get.mockResolvedValue({ data: mockStatuses });
    apiClient.post.mockResolvedValue({ data: {} });
    apiClient.put.mockResolvedValue({ data: {} });
    apiClient.delete.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and displays lifecycle statuses on mount', async () => {
    render(<LifecycleStatusManager />);
    expect(await screen.findByText('Initial')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
  });

  it('opens a dialog and creates a new status', async () => {
    const user = userEvent.setup({ delay: null });
    render(<LifecycleStatusManager />);

    await user.click(await screen.findByRole('button', { name: 'Create New Status' }));

    // Wait for the create dialog to be open before typing into it
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Create Lifecycle Status')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'New Status');
    await user.type(within(dialog).getByLabelText('Description'), 'New Description');

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/lifecycle-statuses', {
        name: 'New Status',
        description: 'New Description',
      });
    });
    // Wait for the refreshed list first (the component shows only "Loading..." while refetching),
    // then check the dialog was actually closed and the list was fetched twice (initial + refresh)
    expect(await screen.findByText('Initial')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  }, 15000); // MUI dialog + typing measured 4.8-6.6 s under full-suite load on this laptop

  it('opens a dialog and updates an existing status', async () => {
    const user = userEvent.setup();
    render(<LifecycleStatusManager />);

    const editButtons = await screen.findAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]);

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Status');

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/api/lifecycle-statuses/1', {
        _id: '1',
        name: 'Updated Status',
        description: 'Initial stage',
      });
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

      it('opens a confirmation and deletes a status', async () => {
      const user = userEvent.setup();
      render(<LifecycleStatusManager />);
  
      const deleteButtons = await screen.findAllByRole('button', { name: /delete/i });
      await user.click(deleteButtons[0]);
  
      expect(screen.getByText('Are you sure you want to delete "Initial"?')).toBeInTheDocument();
  
      await user.click(screen.getByRole('button', { name: 'Delete' }));
  
      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/api/lifecycle-statuses/1');
        expect(apiClient.get).toHaveBeenCalledTimes(2);
      });
    });
  
    it('reorders statuses when using the arrow buttons', async () => {
      const user = userEvent.setup();
      render(<LifecycleStatusManager />);
  
      const downButtons = await screen.findAllByRole('button', { name: /move down/i });
      await user.click(downButtons[0]);
  
      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/api/lifecycle-statuses/reorder', {
          orderedIds: ['2', '1', '3'],
        });    });
  });
});