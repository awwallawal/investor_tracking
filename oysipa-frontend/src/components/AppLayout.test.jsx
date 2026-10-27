import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import AppLayout from './AppLayout';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/dashboard" element={<AppLayout><p>dashboard page</p></AppLayout>} />
      <Route path="/investors" element={<AppLayout><p>investors page</p></AppLayout>} />
    </Routes>
  </MemoryRouter>
);

describe('AppLayout — phone (drawer)', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 0 } });
    // Phone width: every max-width query matches (useMediaQuery → mobile).
    window.matchMedia = (query) => ({
      matches: /max-width/.test(query),
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    });
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('Staff: the menu button opens the drawer; tapping an item navigates and closes it', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderAt('/dashboard');
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
    // Closed drawer: its links are not reachable.
    expect(screen.queryByRole('link', { name: 'Investors' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'open drawer' }));
    expect(await screen.findByRole('link', { name: 'My work' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Investors' }));
    expect(await screen.findByText('investors page')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Investors' })).not.toBeInTheDocument());
  });
});

// matchMedia whose answers follow a settable viewport width; fires "change".
const installViewport = (initialWidth) => {
  let width = initialWidth;
  const lists = [];
  const evaluate = (query) => {
    const max = query.match(/max-width:\s*([\d.]+)px/);
    const min = query.match(/min-width:\s*([\d.]+)px/);
    if (max && width > Number(max[1])) return false;
    if (min && width < Number(min[1])) return false;
    return Boolean(max || min);
  };
  window.matchMedia = (query) => {
    const listeners = new Set();
    const list = {
      media: query,
      get matches() { return evaluate(query); },
      addListener: (l) => listeners.add(l),
      removeListener: (l) => listeners.delete(l),
      addEventListener: (t, l) => listeners.add(l),
      removeEventListener: (t, l) => listeners.delete(l),
      onchange: null,
      dispatchEvent: () => false,
      listeners,
    };
    lists.push(list);
    return list;
  };
  return (next) => {
    width = next;
    lists.forEach((l) => l.listeners.forEach((fn) => fn({ matches: l.matches, media: l.media })));
  };
};

describe('AppLayout — tablet and resizing', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 0 } });
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('tablet (only max-width:899.95px matches): drawer links hidden until "open drawer" is clicked', async () => {
    window.matchMedia = (query) => ({
      matches: query.includes('max-width:899.95px'),
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    });
    localStorage.setItem('token', tokenFor('Director-General'));
    renderAt('/dashboard');
    expect(screen.queryByRole('link', { name: 'Investors' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'open drawer' }));
    expect(await screen.findByRole('link', { name: 'Investors' })).toBeInTheDocument();
  });

  it('widening to md or more closes the open drawer', async () => {
    const setWidth = installViewport(375);
    localStorage.setItem('token', tokenFor('Staff'));
    renderAt('/dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'open drawer' }));
    expect(await screen.findByRole('link', { name: 'Investors' })).toBeInTheDocument();

    act(() => setWidth(1280));
    // Back to a phone: the drawer stayed closed.
    act(() => setWidth(375));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Investors' })).not.toBeInTheDocument());
  });
});

describe('AppLayout — laptop', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 0 } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('shows the sidebar, the top bar and the content in <main>', () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    renderAt('/dashboard');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Search everything' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('dashboard page');
  });
});
