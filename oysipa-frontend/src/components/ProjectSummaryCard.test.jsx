import { render, screen } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import ProjectSummaryCard from './ProjectSummaryCard';
import { expect, it, describe } from 'vitest';

describe('ProjectSummaryCard', () => {
  const mockProject = {
    _id: '654321abcdef',
    projectTitle: 'Test Project Title',
    investor: { investorName: 'Test Investor Name' },
    lifecycleStatus: { name: 'Lead' },
  };

  it('renders project details correctly', () => {
    render(
      <Router>
        <ProjectSummaryCard project={mockProject} />
      </Router>
    );

    expect(screen.getByText(/Investor: Test Investor Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Test Project Title/i)).toBeInTheDocument();
    expect(screen.getByText(/Status: Lead/i)).toBeInTheDocument();
  });

  it('renders a link to the project detail page', () => {
    render(
      <Router>
        <ProjectSummaryCard project={mockProject} />
      </Router>
    );

    const linkElement = screen.getByRole('link', { name: /View Details/i });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', `/projects/${mockProject._id}`);
  });

  it('handles missing investor name gracefully', () => {
    const projectWithoutInvestorName = { ...mockProject, investor: null };
    render(
      <Router>
        <ProjectSummaryCard project={projectWithoutInvestorName} />
      </Router>
    );
    expect(screen.getByText(/Investor: N\/A/i)).toBeInTheDocument();
  });
  // lifecycleStatus may arrive missing or unpopulated (a raw ObjectId string).
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a raw id string', '64b7f0c2a1b2c3d4e5f60718'],
  ])('renders without crashing when lifecycleStatus is %s and shows Status: N/A', (_label, lifecycleStatus) => {
    render(
      <Router>
        <ProjectSummaryCard project={{ ...mockProject, lifecycleStatus }} />
      </Router>
    );
    expect(screen.getByText('Test Project Title')).toBeInTheDocument();
    expect(screen.getByText('Status: N/A')).toBeInTheDocument();
    expect(screen.queryByText(/64b7f0c2/)).not.toBeInTheDocument();
  });
});