import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LifecycleStatusChanger from './LifecycleStatusChanger';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const stages = [
  { _id: 's1', name: 'Idea' },
  { _id: 's2', name: 'Lead' },
];
const project = { _id: 'p1', lifecycleStatus: 's1' };

const pickStage = async (user) => {
  await waitFor(() => expect(screen.getByRole('button', { name: /update stage/i })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: /update stage/i }));
  await user.click(await screen.findByTestId('stage-option-s2'));
};

describe('LifecycleStatusChanger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: stages });
  });

  it('shows the assignment message when the server returns 403', async () => {
    const user = userEvent.setup();
    const onStageUpdate = vi.fn();
    apiClient.put.mockRejectedValueOnce({ response: { status: 403, data: { msg: 'Forbidden' } } });

    render(<LifecycleStatusChanger project={project} onStageUpdate={onStageUpdate} />);
    await pickStage(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('You can only change projects of investors assigned to you');
    expect(onStageUpdate).not.toHaveBeenCalled();
  });

  it('shows a generic message for other errors', async () => {
    const user = userEvent.setup();
    apiClient.put.mockRejectedValueOnce({ response: { status: 500 } });

    render(<LifecycleStatusChanger project={project} onStageUpdate={vi.fn()} />);
    await pickStage(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to update stage');
    expect(alert).not.toHaveTextContent('assigned to you');
  });

  it('calls onStageUpdate and shows no alert on success', async () => {
    const user = userEvent.setup();
    const onStageUpdate = vi.fn();
    apiClient.put.mockResolvedValueOnce({ data: {} });

    render(<LifecycleStatusChanger project={project} onStageUpdate={onStageUpdate} />);
    await pickStage(user);

    await waitFor(() => expect(onStageUpdate).toHaveBeenCalled());
    expect(apiClient.put).toHaveBeenCalledWith('/api/projects/p1', { lifecycleStatus: 's2' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
