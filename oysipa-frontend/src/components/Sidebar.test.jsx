import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const renderSidebar = () => render(
  <MemoryRouter>
    <Sidebar mobileOpen={false} onDrawerToggle={() => {}} />
  </MemoryRouter>
);

describe('Sidebar — Investor Directory link', () => {
  afterEach(() => {
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
});
