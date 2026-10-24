import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import apiClient from './api/api';

// Story 11.7c: the /admin route guard (ProtectedRoute) admits DG and Portal-Admin.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const mdaList = [
  { code: 'LANDS AND HOUSING', name: 'Ministry of Lands and Housing', abbreviation: 'Lands & Housing', mou: true },
];

describe('/admin route guard', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => Promise.resolve({ data: url === '/api/mdas' ? mdaList : [] }));
    window.history.pushState({}, '', '/admin');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
    window.history.pushState({}, '', '/');
  });

  it.each(['Director-General', 'Portal-Admin'])('%s → the MoU MDAs section renders', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'MoU MDAs' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin');
  });

  it('Staff → redirected to /dashboard', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'MoU MDAs' })).not.toBeInTheDocument();
  });
});

describe('/changelog route guard (11.10)', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => Promise.resolve({
      data: url === '/api/changelog' ? {
        rows: [], total: 0, page: 1, pageSize: 50,
      } : [],
    }));
    window.history.pushState({}, '', '/changelog');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
    window.history.pushState({}, '', '/');
  });

  it.each(['Director-General', 'Portal-Admin'])('%s → the Change log page renders', async (role) => {
    localStorage.setItem('token', tokenFor(role));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Change log' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/changelog');
  });

  it('Staff → redirected to /dashboard', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Change log' })).not.toBeInTheDocument();
  });
});
