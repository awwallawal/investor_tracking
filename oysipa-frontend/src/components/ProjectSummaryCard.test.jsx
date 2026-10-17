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
});