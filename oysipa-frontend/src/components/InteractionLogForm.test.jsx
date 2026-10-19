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
    mockOnClose.mockClear();
    mockOnSave.mockClear();
    // Uploads go through the backend only; any direct fetch would be a bug.
    global.fetch = vi.fn();
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
          serviceCodes: [],
          creditLinkage: false,
        }
      );
    });

    await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
    });
  }, 20000);

  const fillRequired = async (description = 'Paper meeting') => {
    fireEvent.change(screen.getByRole('textbox', { name: /interaction description/i }), { target: { value: description } });
    await userEvent.click(screen.getByRole('combobox', { name: /service category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Meeting' }));
  };

  it('creates the log, then uploads the file to the backend (no Cloudinary call from the browser)', async () => {
    const user = userEvent.setup();
    const mockFile = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
    const postSpy = vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { _id: 'log-1' } })
      .mockResolvedValueOnce({ data: { _id: 'doc-1', fileName: 'scan.pdf' } });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} projectId={projectId} />);
    await user.upload(screen.getByLabelText(/attach document/i), mockFile);
    await fillRequired('Test description with file');
    fireEvent.change(screen.getByLabelText(/date it happened/i), { target: { value: '2025-03-18' } });
    await user.click(screen.getByText('Save Log'));

    await waitFor(() => expect(mockOnSave).toHaveBeenCalled());
    expect(postSpy).toHaveBeenNthCalledWith(1, `/api/projects/${projectId}/interactions`, {
      description: 'Test description with file',
      category: 'Meeting',
      serviceCodes: [],
      creditLinkage: false,
      interactionDate: '2025-03-18',
    });
    const [uploadUrl, formData] = postSpy.mock.calls[1];
    expect(uploadUrl).toBe('/api/interactions/log-1/documents');
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('file').name).toBe('scan.pdf');
    expect(formData.get('documentDate')).toBe('2025-03-18');
    expect(global.fetch).not.toHaveBeenCalled();
  }, 20000);

  it('upload fails: keeps the dialog open ("Interaction saved; document not attached"), Retry uploads again', async () => {
    const user = userEvent.setup();
    const mockFile = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
    const postSpy = vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { _id: 'log-1' } })
      .mockRejectedValueOnce({ response: { status: 502, data: { message: 'The document could not be stored. Please try again.' } } })
      .mockResolvedValueOnce({ data: { _id: 'doc-1' } });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);
    await user.upload(screen.getByLabelText(/attach document/i), mockFile);
    await fillRequired();
    await user.click(screen.getByText('Save Log'));

    expect(await screen.findByText(/Interaction saved; document not attached/)).toBeInTheDocument();
    expect(screen.getByText(/could not be stored/)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Save Log')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockOnSave).toHaveBeenCalled());
    // The interaction is not created twice: the retry only re-sends the file.
    expect(postSpy).toHaveBeenCalledTimes(3);
    expect(postSpy.mock.calls[2][0]).toBe('/api/interactions/log-1/documents');
  }, 20000);

  it('storage not configured (503): says so; closing still refreshes the saved interaction', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { _id: 'log-1' } })
      .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Document storage is not configured' } } });

    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);
    await user.upload(screen.getByLabelText(/attach document/i), new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await fillRequired();
    await user.click(screen.getByText('Save Log'));

    expect(await screen.findByText('Interaction saved; document not attached: Document storage is not configured')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close without document/i }));
    expect(mockOnSave).toHaveBeenCalled();
  }, 20000);

  it('date field: empty is not sent', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'log-1' } });
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);
    await fillRequired();
    fireEvent.click(screen.getByText('Save Log'));
    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    expect(postSpy.mock.calls[0][1]).not.toHaveProperty('interactionDate');
  }, 20000);

  it('date field: a future date rejected by the API shows its message', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 400, data: { message: 'Interaction date cannot be in the future.' } } });
    render(<InteractionLogForm open={true} onClose={mockOnClose} onSave={mockOnSave} investorId="inv-1" />);
    await fillRequired();
    fireEvent.change(screen.getByLabelText(/date it happened/i), { target: { value: '2099-01-01' } });
    fireEvent.click(screen.getByText('Save Log'));
    expect(await screen.findByText('Interaction date cannot be in the future.')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  }, 20000);

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
