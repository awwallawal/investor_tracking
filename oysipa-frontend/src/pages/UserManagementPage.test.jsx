import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserManagementPage from './UserManagementPage';
import { BrowserRouter } from 'react-router-dom';
import apiClient from '../api/api';

// Mock apiClient
vi.mock('../api/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store = { token: 'fake_token' };
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key) => { delete store[key]; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('UserManagementPage', () => {

  const mockUsers = [
    { _id: '1', name: 'Alice', email: 'alice@example.com', role: 'Staff', status: 'active' },
    { _id: '2', name: 'Bob', email: 'bob@example.com', role: 'Portal-Admin', status: 'revoked' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display a list of users', async () => {
    apiClient.get.mockResolvedValueOnce({ data: mockUsers });
    render(<BrowserRouter><UserManagementPage /></BrowserRouter>);
    await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
        // Shown in the Email column and, for phones, under the name.
        expect(screen.getAllByText('bob@example.com').length).toBeGreaterThan(0);
    });
  });

  it('should allow inviting a new user and optimistically update the UI', async () => {
    const user = userEvent.setup();
    const newMockUser = { _id: '3', name: 'Charlie', email: 'charlie@example.com', role: 'Director-General', status: 'active' };
    apiClient.get.mockResolvedValueOnce({ data: mockUsers });
    apiClient.post.mockResolvedValueOnce({ data: { msg: 'User invited successfully', user: newMockUser } });

    render(<BrowserRouter><UserManagementPage /></BrowserRouter>);

    // --- actions ---
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Charlie');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'charlie@example.com');
    await user.type(screen.getByLabelText(/temporary password/i), 'password123');

    await user.click(screen.getByLabelText(/role/i));
    await user.click(screen.getByRole('option', { name: 'Director-General' }));

    await user.click(screen.getByRole('button', { name: /invite user/i }));

    // --- assertions ---
    await waitFor(() => {
        expect(screen.getByText('User invited successfully')).toBeInTheDocument();
        expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
  }, 20000);

  it('should allow revoking user access and optimistically update the UI', async () => {
    const user = userEvent.setup();
    apiClient.get.mockResolvedValueOnce({ data: mockUsers });
    apiClient.put.mockResolvedValueOnce({ data: { msg: 'User access revoked' } });

    render(<BrowserRouter><UserManagementPage /></BrowserRouter>);

    // --- action ---
    const revokeButton = await screen.findByRole('button', { name: /revoke access/i });
    await user.click(revokeButton);

    // --- assertions ---
    await waitFor(() => {
        expect(screen.getByText('User access revoked')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /revoke access/i })).not.toBeInTheDocument();
    });
  }, 20000);
});