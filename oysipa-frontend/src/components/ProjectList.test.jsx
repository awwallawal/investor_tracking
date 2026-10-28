import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from './ProjectList';
import { expect, it, describe } from 'vitest';

const renderList = (projects) => render(<MemoryRouter><ProjectList projects={projects} /></MemoryRouter>);
const rowOf = (title) => screen.getByText(title).closest('tr');

describe('ProjectList', () => {
  const base = { _id: 'p1', projectTitle: 'Synthetic Project One' };

  it('renders the populated status name and a link to the project', () => {
    renderList([{ ...base, lifecycleStatus: { _id: 's1', name: 'Lead' } }]);
    expect(within(rowOf('Synthetic Project One')).getByText('Lead')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Synthetic Project One/ })).toHaveAttribute('href', '/projects/p1');
  });

  // lifecycleStatus may arrive missing or unpopulated (a raw ObjectId string).
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a raw id string', '64b7f0c2a1b2c3d4e5f60718'],
  ])('renders without crashing when lifecycleStatus is %s and shows N/A', (_label, lifecycleStatus) => {
    renderList([{ ...base, lifecycleStatus }]);
    expect(screen.getByText('Synthetic Project One')).toBeInTheDocument();
    expect(within(rowOf('Synthetic Project One')).getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByText(/64b7f0c2/)).not.toBeInTheDocument();
  });

  it('shows value with currency, location and jobs (11.16)', () => {
    renderList([{
      ...base, estimatedValue: 2500000, currency: 'USD', location: 'Iseyin', estimatedNumberOfJobs: 120,
    }]);
    const row = rowOf('Synthetic Project One');
    expect(within(row).getByText('US$2,500,000')).toBeInTheDocument();
    expect(within(row).getByText('Iseyin')).toBeInTheDocument();
    expect(within(row).getByText('120')).toBeInTheDocument();
  });

  it('shows the empty state when there are no projects', () => {
    renderList([]);
    expect(screen.getByText('No projects found for this investor.')).toBeInTheDocument();
  });
});
