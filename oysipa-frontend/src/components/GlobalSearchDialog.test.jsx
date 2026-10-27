import React, { useState } from 'react';
import {
  render, screen, fireEvent, waitFor, within, act,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import GlobalSearchDialog from './GlobalSearchDialog';
import apiClient from '../api/api';

const Location = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
};

const Harness = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="open">{open ? 'open' : 'closed'}</span>
      <GlobalSearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
};

const renderDialog = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Harness />
    <Location />
  </MemoryRouter>
);

const result = (q) => ({
  data: {
    q,
    groups: [
      {
        type: 'investors', label: 'Investors', count: 7, seeAll: `/investors?q=${q}`,
        items: [
          { _id: 'i1', title: 'Synthetic Electric Ltd', subtitle: 'Manufacturing · Nigeria', to: '/investors/i1' },
          { _id: 'i2', title: 'Elevate Agro', subtitle: 'Agribusiness', to: '/investors/i2' },
        ],
      },
      { type: 'projects', label: 'Projects', count: 0, seeAll: `/projects?q=${q}`, items: [] },
      {
        type: 'issues', label: 'Issues', count: 1, seeAll: `/issues?q=${q}`,
        items: [{ _id: 's1', title: 'ISS-04 · Synthetic Electric Ltd', subtitle: 'Open', to: '/issues/s1' }],
      },
    ],
  },
});

const box = () => screen.getByRole('combobox', { name: 'Search everything' });

describe('GlobalSearchDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('1 character → no request', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(result('e'));
    renderDialog();
    fireEvent.change(box(), { target: { value: 'e' } });
    await new Promise((r) => { setTimeout(r, 400); });
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText('Type at least 2 characters.')).toBeInTheDocument();
  });

  it('"!!" (nothing left after the server normalisation) → no request, no error', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(result('!!'));
    renderDialog();
    fireEvent.change(box(), { target: { value: '!!' } });
    await new Promise((r) => { setTimeout(r, 400); });
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText('Type at least 2 characters.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Enter while the results are for older text does nothing (no stale record opened)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(result('ele')).mockReturnValue(new Promise(() => {}));
    renderDialog();
    fireEvent.change(box(), { target: { value: 'ele' } });
    await screen.findByText('Elevate Agro');
    fireEvent.change(box(), { target: { value: 'elevator' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
    expect(screen.getByTestId('open')).toHaveTextContent('open');
  });

  it('typing "ele": one request after the 300 ms pause; only groups with matches, with counts', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(result('ele'));
    renderDialog();
    fireEvent.change(box(), { target: { value: 'el' } });
    fireEvent.change(box(), { target: { value: 'ele' } });
    expect(get).not.toHaveBeenCalled();
    expect(await screen.findByText('Synthetic Electric Ltd')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/search', { params: { q: 'ele' } });
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('group', { name: 'Investors 7' })).toBeInTheDocument();
    expect(within(listbox).getByRole('group', { name: 'Issues 1' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('group', { name: /Projects/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(5); // 2 + see all, 1 + see all
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowDown / ArrowUp + Enter opens the highlighted record', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(result('ele'));
    renderDialog();
    fireEvent.change(box(), { target: { value: 'ele' } });
    await screen.findByText('Elevate Agro');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    const second = screen.getByRole('option', { name: /Elevate Agro/ });
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(box()).toHaveAttribute('aria-activedescendant', second.id);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/investors/i2');
    await waitFor(() => expect(screen.getByTestId('open')).toHaveTextContent('closed'));
  });

  it('Enter on "See all in Issues" opens /issues?q=ele', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(result('ele'));
    renderDialog();
    fireEvent.change(box(), { target: { value: 'ele' } });
    await screen.findByText('Elevate Agro');
    // ArrowUp from the first row wraps to the last: "See all in Issues".
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: /See all in Issues/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/issues?q=ele');
  });

  it('no matches → "No results for …"; a failure shows an error', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { q: 'zz', groups: [{ type: 'investors', label: 'Investors', count: 0, items: [] }] } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDialog();
    fireEvent.change(box(), { target: { value: 'zz' } });
    expect(await screen.findByText('No results for "zz"')).toBeInTheDocument();
    get.mockRejectedValueOnce(new Error('network'));
    fireEvent.change(box(), { target: { value: 'zzz' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Search failed/);
  });

  it('a slower, older response never overwrites the newer results', async () => {
    let resolveOld;
    vi.spyOn(apiClient, 'get').mockImplementation((url, { params }) => {
      if (params.q === 'ele') return new Promise((r) => { resolveOld = r; });
      return Promise.resolve({
        data: {
          q: params.q,
          groups: [{
            type: 'projects', label: 'Projects', count: 1, seeAll: '/projects?q=elec', items: [{ _id: 'p1', title: 'Newer Project', to: '/projects/p1' }],
          }],
        },
      });
    });
    renderDialog();
    fireEvent.change(box(), { target: { value: 'ele' } });
    await waitFor(() => expect(resolveOld).toBeDefined());
    fireEvent.change(box(), { target: { value: 'elec' } });
    expect(await screen.findByText('Newer Project')).toBeInTheDocument();
    await act(async () => { resolveOld(result('ele')); });
    expect(screen.queryByText('Synthetic Electric Ltd')).not.toBeInTheDocument();
    expect(screen.getByText('Newer Project')).toBeInTheDocument();
  });

  it('Esc closes', async () => {
    renderDialog();
    fireEvent.keyDown(box(), { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('open')).toHaveTextContent('closed'));
  });
});
