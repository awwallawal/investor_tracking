import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import ProjectList from '../components/ProjectList';

// ProjectList is presentational: the parent page fetches projects and passes them in.
describe('ProjectList', () => {
    it('should display a list of projects', () => {
        const mockProjects = [
            { _id: '1', projectTitle: 'Project Alpha', lifecycleStatus: { name: 'Planning' } },
            { _id: '2', projectTitle: 'Project Beta', lifecycleStatus: { name: 'Execution' } },
        ];

        render(<MemoryRouter><ProjectList projects={mockProjects} /></MemoryRouter>);

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
        expect(within(screen.getByText('Project Alpha').closest('tr')).getByText('Planning')).toBeInTheDocument();
        expect(within(screen.getByText('Project Beta').closest('tr')).getByText('Execution')).toBeInTheDocument();
    });

    it('should display a message when there are no projects', () => {
        render(<MemoryRouter><ProjectList projects={[]} /></MemoryRouter>);

        expect(screen.getByText('No projects found for this investor.')).toBeInTheDocument();
    });
});
