import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import LoginPage from './Login';
import { BrowserRouter } from 'react-router-dom';

// Mock axios
vi.mock('axios');

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });


describe('LoginPage', () => {
  it('should handle successful login', async () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    axios.post.mockResolvedValue({ data: { token: 'fake_token' } });

    render(
        <BrowserRouter>
            <LoginPage />
        </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(setItemSpy).toHaveBeenCalledWith('token', 'fake_token');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    setItemSpy.mockRestore();
  });

  it('should display an error message on failed login', async () => {
    axios.post.mockRejectedValue({ response: { data: { msg: 'Invalid credentials' } } });

    render(
        <BrowserRouter>
            <LoginPage />
        </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });
});