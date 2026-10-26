import React from 'react';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import apiClient from '../api/api';
import { notifyUntaggedChanged } from '../api/evidence';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const renderSidebar = (path = '/dashboard') => render(
  <MemoryRouter initialEntries={[path]}>
    <Sidebar mobileOpen={false} onDrawerToggle={() => {}} />
  </MemoryRouter>
);

// Link names per nav group, in order.
const groupLinks = (name) => within(screen.getByRole('navigation', { name })).getAllByRole('link').map((a) => a.textContent);

describe('Sidebar — Investors link', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it.each(['Director-General', 'Portal-Admin', 'Staff'])('is visible for %s and links to /investors', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();

    const link = screen.getByRole('link', { name: 'Investors' });
    expect(link).toHaveAttribute('href', '/investors');
  });

  it('Staff does not see Users or Settings (formerly User Management / Admin Settings)', () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();

    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin', 'Staff'])('%s sees Announcements (11.8)', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Announcements' })).toHaveAttribute('href', '/announcements');
  });

  it.each(['Director-General', 'Portal-Admin'])('%s sees "Change log" (11.10)', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Change log' })).toHaveAttribute('href', '/changelog');
  });

  it('Staff has no "Change log" item (11.10)', () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();
    expect(screen.queryByText('Change log')).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin'])('%s sees Settings → /admin (MoU MDAs, 11.7c) and Users → /users', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
  });
});

describe('Sidebar — Evidence library', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it.each(['Director-General', 'Portal-Admin', 'Staff'])('%s sees "Evidence library" with the untagged count badge', async (role) => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 68 } });
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    const link = screen.getByRole('link', { name: /Evidence library/ });
    expect(link).toHaveAttribute('href', '/evidence');
    expect(await screen.findByText('68')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledWith('/api/evidence/untagged-count');
  });

  it('refetches when a library screen reports a change (68 → 67)', async () => {
    const getSpy = vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: { count: 68 } })
      .mockResolvedValue({ data: { count: 67 } });
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();
    expect(await screen.findByText('68')).toBeInTheDocument();
    act(() => notifyUntaggedChanged());
    expect(await screen.findByText('67')).toBeInTheDocument();
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  });

  it('no badge when nothing is untagged', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 0 } });
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(screen.queryByLabelText(/untagged/)).not.toBeInTheDocument();
  });
});

describe('Sidebar — groups, roles and active item (11.13)', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 0 } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it.each(['Director-General', 'Portal-Admin'])('%s: Dashboard; Pipeline 3; SABER evidence 3; Admin 3; no Staff footnote', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(groupLinks('Main')).toEqual(['Dashboard']);
    expect(groupLinks('Pipeline')).toEqual(['Investors', 'Projects', 'Interactions']);
    expect(groupLinks('SABER evidence')).toEqual(['Issues', 'Announcements', 'Evidence library']);
    expect(groupLinks('Admin')).toEqual(['Change log', 'Users', 'Settings']);
    expect(screen.queryByText(/admin screens|are for the DG and Portal-Admin/i)).not.toBeInTheDocument();
  });

  it('Staff: "My work"; Pipeline 3; SABER evidence 3; no Admin group; the footnote', () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();
    expect(groupLinks('Main')).toEqual(['My work']);
    expect(screen.getByRole('link', { name: 'My work' })).toHaveAttribute('href', '/dashboard');
    expect(groupLinks('Pipeline')).toEqual(['Investors', 'Projects', 'Interactions']);
    expect(groupLinks('SABER evidence')).toEqual(['Issues', 'Announcements', 'Evidence library']);
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByText(/are for the DG and Portal-Admin/)).toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin', 'Staff'])('%s sees Projects and Interactions', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Interactions' })).toHaveAttribute('href', '/interactions');
  });

  it('at /investors/abc, Investors is the active item (and only it)', () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    renderSidebar('/investors/abc');
    const investors = screen.getByRole('link', { name: 'Investors' });
    expect(investors).toHaveAttribute('aria-current', 'page');
    expect(investors).toHaveClass('Mui-selected');
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toEqual([investors]);
  });

  it('a route that only shares a prefix does not light up the item (/issuesx ≠ /issues)', () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    renderSidebar('/issuesx');
    expect(screen.getByRole('link', { name: 'Issues' })).not.toHaveAttribute('aria-current');
  });

  it('no token → no sidebar', () => {
    const { container } = renderSidebar();
    expect(container).toBeEmptyDOMElement();
  });

  it('a large untagged count shows as 999+', async () => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 1500 } });
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();
    expect(await screen.findByText('999+')).toBeInTheDocument();
    expect(screen.getByLabelText('1500 untagged')).toBeInTheDocument();
  });

  it('an unknown role sees a short note instead of an empty menu', () => {
    localStorage.setItem('token', tokenFor('Visitor'));
    renderSidebar();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/No menu for this role/)).toBeInTheDocument();
  });
});
