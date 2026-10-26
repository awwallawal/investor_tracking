import React from 'react';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('shows icon, title, text and action', () => {
    render(<EmptyState icon={<span data-testid="ic">i</span>} title="No investors yet" text="Register the first one." action={<button type="button">Register</button>} />);
    expect(screen.getByRole('status')).toHaveTextContent('No investors yet');
    expect(screen.getByText('Register the first one.')).toBeInTheDocument();
    expect(screen.getByTestId('ic')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
  });

  it('renders with a title only', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
