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
    // Wait for the refreshed list first, then check the dialog was actually closed and the list was fetched twice (initial + refresh)
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

  describe('errors keep the list (24 Oct 2026 fix)', () => {
    const serverError = (status, data) => Object.assign(new Error('Request failed'), { response: { status, data } });

    it('a failed delete shows the server message above the list; the list stays', async () => {
      const user = userEvent.setup();
      apiClient.delete.mockRejectedValueOnce(serverError(409, { message: 'This status is used by 2 project(s); move them to another status first.' }));
      render(<LifecycleStatusManager />);
      await user.click((await screen.findAllByRole('button', { name: /delete/i }))[0]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('This status is used by 2 project(s); move them to another status first.');
      expect(screen.getByText('Initial')).toBeInTheDocument();
      expect(screen.getByText('Lead')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create New Status' })).toBeInTheDocument();
    });

    it('after a failed save the dialog stays usable and a retry works', async () => {
      const user = userEvent.setup({ delay: null });
      apiClient.post.mockRejectedValueOnce(serverError(409, { message: 'A status with this name already exists.' }));
      render(<LifecycleStatusManager />);
      await user.click(await screen.findByRole('button', { name: 'Create New Status' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Name'), 'Lead');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await within(dialog).findByText('A status with this name already exists.')).toBeInTheDocument();
      expect(screen.getByText('Initial')).toBeInTheDocument();

      await user.clear(within(dialog).getByLabelText('Name'));
      await user.type(within(dialog).getByLabelText('Name'), 'Closed');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(apiClient.post).toHaveBeenLastCalledWith('/api/lifecycle-statuses', { name: 'Closed', description: '' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }, 15000);

    it('uses `msg` when the server sends no `message`, and the alert can be dismissed', async () => {
      const user = userEvent.setup();
      apiClient.delete.mockRejectedValueOnce(serverError(404, { msg: 'Lifecycle status not found' }));
      render(<LifecycleStatusManager />);
      await user.click((await screen.findAllByRole('button', { name: /delete/i }))[0]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(await screen.findByText('Lifecycle status not found')).toBeInTheDocument();
      // findByRole: the page is aria-hidden until the delete dialog has closed.
      await user.click(await screen.findByRole('button', { name: /close/i }));
      await waitFor(() => expect(screen.queryByText('Lifecycle status not found')).not.toBeInTheDocument());
      expect(screen.getByText('Initial')).toBeInTheDocument();
    });

    it('Save is disabled while the name is empty or blank', async () => {
      const user = userEvent.setup({ delay: null });
      render(<LifecycleStatusManager />);
      await user.click(await screen.findByRole('button', { name: 'Create New Status' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(within(dialog).getByLabelText('Name'), '   ');
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(within(dialog).getByLabelText('Name'), 'X');
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('a failed reorder shows the error and reloads the list', async () => {
      const user = userEvent.setup();
      apiClient.put.mockRejectedValueOnce(serverError(400, { message: 'orderedIds must list every status exactly once. Reload and try again.' }));
      render(<LifecycleStatusManager />);
      await user.click((await screen.findAllByRole('button', { name: /move down/i }))[0]);
      expect(await screen.findByText('orderedIds must list every status exactly once. Reload and try again.')).toBeInTheDocument();
      await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Initial');
      expect(items[1]).toHaveTextContent('Lead');
    });

    it('a failed load shows an alert and keeps Create available', async () => {
      apiClient.get.mockRejectedValueOnce(serverError(500, { message: 'Server Error' }));
      render(<LifecycleStatusManager />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load lifecycle statuses.');
      expect(screen.getByRole('button', { name: 'Create New Status' })).toBeInTheDocument();
    });
  });
});