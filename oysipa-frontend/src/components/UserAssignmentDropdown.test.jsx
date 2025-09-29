import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import UserAssignmentDropdown from './UserAssignmentDropdown';
import apiClient from '../api/api';

describe('UserAssignmentDropdown', () => {
  const mockUsers = [
    { _id: 'user1', name: 'Alice', role: 'Staff' },
    { _id: 'user2', name: 'Bob', role: 'Staff' },
  ];

  const mockOnAssign = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and displays users in the dropdown', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockUsers });

    render(
      <UserAssignmentDropdown
        investorId="investor1"
        currentAssignedUser={null}
        onAssign={mockOnAssign}
      />
    );

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/users/staff');
    });

    fireEvent.mouseDown(screen.getByLabelText('Assign Staff'));

    await waitFor(() => {
      expect(screen.getByText('Alice (Staff)')).toBeInTheDocument();
      expect(screen.getByText('Bob (Staff)')).toBeInTheDocument();
    });
  });

  it('pre-selects the current assigned user', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockUsers });

    render(
      <UserAssignmentDropdown
        investorId="investor1"
        currentAssignedUser={mockUsers[0]} // Pre-select Alice
        onAssign={mockOnAssign}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Alice (Staff)');
    });
  });

  it('calls onAssign with the selected user ID on change', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: mockUsers });

    render(
      <UserAssignmentDropdown
        investorId="investor1"
        currentAssignedUser={null}
        onAssign={mockOnAssign}
      />
    );

    fireEvent.mouseDown(screen.getByLabelText('Assign Staff'));

    const userOption = await screen.findByText('Bob (Staff)');
    fireEvent.click(userOption);

    expect(mockOnAssign).toHaveBeenCalledWith('user2');
  });

  it('handles fetch error gracefully', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network Error'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <UserAssignmentDropdown
        investorId="investor1"
        currentAssignedUser={null}
        onAssign={mockOnAssign}
      />
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching users:',
        expect.any(Error)
      );
    });

    fireEvent.mouseDown(screen.getByLabelText('Assign Staff'));
    await waitFor(() => {
        expect(screen.queryByText('Alice (Staff)')).not.toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });
});
