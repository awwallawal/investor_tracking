import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ChartCard from './ChartCard';

describe('ChartCard', () => {
  it('shows title, subtitle, legend items, content and footnote', () => {
    render(
      <ChartCard
        title="Announcements by year"
        subtitle="By announcement date"
        legend={[{ label: 'All', color: '#850504' }, { label: 'Naming OYSIPA', color: '#0A558C' }]}
        footnote="Source: announcements register"
      >
        <p>chart here</p>
      </ChartCard>
    );
    const section = screen.getByRole('region', { name: 'Announcements by year' });
    expect(within(section).getByRole('heading', { name: 'Announcements by year' })).toBeInTheDocument();
    expect(screen.getByText('By announcement date')).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['All', 'Naming OYSIPA']);
    expect(screen.getByText('chart here')).toBeInTheDocument();
    expect(screen.getByText('Source: announcements register')).toBeInTheDocument();
  });

  it('works with just a title and children', () => {
    render(<ChartCard title="Projects by status"><span>body</span></ChartCard>);
    expect(screen.getByRole('heading', { name: 'Projects by status' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
