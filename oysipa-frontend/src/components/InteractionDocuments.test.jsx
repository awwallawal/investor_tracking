// Story 11.4b: two-date line, old-record fallback and private documents in the
// interaction list.
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import InteractionLogList from './InteractionLogList';
import apiClient from '../api/api';
import { dateLine, formatDate, lagosDay, mainDate, recordedNote } from '../utils/dates';

describe('dates helpers', () => {
  it('formats in Africa/Lagos as "18 Mar 2025"', () => {
    expect(formatDate('2025-03-18T00:00:00.000Z')).toBe('18 Mar 2025');
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    expect(lagosDay('2025-03-18T23:30:00.000Z')).toBe('2025-03-19');
  });

  it('mainDate uses the happened date, else createdAt', () => {
    expect(mainDate({ interactionDate: '2025-03-18T00:00:00.000Z', createdAt: '2026-10-19T09:00:00.000Z' }, 'interactionDate')).toBe('18 Mar 2025');
    expect(mainDate({ createdAt: '2023-10-27T12:00:00.000Z' }, 'interactionDate')).toBe('27 Oct 2023');
  });

  it('recordedNote only when the Lagos calendar days differ', () => {
    expect(recordedNote({ interactionDate: '2025-03-18T00:00:00.000Z', createdAt: '2026-10-19T09:00:00.000Z' }, 'interactionDate')).toBe('recorded 19 Oct 2026');
    expect(recordedNote({ interactionDate: '2026-10-19T00:00:00.000Z', createdAt: '2026-10-19T09:00:00.000Z' }, 'interactionDate')).toBeNull();
    expect(recordedNote({ createdAt: '2026-10-19T09:00:00.000Z' }, 'interactionDate')).toBeNull();
    expect(dateLine({ interactionDate: '2025-03-18T00:00:00.000Z', createdAt: '2026-10-19T09:00:00.000Z' }, 'interactionDate'))
      .toBe('18 Mar 2025 · recorded 19 Oct 2026');
  });
});

