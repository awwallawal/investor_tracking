import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ProjectForm from '../components/ProjectForm';
import apiClient from '../api/api';

vi.mock('../api/api');

describe('ProjectForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should submit new project data correctly', async () => {
        const onSave = vi.fn();
        const onClose = vi.fn();

        apiClient.post.mockResolvedValue({ data: {} });

        render(<ProjectForm open={true} onClose={onClose} onSave={onSave} investorId="test-investor-id" />);

        fireEvent.change(screen.getByLabelText('Project Title'), { target: { value: 'New Test Project' } });
        fireEvent.click(screen.getByText('Save'));

        await waitFor(() => {
            expect(apiClient.post).toHaveBeenCalledWith('/api/projects/investors/test-investor-id/projects', expect.any(Object));
            expect(onSave).toHaveBeenCalled();
        });
    });

    it('should submit updated project data correctly', async () => {
        const onSave = vi.fn();
        const onClose = vi.fn();
        const mockProject = { _id: 'proj1', projectTitle: 'Existing Project', lifecycleStatus: 'Planning' };

        apiClient.put.mockResolvedValue({ data: {} });

        render(<ProjectForm open={true} onClose={onClose} onSave={onSave} projectData={mockProject} />);

        fireEvent.change(screen.getByLabelText('Project Title'), { target: { value: 'Updated Test Project' } });
        fireEvent.click(screen.getByText('Save'));

        await waitFor(() => {
            expect(apiClient.put).toHaveBeenCalledWith('/api/projects/proj1', expect.any(Object));
            expect(onSave).toHaveBeenCalled();
        });
    });
});
