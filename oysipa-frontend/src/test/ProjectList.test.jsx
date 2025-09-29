import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ProjectList from '../components/ProjectList';
import apiClient from '../api/api';

// Mock apiClient
vi.mock('../api/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('ProjectList', () => {
    beforeEach(() => {
        apiClient.get.mockClear();
    });

    it('should display a list of projects', async () => {
        const mockProjects = [
            { _id: '1', projectTitle: 'Project Alpha', lifecycleStatus: 'Planning' },
            { _id: '2', projectTitle: 'Project Beta', lifecycleStatus: 'Execution' },
        ];
        const investorId = 'test-investor-id';

        apiClient.get.mockResolvedValue({ data: mockProjects });

        render(<ProjectList investorId={investorId} />);

        await waitFor(() => {
            expect(apiClient.get).toHaveBeenCalledWith(`/api/projects/investors/${investorId}/projects`);
        });

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });

    it('should display a message when there are no projects', async () => {
        const investorId = 'test-investor-id';
        apiClient.get.mockResolvedValue({ data: [] });

        render(<ProjectList investorId={investorId} />);

        await waitFor(() => {
            expect(apiClient.get).toHaveBeenCalledWith(`/api/projects/investors/${investorId}/projects`);
        });

        expect(screen.getByText('No projects found for this investor.')).toBeInTheDocument();
    });
});