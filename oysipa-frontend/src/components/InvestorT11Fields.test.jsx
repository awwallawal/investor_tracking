// Story 11.5: lead source, organisation type and "Referred by" in the investor forms.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InvestorForm from './InvestorForm';
import InvestorEditForm from './InvestorEditForm';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const intermediaries = [{ _id: 'nipc', investorName: 'NIPC Synthetic', organisationType: 'Intermediary' }];

describe('New-investor form (T11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: intermediaries });
    apiClient.post.mockResolvedValue({ data: {} });
  });

  it('lead source is required; nothing is sent without it', async () => {
    render(<InvestorForm open onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a lead source.');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('"Unknown (pre-T11)" is not offered', async () => {
    render(<InvestorForm open onClose={vi.fn()} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /lead source/i }));
    expect(await screen.findByRole('option', { name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Unknown (pre-T11)' })).not.toBeInTheDocument();
  });

  it('"Referred by" appears only for Intermediary referral and lists Intermediary records', async () => {
    const onSave = vi.fn();
    render(<InvestorForm open onClose={vi.fn()} onSave={onSave} />);
    expect(screen.queryByRole('combobox', { name: /referred by/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /lead source/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Intermediary referral' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/investors', { params: { organisationType: 'Intermediary' } }));

    await userEvent.click(await screen.findByRole('combobox', { name: /referred by/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'NIPC Synthetic' }));
    await userEvent.click(screen.getByRole('combobox', { name: /organisation type/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Promotion agent' }));
    fireEvent.change(screen.getByLabelText(/^website/i), { target: { value: 'https://x.example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).toMatchObject({
      leadSource: 'Intermediary referral', referredBy: 'nipc', organisationType: 'Promotion agent', website: 'https://x.example.test',
    });
    expect(onSave).toHaveBeenCalled();
  }, 20000);

  it('referredBy is not sent for other lead sources', async () => {
    render(<InvestorForm open onClose={vi.fn()} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /lead source/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).not.toHaveProperty('referredBy');
    expect(apiClient.post.mock.calls[0][1]).toMatchObject({ leadSource: 'Other', organisationType: 'Investor' });
  });
});

describe('Edit form: lead source lock', () => {
  const investor = {
    _id: 'i1', investorName: 'Edit Co', sector: 'Agro', countryOfOrigin: 'NG', leadSource: 'Unknown (pre-T11)', organisationType: 'Investor', notes: 'Old note',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.put.mockResolvedValue({ data: {} });
  });
  afterEach(() => localStorage.removeItem('token'));

  it('Staff: lead source is read-only; notes, website and head office are editable', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    render(<InvestorEditForm open onClose={vi.fn()} onSave={vi.fn()} investorData={investor} />);
    const lead = screen.getByRole('combobox', { name: /lead source/i });
    expect(lead).toHaveAttribute('aria-disabled', 'true');
    expect(lead).toHaveTextContent('Unknown (pre-T11)');
    expect(screen.getByText(/Only the DG or Portal-Admin can correct it/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^notes/i), { target: { value: 'New note' } });
    fireEvent.change(screen.getByLabelText(/head office/i), { target: { value: 'Ibadan' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put.mock.calls[0][1]).toMatchObject({ notes: 'New note', headOffice: 'Ibadan', leadSource: 'Unknown (pre-T11)' });
  });

  it.each(['Director-General', 'Portal-Admin'])('%s can correct the lead source', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    render(<InvestorEditForm open onClose={vi.fn()} onSave={vi.fn()} investorData={investor} />);
    const lead = screen.getByRole('combobox', { name: /lead source/i });
    expect(lead).not.toHaveAttribute('aria-disabled');
    await userEvent.click(lead);
    await userEvent.click(await screen.findByRole('option', { name: 'Media campaign or advertising' }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put.mock.calls[0][1]).toMatchObject({ leadSource: 'Media campaign or advertising' });
  });
});
