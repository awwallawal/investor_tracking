import React, { useState, useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event'; // Import userEvent
import { expect } from 'vitest';
import InvestorEditForm from './InvestorEditForm';

// Mock Material-UI Dialog and TextField components to simplify testing
vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Dialog: ({ children, open }) => (open ? <div data-testid="mock-dialog">{children}</div> : null),
    TextField: ({ label, name, value: propValue, onChange: propOnChange, ...rest }) => {
      const [internalValue, setInternalValue] = useState(propValue); // Internal state for value

      useEffect(() => {
        setInternalValue(propValue); // Update internal state when propValue changes
      }, [propValue]);

      const handleChange = (e) => {
        setInternalValue(e.target.value); // Update internal state
        propOnChange && propOnChange(e); // Call original onChange prop
      };

      return (
        <input
          data-testid={name}
          placeholder={label} // Mock placeholder for testing purposes
          value={internalValue} // Use internal state for value
          onChange={handleChange}
          {...rest}
        />
      );
    },
    Button: (props) => <button {...props} />,
    Box: ({ children }) => <div>{children}</div>,
    DialogActions: ({ children }) => <div>{children}</div>,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
  };
});

describe('InvestorEditForm', () => {
  const mockInvestorData = {
    _id: '1',
    investorName: 'Test Investor',
    sector: 'Tech',
    countryOfOrigin: 'USA',
    companyRegistrationInfo: '12345',
    keyContactPerson: 'John Doe',
  };

  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );
  });

  it('renders correctly with investor data', () => {
    render(
      <InvestorEditForm
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        investorData={mockInvestorData}
      />
    );

    expect(screen.getByDisplayValue('Test Investor')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tech')).toBeInTheDocument();
    expect(screen.getByDisplayValue('USA')).toBeInTheDocument();
  });

  it('updates form data on input change', async () => { // Added async
    render(
      <InvestorEditForm
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        investorData={mockInvestorData}
      />
    );

    const investorNameInput = screen.getByTestId('investorName');
    await userEvent.clear(investorNameInput); // Clear existing value
    await userEvent.type(investorNameInput, 'Updated Investor'); // Type new value

    await waitFor(() => { // Added waitFor
      expect(investorNameInput.value).toBe('Updated Investor');
    });
  });

  it('calls onSave and closes dialog on successful submission', async () => {
    render(
      <InvestorEditForm
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        investorData={mockInvestorData}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/investors/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(mockInvestorData), // Initial data as no changes were made
        })
      );
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnClose).not.toHaveBeenCalled(); // onSave handles closing
    });
  });

  it('handles API error during submission', async () => {
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to update' }),
      })
    );

    render(
      <InvestorEditForm
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        investorData={mockInvestorData}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockOnSave).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
      // Optionally, check for error message display if implemented in component
    });
  });
});
