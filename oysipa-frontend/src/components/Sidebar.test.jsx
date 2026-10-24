import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import apiClient from '../api/api';
import { notifyUntaggedChanged } from '../api/evidence';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const renderSidebar = () => render(
  <MemoryRouter>
    <Sidebar mobileOpen={false} onDrawerToggle={() => {}} />
  </MemoryRouter>
);

describe('Sidebar — Investor Directory link', () => {
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

    const link = screen.getByRole('link', { name: 'Investor Directory' });
    expect(link).toHaveAttribute('href', '/investors');
  });

  it('Staff does not see User Management or Admin Settings', () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderSidebar();

    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Settings')).not.toBeInTheDocument();
  });

  it.each(['Director-General', 'Portal-Admin', 'Staff'])('%s sees Announcements (11.8)', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Announcements' })).toHaveAttribute('href', '/announcements');
  });

  it.each(['Director-General', 'Portal-Admin'])('%s sees Admin Settings (MoU MDAs, 11.7c)', (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Admin Settings' })).toHaveAttribute('href', '/admin');
  });
});

describe('Sidebar — Evidence Library', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it.each(['Director-General', 'Portal-Admin', 'Staff'])('%s sees "Evidence Library" with the untagged count badge', async (role) => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { count: 68 } });
    localStorage.setItem('token', tokenFor(role));
    renderSidebar();
    const link = screen.getByRole('link', { name: /Evidence Library/ });
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
