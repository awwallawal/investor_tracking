import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ProjectList from '../components/ProjectList';

// ProjectList is presentational: the parent page fetches projects and passes them in.
describe('ProjectList', () => {
    it('should display a list of projects', () => {
        const mockProjects = [
            { _id: '1', projectTitle: 'Project Alpha', lifecycleStatus: { name: 'Planning' } },
            { _id: '2', projectTitle: 'Project Beta', lifecycleStatus: { name: 'Execution' } },
        ];

        render(<ProjectList projects={mockProjects} />);

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
        expect(screen.getByText('Status: Planning')).toBeInTheDocument();
        expect(screen.getByText('Status: Execution')).toBeInTheDocument();
    });

    it('should display a message when there are no projects', () => {
        render(<ProjectList projects={[]} />);

        expect(screen.getByText('No projects found for this investor.')).toBeInTheDocument();
    });
});
