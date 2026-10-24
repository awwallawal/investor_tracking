import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import IssueStatusForm from './IssueStatusForm';
import apiClient from '../api/api';

const issue = { _id: 'i1', status: 'Open', resolution: '' };
const NOTE_MSG = 'A resolution / reason note is required to set this status.';

const pickStatus = async (name) => {
  await userEvent.click(screen.getByRole('combobox', { name: /status/i }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('IssueStatusForm', () => {
  afterEach(() => vi.restoreAllMocks());

  // Owner rule (24 Oct 2026): Withdrawn and Closed unresolved need a reason, like Resolved.
  it.each(['Resolved', 'Closed unresolved', 'Withdrawn'])('%s needs a note: required field, helper text, Save disabled until filled', async (status) => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ...issue, status, resolution: 'Synthetic reason' } });
    const onSaved = vi.fn();
    render(<IssueStatusForm issue={issue} onSaved={onSaved} />);
    await pickStatus(status);
    const save = screen.getByRole('button', { name: 'Save status' });
    const note = screen.getByLabelText(/resolution \/ reason note/i);
    expect(note).toBeRequired();
    expect(save).toBeDisabled();
    expect(screen.getByText(NOTE_MSG)).toBeInTheDocument();
    fireEvent.change(note, { target: { value: '   ' } });
    expect(save).toBeDisabled();
    fireEvent.change(note, { target: { value: '  Synthetic reason ' } });
    expect(save).toBeEnabled();
    expect(screen.queryByText(NOTE_MSG)).not.toBeInTheDocument();
    await userEvent.click(save);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/issues/i1', { status, resolution: 'Synthetic reason' }));
    expect(onSaved).toHaveBeenCalled();
  }, 20000);

  it('In progress needs no note', async () => {
    render(<IssueStatusForm issue={issue} onSaved={vi.fn()} />);
    await pickStatus('In progress');
    expect(screen.getByLabelText(/resolution \/ reason note/i)).not.toBeRequired();
    expect(screen.queryByText(NOTE_MSG)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save status' })).toBeEnabled();
  });

  it('shows the server error', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValue({ response: { status: 400, data: { message: NOTE_MSG } } });
    render(<IssueStatusForm issue={issue} onSaved={vi.fn()} />);
    await pickStatus('In progress');
    await userEvent.click(screen.getByRole('button', { name: 'Save status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NOTE_MSG);
  });
});
