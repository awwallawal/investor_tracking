// Import investors dialog (11.11): dry-run tables, Run gating, error message.
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ImportInvestorsDialog from './ImportInvestorsDialog';
import apiClient from '../api/api';

vi.mock('../api/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const report = {
  counts: {
    records: 4, create: 2, update: 1, projectsToCreate: 2, interactionsToCreate: 1, duplicates: 1, interactionDuplicates: 0, errors: 1, interactionErrors: 0, warnings: 1,
  },
  create: [
    { row: 1, key: 'alpha', name: 'Alpha Co', organisationType: 'Investor', leadSource: 'Other', projects: [{ title: 'Alpha Mill', currency: 'USD' }], projectsSkipped: [] },
    { row: 2, key: 'beta', name: 'Beta Co', organisationType: 'Intermediary', leadSource: 'Other', projects: [], projectsSkipped: [] },
  ],
  update: [{ row: 3, key: 'old', name: 'Old Co', appName: 'Old Co Ltd', filled: ['phoneNumber'], conflicts: [{ field: 'sector', app: 'Tech', file: 'Agro' }], projects: [], projectsSkipped: ['Plant'] }],
  duplicates: [{ row: 4, kind: 'investor', key: 'dup', name: 'Dup Co', matches: 'Dup Company' }],
  errors: [{ row: 5, kind: 'record', key: 'gamma', name: 'Gamma Co', message: 'Lifecycle status "Execution" is not in the app.', missingStatus: 'Execution' }],
  warnings: [{ row: 2, key: 'beta', name: 'Beta Co', message: 'No firstContactDate in the file; the import date is used.' }],
  interactions: [{ row: 1, id: 'INT-1', name: 'Alpha Co', date: '2025-01-15', serviceCodes: ['A2'] }],
};

const jsonFile = (name = 'batch.json') => new File(['{"records":[]}'], name, { type: 'application/json' });
const choose = (file) => fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } });
const runButton = () => screen.getByRole('button', { name: 'Run import' });

describe('ImportInvestorsDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Run is disabled before the dry run; dry run shows the tables with errors and warnings first', async () => {
    apiClient.post.mockResolvedValue({ data: { confirmation: 'IMPORT 2', report } });
    render(<ImportInvestorsDialog open onClose={vi.fn()} />);
    expect(runButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeDisabled();

    choose(jsonFile());
    expect(runButton()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/investors/import/dry-run', expect.any(FormData)));
    const tables = await screen.findAllByRole('table');
    expect(tables.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Errors (skipped)', 'Warnings', 'To create', 'To update', 'Interactions to create', 'Duplicates (skipped)',
    ]);
    expect(within(tables[0]).getByText(/Execution/)).toBeInTheDocument();
    expect(within(tables[2]).getByText('Alpha Co')).toBeInTheDocument();
    expect(within(tables[3]).getByText('sector: app "Tech", file "Agro"')).toBeInTheDocument();
    expect(screen.getByText('To create: 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download report' })).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it('Run stays disabled while the text is wrong; the right text runs and shows the result', async () => {
    const onImported = vi.fn();
    apiClient.post.mockImplementation((url) => (url.endsWith('dry-run')
      ? Promise.resolve({ data: { confirmation: 'IMPORT 2', report } })
      : Promise.resolve({
        data: {
          batchId: 'b1', counts: { created: 2, updated: 1, fieldsFilled: 1, projectsCreated: 2, interactionsCreated: 1 }, errors: [], report,
        },
      })));
    render(<ImportInvestorsDialog open onClose={vi.fn()} onImported={onImported} />);
    choose(jsonFile());
    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    const confirm = await screen.findByLabelText(/type the confirmation/i);

    await userEvent.type(confirm, 'IMPORT 3');
    expect(runButton()).toBeDisabled();
    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'import 2');
    expect(runButton()).toBeDisabled();
    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'IMPORT 2');
    expect(runButton()).toBeEnabled();

    await userEvent.click(runButton());
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const [url, form] = apiClient.post.mock.calls[1];
    expect(url).toBe('/api/investors/import/run');
    expect(form.get('confirm')).toBe('IMPORT 2');
    expect(form.get('file')).toBeInstanceOf(File);
    expect(await screen.findByText(/Imported: 2 created, 1 updated/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  }, 20000);

  it('choosing another file needs a new dry run', async () => {
    apiClient.post.mockResolvedValue({ data: { confirmation: 'IMPORT 0', report: { ...report, counts: { ...report.counts, create: 0 } } } });
    render(<ImportInvestorsDialog open onClose={vi.fn()} />);
    choose(jsonFile('a.json'));
    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    await userEvent.type(await screen.findByLabelText(/type the confirmation/i), 'IMPORT 0');
    expect(runButton()).toBeEnabled();
    choose(jsonFile('b.json'));
    expect(runButton()).toBeDisabled();
    expect(screen.queryByLabelText(/type the confirmation/i)).not.toBeInTheDocument();
  });

  it('shows the server error message (dry run and run)', async () => {
    apiClient.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'The file has no "records" list.' } } });
    render(<ImportInvestorsDialog open onClose={vi.fn()} />);
    choose(jsonFile());
    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The file has no "records" list.');
    expect(runButton()).toBeDisabled();

    apiClient.post
      .mockResolvedValueOnce({ data: { confirmation: 'IMPORT 2', report } })
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Type "IMPORT 3" to confirm. Nothing was imported.' } } });
    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    await userEvent.type(await screen.findByLabelText(/type the confirmation/i), 'IMPORT 2');
    await userEvent.click(runButton());
    expect(await screen.findByText(/Nothing was imported/)).toBeInTheDocument();
  }, 20000);

  it('a run refused with a new confirmation (data changed) clears the dry run and asks for a new one', async () => {
    apiClient.post
      .mockResolvedValueOnce({ data: { confirmation: 'IMPORT 2', report } })
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Type "IMPORT 1" to confirm. Nothing was imported.', confirmation: 'IMPORT 1' } } });
    render(<ImportInvestorsDialog open onClose={vi.fn()} />);
    choose(jsonFile());
    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    await userEvent.type(await screen.findByLabelText(/type the confirmation/i), 'IMPORT 2');
    await userEvent.click(runButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/run the dry run again/);
    expect(screen.queryByLabelText(/type the confirmation/i)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    expect(runButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeEnabled();
  }, 20000);

  it('refuses a non-JSON file before sending it', async () => {
    render(<ImportInvestorsDialog open onClose={vi.fn()} />);
    choose(new File(['x'], 'list.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('.json');
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeDisabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
