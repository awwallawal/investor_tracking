import { render, screen } from '@testing-library/react';
import ProjectList from './ProjectList';
import { expect, it, describe } from 'vitest';

describe('ProjectList', () => {
  const base = { _id: 'p1', projectTitle: 'Synthetic Project One' };

  it('renders the populated status name and a link to the project', () => {
    render(<ProjectList projects={[{ ...base, lifecycleStatus: { _id: 's1', name: 'Lead' } }]} />);
    expect(screen.getByText('Status: Lead')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Synthetic Project One/ })).toHaveAttribute('href', '/projects/p1');
  });

  // lifecycleStatus may arrive missing or unpopulated (a raw ObjectId string).
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a raw id string', '64b7f0c2a1b2c3d4e5f60718'],
  ])('renders without crashing when lifecycleStatus is %s and shows Status: N/A', (_label, lifecycleStatus) => {
    render(<ProjectList projects={[{ ...base, lifecycleStatus }]} />);
    expect(screen.getByText('Synthetic Project One')).toBeInTheDocument();
    expect(screen.getByText('Status: N/A')).toBeInTheDocument();
    expect(screen.queryByText(/64b7f0c2/)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no projects', () => {
    render(<ProjectList projects={[]} />);
    expect(screen.getByText('No projects found for this investor.')).toBeInTheDocument();
  });
});
