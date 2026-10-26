import React from 'react';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('shows its label with the given tone', () => {
    render(<StatusBadge label="Intermediary" tone="info" />);
    expect(screen.getByText('Intermediary')).toHaveAttribute('data-tone', 'info');
  });

  it('defaults to the default tone', () => {
    render(<StatusBadge label="Investor" />);
    expect(screen.getByText('Investor')).toHaveAttribute('data-tone', 'default');
  });
});
