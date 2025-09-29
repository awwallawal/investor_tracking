import React from 'react';
import { render, screen } from '@testing-library/react';
import InvestorForm from './InvestorForm';

// Mock Material-UI components to avoid complex rendering issues in tests
vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Dialog: ({ children, open }) => (open ? <div data-testid="mock-dialog">{children}</div> : null),
    TextField: ({ label, name, value, onChange }) => ( // Destructure and capture rest
      <input
        data-testid={name}
        placeholder={label}
        value={value}
        onChange={onChange}
        // Do not spread 'rest' props like fullWidth, margin, etc.
      />
    ),
    Button: (props) => <button {...props} />,
    Box: ({ children }) => <div>{children}</div>,
    DialogActions: ({ children }) => <div>{children}</div>,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
  };
});

describe('InvestorForm', () => {
    it('renders investor form', () => {
        render(<InvestorForm open={true} onClose={() => {}} onSave={() => {}} />); // Pass required props
        expect(screen.getByPlaceholderText('Investor Name')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Sector')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
});
