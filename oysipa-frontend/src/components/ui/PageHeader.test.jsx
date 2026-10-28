import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

  it('shows a breadcrumb: links for the parents, the current page as text (11.16)', () => {
    render(<MemoryRouter><PageHeader title="Synthetic Issue" breadcrumbs={[{ label: 'Issues', to: '/issues' }, { label: 'ISS-01' }]} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Issues' }));
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/issues');
    expect(screen.getByText('ISS-01')).toHaveAttribute('aria-current', 'page');
  });
});
