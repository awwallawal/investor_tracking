import React from 'react';
import { render, screen } from '@testing-library/react';
import PageHeader from './PageHeader';

describe('PageHeader', () => {
  it('shows eyebrow, the h1 title, subtitle and actions', () => {
    render(<PageHeader eyebrow="Pipeline" title="Investors" subtitle="All registered investors" actions={<button type="button">Add</button>} />);
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Investors' })).toBeInTheDocument();
    expect(screen.getByText('All registered investors')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('renders only the title when nothing else is given', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
