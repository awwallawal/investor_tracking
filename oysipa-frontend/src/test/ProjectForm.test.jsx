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

    it('sector: create offers "Use the investor\'s sector"; edit has no empty choice', async () => {
        const { unmount } = render(<ProjectForm open={true} onClose={vi.fn()} onSave={vi.fn()} investorId="inv" />);
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /sector/i }));
        expect(await screen.findByRole('option', { name: "Use the investor's sector" })).toBeInTheDocument();
        unmount();
        render(<ProjectForm open={true} onClose={vi.fn()} onSave={vi.fn()} projectData={{ _id: 'p1', projectTitle: 'P', sector: 'Healthcare' }} />);
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /sector/i }));
        expect(await screen.findByRole('option', { name: 'Healthcare' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Not set' })).not.toBeInTheDocument();
        expect(screen.queryByRole('option', { name: "Use the investor's sector" })).not.toBeInTheDocument();
    });

    it('shows the assignment message when a save returns 403', async () => {
        const onSave = vi.fn();
        apiClient.put.mockRejectedValue({ response: { status: 403, data: { msg: 'Forbidden' } } });

        render(<ProjectForm open={true} onClose={vi.fn()} onSave={onSave} projectData={{ _id: 'proj1', projectTitle: 'P' }} />);
        fireEvent.click(screen.getByText('Save'));

        expect(await screen.findByRole('alert')).toHaveTextContent('You can only change projects of investors assigned to you');
        expect(onSave).not.toHaveBeenCalled();
    });

    it('shows a generic message for other save errors', async () => {
        const onSave = vi.fn();
        apiClient.post.mockRejectedValue({ response: { status: 400 } });

        render(<ProjectForm open={true} onClose={vi.fn()} onSave={onSave} investorId="inv1" />);
        fireEvent.click(screen.getByText('Save'));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Failed to save the project');
        expect(alert).not.toHaveTextContent('assigned to you');
        expect(onSave).not.toHaveBeenCalled();
    });
});
