import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InvestorProfilePage from './InvestorProfilePage';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const investor = { _id: 'inv1', investorName: 'Acme Ltd', email: 'a@acme.test', assignedTo: null };

const renderPage = () => render(
  <MemoryRouter initialEntries={['/investors/inv1']}>
    <Routes>
      <Route path="/investors/:id" element={<InvestorProfilePage />} />
    </Routes>
  </MemoryRouter>
);

describe('InvestorProfilePage — Assign Staff dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/investors/inv1') return Promise.resolve({ data: investor });
      if (url === '/api/projects/investors/inv1/projects') return Promise.resolve({ data: [] });
      if (url === '/api/users/staff') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('is hidden for Staff and the staff list is not requested', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.queryByText('Assign Staff')).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/users/staff');
  });

  it.each(['Director-General', 'Portal-Admin'])('is shown for %s', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    renderPage();

    expect(await screen.findByText('Acme Ltd')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/users/staff'));
    expect(screen.getAllByText('Assign Staff').length).toBeGreaterThan(0);
  });
});
