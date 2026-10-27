import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ViewTabs from './ViewTabs';
import apiClient from '../../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

// canonical: sorted params (enough for the component; pages use useListQuery's).
const canonical = (qs) => [...new URLSearchParams(qs || '').entries()].sort().map(([k, v]) => `${k}=${v}`).join('&');

const saved = [
  { _id: 'v1', name: 'My agro', query: 'sector=Agribusiness', shared: false, mine: true, canDelete: true, owner: { _id: 'u1', name: 'Me' } },
  { _id: 'v2', name: 'Walkthrough', query: 'incomplete=1&officer=me', shared: true, mine: false, canDelete: false, owner: { _id: 'u2', name: 'DG' } },
];

const renderTabs = (current = '') => {
  const onApply = vi.fn();
  render(<ViewTabs list="investors" current={canonical(current)} canonical={canonical} saveQuery={current} onApply={onApply} />);
  return onApply;
};

describe('ViewTabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem('token', tokenFor('Staff'));
  });
  afterEach(() => localStorage.removeItem('token'));

  it('All + built-in + saved/shared tabs; the tab matching the filters is selected; clicking applies its query', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: saved });
    const onApply = renderTabs('officer=me&incomplete=1');
    expect(await screen.findByRole('tab', { name: /Walkthrough/ })).toHaveAttribute('aria-selected', 'true');
    expect(getSpy).toHaveBeenCalledWith('/api/views', { params: { list: 'investors' } });
    expect(screen.getByRole('tab', { name: 'All investors' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTitle('Shared with everyone')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'No contact in 60+ days' }));
    expect(onApply).toHaveBeenCalledWith('noContactDays=60');
    await userEvent.click(screen.getByRole('tab', { name: 'My agro' }));
    expect(onApply).toHaveBeenLastCalledWith('sector=Agribusiness');
  });

  it('Staff saves a view (no share option); the list reloads', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'v3' } });
    renderTabs('sector=Agribusiness&sort=-name');
    await userEvent.click(screen.getByRole('button', { name: '+ Save this view' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Share with everyone')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/View name/), { target: { value: 'My agro' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save view' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/views', {
      list: 'investors', name: 'My agro', query: 'sector=Agribusiness&sort=-name', shared: false,
    }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });

  it('DG can share when saving, and stop sharing / delete a shared view', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ ...saved[1], canDelete: true }] });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: 1 } });
    renderTabs('incomplete=1&officer=me');
    await screen.findByRole('tab', { name: /Walkthrough/ });

    await userEvent.click(screen.getByRole('button', { name: '+ Save this view' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/View name/), { target: { value: 'Walkthrough 2' } });
    await userEvent.click(within(dialog).getByLabelText('Share with everyone'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save view' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/views', expect.objectContaining({ shared: true })));

    await userEvent.click(await screen.findByRole('button', { name: 'Options for the view Walkthrough' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Stop sharing' }));
    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('/api/views/v2', { shared: false }));

    await userEvent.click(screen.getByRole('button', { name: 'Options for the view Walkthrough' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete view' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete view' }));
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('/api/views/v2'));
  });

  it('a view matches on filters and sort; a saved view wins over a built-in with the same query; canEdit false → no share option', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [
        { _id: 'v9', name: 'Mine sorted', query: 'officer=me&sort=-name', shared: false, mine: true, canEdit: true, canDelete: true },
        { _id: 'v8', name: 'Same as built-in', query: 'officer=me', shared: true, mine: false, canEdit: false, canDelete: true },
      ],
    });
    const { rerender } = render(<ViewTabs list="investors" current={canonical('officer=me&sort=-name')} canonical={canonical} saveQuery="" onApply={() => {}} />);
    expect(await screen.findByRole('tab', { name: 'Mine sorted' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Assigned to me' })).toHaveAttribute('aria-selected', 'false');
    rerender(<ViewTabs list="investors" current={canonical('officer=me')} canonical={canonical} saveQuery="" onApply={() => {}} />);
    expect(screen.getByRole('tab', { name: /Same as built-in/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Options for the view Same as built-in' }));
    expect(screen.queryByRole('menuitem', { name: /sharing|Share/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete view' })).toBeInTheDocument();
  });

  it('Staff: no options on a shared view they do not own', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: saved });
    renderTabs('incomplete=1&officer=me');
    await screen.findByRole('tab', { name: /Walkthrough/ });
    expect(screen.queryByRole('button', { name: /Options for the view/ })).not.toBeInTheDocument();
  });

  it('a failed views load still shows All and the built-in tabs', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTabs('');
    expect(screen.getByRole('tab', { name: 'All investors' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Assigned to me' })).toBeInTheDocument();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
  });
});
