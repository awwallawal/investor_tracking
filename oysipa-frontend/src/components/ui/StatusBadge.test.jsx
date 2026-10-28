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

  it.each([
    ['Open', 'warning'], ['In progress', 'info'], ['Resolved', 'success'], ['Withdrawn', 'default'], ['Active', 'success'], ['Director-General', 'primary'],
  ])('without a tone, %s takes the shared status tone %s (11.16)', (label, tone) => {
    render(<StatusBadge label={label} />);
    expect(screen.getByText(label)).toHaveAttribute('data-tone', tone);
  });
});
