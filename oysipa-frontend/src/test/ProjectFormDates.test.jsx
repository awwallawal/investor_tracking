// Story 11.4b: "Date registered" and "Status changed on" in the project form,
// "First contact date" in the investor forms.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ProjectForm from '../components/ProjectForm';
import InvestorForm from '../components/InvestorForm';
import InvestorEditForm from '../components/InvestorEditForm';
import apiClient from '../api/api';

vi.mock('../api/api');

const STATUSES = [{ _id: 's1', name: 'Idea' }, { _id: 's2', name: 'Lead' }];

describe('ProjectForm dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: STATUSES });
  });

  it('create: empty "Date registered" is not sent; a filled one is', async () => {
    apiClient.post.mockResolvedValue({ data: {} });
    const { unmount } = render(<ProjectForm open onClose={vi.fn()} onSave={vi.fn()} investorId="inv1" />);
    fireEvent.change(screen.getByLabelText('Project Title'), { target: { value: 'P' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).not.toHaveProperty('dateRegistered');
    expect(screen.queryByLabelText(/status changed on/i)).not.toBeInTheDocument();
    unmount();

    render(<ProjectForm open onClose={vi.fn()} onSave={vi.fn()} investorId="inv1" />);
    fireEvent.change(screen.getByLabelText('Project Title'), { target: { value: 'P' } });
    fireEvent.change(screen.getByLabelText(/date registered/i), { target: { value: '2022-07-01' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(apiClient.post.mock.calls[1][1]).toHaveProperty('dateRegistered', '2022-07-01');
  });

  it('edit: "Status changed on" appears only when the status changes and is sent', async () => {
    apiClient.put.mockResolvedValue({ data: {} });
    const project = { _id: 'p1', projectTitle: 'P', lifecycleStatus: { _id: 's1', name: 'Idea' }, dateRegistered: '2022-07-01T00:00:00.000Z' };
    render(<ProjectForm open onClose={vi.fn()} onSave={vi.fn()} projectData={project} />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByLabelText(/date registered/i)).toHaveValue('2022-07-01');
    expect(screen.queryByLabelText(/status changed on/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /lifecycle status/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Lead' }));
    const changedOn = await screen.findByLabelText(/status changed on/i);
    fireEvent.change(changedOn, { target: { value: '2024-06-01' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    const body = apiClient.put.mock.calls[0][1];
    expect(body).toMatchObject({ lifecycleStatus: 's2', statusChangeDate: '2024-06-01' });
    // Unchanged date is not re-sent.
    expect(body).not.toHaveProperty('dateRegistered');
  }, 20000);

  it('shows the API message for a rejected date', async () => {
    apiClient.post.mockRejectedValue({ response: { status: 400, data: { message: 'Date registered cannot be in the future.' } } });
    render(<ProjectForm open onClose={vi.fn()} onSave={vi.fn()} investorId="inv1" />);
    // Let the statuses load first (loading them resets the form and its error).
    await userEvent.click(screen.getByRole('combobox', { name: /lifecycle status/i }));
    await screen.findByRole('option', { name: 'Lead' });
    await userEvent.keyboard('{Escape}');
    fireEvent.change(screen.getByLabelText(/date registered/i), { target: { value: '2099-01-01' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Date registered cannot be in the future.');
  });
});

describe('Investor forms: first contact date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Lead source is required on the new-investor form (11.5).
  const chooseLeadSource = async () => {
    await userEvent.click(screen.getByRole('combobox', { name: /lead source/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    // Sector is required too (11.14).
    await userEvent.click(screen.getByRole('combobox', { name: /^sector/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Agribusiness' }));
  };

  it('new investor: empty is not sent; a date is', async () => {
    apiClient.post.mockResolvedValue({ data: {} });
    const { unmount } = render(<InvestorForm open onClose={vi.fn()} onSave={vi.fn()} />);
    await chooseLeadSource();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).not.toHaveProperty('firstContactDate');
    unmount();

    render(<InvestorForm open onClose={vi.fn()} onSave={vi.fn()} />);
    await chooseLeadSource();
    fireEvent.change(screen.getByLabelText(/first contact date/i), { target: { value: '2024-02-14' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(apiClient.post.mock.calls[1][1]).toHaveProperty('firstContactDate', '2024-02-14');
  }, 20000);

  it('edit: shows the stored date and sends a correction', async () => {
    apiClient.put.mockResolvedValue({ data: {} });
    const investor = { _id: 'i1', investorName: 'X', sector: 'Tech', countryOfOrigin: 'NG', firstContactDate: '2023-09-09T00:00:00.000Z' };
    render(<InvestorEditForm open onClose={vi.fn()} onSave={vi.fn()} investorData={investor} />);
    const input = screen.getByLabelText(/first contact date/i);
    expect(input).toHaveValue('2023-09-09');
    fireEvent.change(input, { target: { value: '2023-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/api/investors/i1', { ...investor, firstContactDate: '2023-09-01' }));
  });
});
