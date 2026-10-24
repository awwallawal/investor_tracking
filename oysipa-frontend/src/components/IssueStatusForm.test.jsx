import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import IssueStatusForm from './IssueStatusForm';
import apiClient from '../api/api';

const issue = { _id: 'i1', status: 'Open', resolution: '' };

describe('IssueStatusForm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolving needs a resolution note: Save is disabled until one is typed', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ...issue, status: 'Resolved', resolution: 'Title issued' } });
    const onSaved = vi.fn();
    render(<IssueStatusForm issue={issue} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Resolved' }));
    const save = screen.getByRole('button', { name: 'Save status' });
    expect(save).toBeDisabled();
    expect(screen.getByText('A resolution note is required to resolve an issue.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/resolution note/i), '   ');
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/resolution note/i), 'Title issued');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/issues/i1', { status: 'Resolved', resolution: 'Title issued' }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows the server error', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValue({ response: { status: 400, data: { message: 'A resolution note is required to resolve an issue.' } } });
    render(<IssueStatusForm issue={issue} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'In progress' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A resolution note is required');
  });
});
