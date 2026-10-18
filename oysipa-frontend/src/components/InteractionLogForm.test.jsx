import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import InteractionLogForm from './InteractionLogForm';
import apiClient from '../api/api';

describe('InteractionLogForm', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();
  const projectId = 'test-project-id';

  beforeEach(() => {
    vi.restoreAllMocks(); // Restore all spies before each test
    global.fetch = vi.fn(); // Mock global fetch for Cloudinary upload
  });

  it('renders the form correctly when open', () => {
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);
    
    expect(screen.getByText('Log New Support Interaction')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /interaction description/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /service category/i })).toBeInTheDocument();
    expect(screen.getByText('Save Log')).toBeInTheDocument();
    expect(screen.getByLabelText(/attach document/i)).toBeInTheDocument();
  });

  it('shows an error if submitting with empty fields', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);
    
    const saveButton = screen.getByText('Save Log');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Both description and category are required.')).toBeInTheDocument();
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('calls the API and saves when submitting with valid data', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);

    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Test description' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    const meetingOption = await screen.findByRole('option', { name: 'Meeting' });
    await userEvent.click(meetingOption);

    const saveButton = screen.getByText('Save Log');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        `/api/projects/${projectId}/interactions`,
        {
          description: 'Test description',
          category: 'Meeting',
          documentUrl: '',
          serviceCodes: [],
          creditLinkage: false,
        }
      );
    });

    await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
    });
  }, 20000);

  it('should upload a file to Cloudinary and save interaction log with documentUrl', async () => {
    const user = userEvent.setup();
    const mockFile = new File(['hello'], 'hello.png', { type: 'image/png' });
    const cloudinaryUrl = 'https://res.cloudinary.com/dzzipwwbn/image/upload/v123/hello.png';

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ secure_url: cloudinaryUrl }),
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);

    // Simulate file selection
    const fileInput = screen.getByLabelText(/attach document/i);
    await user.upload(fileInput, mockFile);

    // Fill other fields
    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Test description with file' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    const meetingOption = await screen.findByRole('option', { name: 'Meeting' });
    await userEvent.click(meetingOption);

    const saveButton = screen.getByText('Save Log');
    await user.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.cloudinary.com/v1_1/dzzipwwbn/image/upload`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );
      expect(postSpy).toHaveBeenCalledWith(
        `/api/projects/${projectId}/interactions`,
        {
          description: 'Test description with file',
          category: 'Meeting',
          documentUrl: cloudinaryUrl,
          serviceCodes: [],
          creditLinkage: false,
        }
      );
      expect(mockOnSave).toHaveBeenCalled();
    });
  }, 10000);

  it('displays an API error on submission failure', async () => {
    const errorMessage = 'API submission failed';
    // eslint-disable-next-line no-unused-vars
    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { data: { msg: errorMessage } } });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);

    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Test description' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    const meetingOption = await screen.findByRole('option', { name: 'Meeting' });
    await userEvent.click(meetingOption);

    const saveButton = screen.getByText('Save Log');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save interaction log.')).toBeInTheDocument();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('shows the assignment message when the API returns 403', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ message: 'Request failed with status code 403', response: { status: 403, data: { msg: 'Forbidden' } } });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);

    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Test description' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Meeting' }));
    fireEvent.click(screen.getByText('Save Log'));

    expect(await screen.findByText('You can only change projects of investors assigned to you')).toBeInTheDocument();
    expect(screen.queryByText(/status code 403/)).not.toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('posts to the investor route when given investorId (no project)', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);

    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Briefing letter sent to NIPC' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Email' }));
    fireEvent.click(screen.getByText('Save Log'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/interactions/investors/inv-1', {
        description: 'Briefing letter sent to NIPC',
        category: 'Email',
        documentUrl: '',
        serviceCodes: [],
        creditLinkage: false,
      });
    });
    await waitFor(() => expect(mockOnSave).toHaveBeenCalled());
  });

  it('sends the picked service codes (grouped, with wording) and the credit-linkage flag', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);

    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'Briefing letter sent to NIPC' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Email' }));

    await userEvent.click(screen.getByRole('combobox', { name: /saber services/i }));
    expect(await screen.findByText('Marketing Services')).toBeInTheDocument();
    expect(screen.getByText('Information Services')).toBeInTheDocument();
    expect(screen.getByText('Assistance Services')).toBeInTheDocument();
    expect(screen.getByText('Advocacy')).toBeInTheDocument();
    expect(screen.getByText('Proactively promote priority sectors through network of intermediaries')).toBeInTheDocument();
    await userEvent.click(screen.getByText('A8'));
    await userEvent.click(screen.getByText('M4'));
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('checkbox', { name: /credit linkage/i }));
    fireEvent.click(screen.getByText('Save Log'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/interactions/investors/inv-1', expect.objectContaining({
        serviceCodes: ['M4', 'A8'],
        creditLinkage: true,
      }));
    });
  }, 20000);

  it('shows the investor assignment message on 403 from the investor route', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 403, data: { msg: 'Forbidden' } } });
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);

    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: 'x' } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Email' }));
    fireEvent.click(screen.getByText('Save Log'));

    expect(await screen.findByText('You can only log interactions for investors assigned to you')).toBeInTheDocument();
  });
});