describe('InteractionLogList — dates and documents', () => {
  const investorId = 'inv-1';
  let popup;
  const paperLog = {
    _id: 'log-1',
    description: 'Paper meeting',
    category: 'Meeting',
    loggedBy: { name: 'Desk Officer' },
    interactionDate: '2025-03-18T00:00:00.000Z',
    createdAt: '2026-10-19T09:00:00.000Z',
    documents: [{ _id: 'doc-1', fileName: 'scan.pdf', mimeType: 'application/pdf', size: 10, documentDate: '2025-03-18T00:00:00.000Z', uploadedAt: '2026-10-19T09:01:00.000Z' }],
  };
  const sameDayLog = {
    _id: 'log-2', description: 'Today call', category: 'Call', loggedBy: { name: 'Desk Officer' },
    interactionDate: '2026-10-19T08:00:00.000Z', createdAt: '2026-10-19T08:00:01.000Z',
  };
  const oldLog = {
    _id: 'log-3', description: 'Old meeting', category: 'Meeting', loggedBy: { name: 'Desk Officer' },
    createdAt: '2023-10-27T12:00:00.000Z', documentUrl: 'https://res.cloudinary.com/demo/image/upload/a.pdf',
  };

  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (url.endsWith('/link')) return { data: { url: 'https://signed.example.test/doc-1', expiresAt: 'x' } };
      return { data: [paperLog, sameDayLog, oldLog] };
    });
    popup = { location: { href: '' }, close: vi.fn(), opener: window };
    vi.spyOn(window, 'open').mockImplementation(() => popup);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "18 Mar 2025 · recorded 19 Oct 2026", one date on the same day, and createdAt for old records', async () => {
    render(<InteractionLogList investorId={investorId} />);
    expect(await screen.findByText(/on 18 Mar 2025 · recorded 19 Oct 2026/)).toBeInTheDocument();
    const sameDay = screen.getByText(/Category: Call/);
    expect(sameDay).toHaveTextContent('on 19 Oct 2026');
    expect(sameDay).not.toHaveTextContent('recorded');
    const old = screen.getByText(/Category: Meeting \| By: Desk Officer on 27 Oct 2023/);
    expect(old).not.toHaveTextContent('recorded');
    // Legacy public link still shown and opens as before.
    expect(screen.getByRole('link', { name: '[View Document]' })).toHaveAttribute('href', oldLog.documentUrl);
  });

  it('View opens a tab synchronously, then points it at the signed link', async () => {
    render(<InteractionLogList investorId={investorId} />);
    await userEvent.click(await screen.findByRole('button', { name: 'View scan.pdf' }));
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(popup.location.href).toBe('https://signed.example.test/doc-1'));
    expect(popup.opener).toBeNull();
    expect(popup.close).not.toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledWith('/api/interactions/log-1/documents/doc-1/link');
  });

  it('View: pop-up blocked shows "Allow pop-ups to open documents" and fetches nothing', async () => {
    window.open.mockImplementation(() => null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<InteractionLogList investorId={investorId} />);
    await userEvent.click(await screen.findByRole('button', { name: 'View scan.pdf' }));
    expect(await screen.findByText('Allow pop-ups to open documents')).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/interactions/log-1/documents/doc-1/link');
  });

  it('View: storage not configured shows the message', async () => {
    apiClient.get.mockImplementation(async (url) => {
      if (url.endsWith('/link')) {
        const err = new Error('503');
        err.response = { status: 503, data: { message: 'Document storage is not configured' } };
        throw err;
      }
      return { data: [paperLog] };
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<InteractionLogList investorId={investorId} />);
    await userEvent.click(await screen.findByRole('button', { name: 'View scan.pdf' }));
    expect(await screen.findByText('Document storage is not configured')).toBeInTheDocument();
    // The blank tab opened for the click is closed again.
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe('');
  });

  it('Attach document only with canWrite; upload adds the document to the list', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { _id: 'doc-2', fileName: 'minutes.docx', documentDate: '2025-03-18T00:00:00.000Z', uploadedAt: '2026-10-19T10:00:00.000Z' },
    });
    const { unmount } = render(<InteractionLogList investorId={investorId} />);
    await screen.findByText('Paper meeting');
    expect(screen.queryByRole('button', { name: 'Attach document' })).not.toBeInTheDocument();
    unmount();

    render(<InteractionLogList investorId={investorId} canWrite />);
    await screen.findByText('Paper meeting');
    await userEvent.click(screen.getAllByRole('button', { name: 'Attach document' })[0]);
    const file = new File(['doc'], 'minutes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await userEvent.upload(screen.getByLabelText('Document file'), file);
    fireEvent.change(screen.getByLabelText(/document date/i), { target: { value: '2025-03-18' } });
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('button', { name: 'View minutes.docx' })).toBeInTheDocument();
    const [url, formData] = postSpy.mock.calls[0];
    expect(url).toBe('/api/interactions/log-1/documents');
    expect(formData.get('file').name).toBe('minutes.docx');
    expect(formData.get('documentDate')).toBe('2025-03-18');
  }, 20000);

  it('Attach: not configured (503) shows the message and keeps the dialog', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 503, data: { message: 'Document storage is not configured' } } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<InteractionLogList investorId={investorId} canWrite />);
    await screen.findByText('Paper meeting');
    await userEvent.click(screen.getAllByRole('button', { name: 'Attach document' })[0]);
    await userEvent.upload(screen.getByLabelText('Document file'), new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Document storage is not configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  }, 20000);

  it('Remove: DG/Admin only, after a confirmation', async () => {
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { deleted: { documents: 1 } } });
    const { unmount } = render(<InteractionLogList investorId={investorId} canWrite />);
    await screen.findByText('Paper meeting');
    expect(screen.queryByRole('button', { name: 'Remove scan.pdf' })).not.toBeInTheDocument();
    unmount();

    render(<InteractionLogList investorId={investorId} canDelete />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove scan.pdf' }));
    expect(delSpy).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/reason/i), 'Wrong file');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith('/api/interactions/log-1/documents/doc-1', { data: { reason: 'Wrong file' } }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'View scan.pdf' })).not.toBeInTheDocument());
  }, 20000);

  it('Tag services dialog corrects the happened date (sent only when changed)', async () => {
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { ...paperLog, interactionDate: '2025-03-17T00:00:00.000Z' } });
    render(<InteractionLogList investorId={investorId} canWrite />);
    await screen.findByText('Paper meeting');
    await userEvent.click(screen.getAllByRole('button', { name: 'Tag services' })[0]);
    const dateInput = screen.getByLabelText(/date it happened/i);
    expect(dateInput).toHaveValue('2025-03-18');
    fireEvent.change(dateInput, { target: { value: '2025-03-17' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save tags' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/interactions/log-1', {
      serviceCodes: [], creditLinkage: false, interactionDate: '2025-03-17',
    }));
    expect(await screen.findByText(/on 17 Mar 2025 · recorded 19 Oct 2026/)).toBeInTheDocument();
  }, 20000);
});
