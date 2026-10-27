import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import ChangeLogPage from './ChangeLogPage';
import apiClient from '../api/api';
import { formatChangeValue, shortValue } from '../utils/changeLog';

// Story 11.10: read-only Change log viewer.
const row = (n, extra = {}) => ({
  _id: `r${n}`,
  createdAt: '2026-10-24T13:05:00.000Z',
  byName: 'Desk Officer',
  role: 'Staff',
  entity: 'Investor',
  entityId: `6600000000000000000000${String(n).padStart(2, '0')}`,
  action: 'update',
  reason: null,
  changes: [{ field: 'phoneNumber', old: '0800 000 0001', new: '0800 000 0002' }],
  ...extra,
});

const page = (rows, total = rows.length, p = 1) => ({
  data: {
    rows, total, page: p, pageSize: 50,
  },
});

let location;
const LocationProbe = () => {
  location = useLocation();
  return null;
};
const renderPage = (start = '/changelog') => render(<MemoryRouter initialEntries={[start]}><LocationProbe /><ChangeLogPage /></MemoryRouter>);

// Story 11.15: the filters are pill menus (single choice) and a date-range popover.
const pick = async (facet, option) => {
  await userEvent.click(screen.getByRole('button', { name: facet }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
};
const setDates = async (from, to) => {
  await userEvent.click(screen.getByRole('button', { name: /^Date/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Date' });
  fireEvent.change(within(dialog).getByLabelText('From'), { target: { value: from } });
  fireEvent.change(within(dialog).getByLabelText('To'), { target: { value: to } });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
};

const USERS = [
  { _id: 'u-dg', name: 'DG User', role: 'Director-General' },
  { _id: 'u-staff', name: 'Desk Officer', role: 'Staff' },
];
const HEALTHY = {
  ok: true, failedWrites: 0, lastFailureAt: null, lastError: null, sinceRestart: 0,
};
// GET /api/users and /api/changelog/health get fixed answers; changelog GETs go to `changelog`.
const mockGet = (changelog, { health = HEALTHY } = {}) => vi.spyOn(apiClient, 'get').mockImplementation((url, config) => {
  if (url === '/api/users') return Promise.resolve({ data: USERS });
  if (url === '/api/changelog/health') return Promise.resolve({ data: health });
  if (url === '/api/views') return Promise.resolve({ data: [] });
  return changelog(url, config);
});

describe('ChangeLogPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows time, who, role, record, action and "field: old → new"', async () => {
    mockGet(() => Promise.resolve(page([row(1)])));
    renderPage();
    const tr = await screen.findByTestId('changelog-row');
    expect(within(tr).getByText('24 Oct 2026, 14:05')).toBeInTheDocument();
    expect(within(tr).getByText('Desk Officer')).toBeInTheDocument();
    expect(within(tr).getByText('Staff')).toBeInTheDocument();
    expect(within(tr).getByText('Investor · update')).toBeInTheDocument();
    expect(within(tr).getByText('660000000000000000000001')).toBeInTheDocument();
    expect(within(tr).getByTestId('change')).toHaveTextContent('phoneNumber: 0800 000 0001 → 0800 000 0002');
  });

  it('filters → query params; a filter change goes back to page 1', async () => {
    const get = mockGet(() => Promise.resolve(page([row(1)], 120)));
    renderPage();
    await screen.findByTestId('changelog-row');
    expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { page: 1 } });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { page: 2 } }));

    await pick('Record type', 'Issue');
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { entity: 'InvestorIssue', page: 1 } }));

    await pick('Action', 'update');
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { entity: 'InvestorIssue', action: 'update', page: 1 } }));

    await setDates('2026-10-01', '2026-10-24');
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', {
      params: {
        entity: 'InvestorIssue', action: 'update', from: '2026-10-01', to: '2026-10-24', page: 1,
      },
    }));
    // Story 11.15: the filters live in the URL, with chips.
    expect(location.search).toBe('?entity=InvestorIssue&action=update&from=2026-10-01&to=2026-10-24');
    expect(screen.getByText('Record type: Issue')).toBeInTheDocument();
    expect(screen.getByText('From 1 Oct 2026')).toBeInTheDocument();
  });

  it('filters in the URL on load are sent; unknown values are ignored; "export" is an action', async () => {
    const get = mockGet(() => Promise.resolve(page([row(1, { action: 'export' })], 3)));
    renderPage('/changelog?entity=Investor&action=export&by=u-staff&from=2026-10-01&to=bad');
    await screen.findByTestId('changelog-row');
    expect(get).toHaveBeenLastCalledWith('/api/changelog', {
      params: {
        entity: 'Investor', action: 'export', by: 'u-staff', from: '2026-10-01', page: 1,
      },
    });
    expect(screen.getByText('3 changes')).toBeInTheDocument();
    expect(await screen.findByText('Who: Desk Officer')).toBeInTheDocument();
  });

  it('Export this view sends the current filters (no page) to /api/export/changelog', async () => {
    const get = mockGet(() => Promise.resolve(page([row(1)], 120)));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    renderPage('/changelog?entity=InvestorIssue');
    await screen.findByTestId('changelog-row');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    get.mockImplementationOnce(async () => ({ data: new Blob(['x']), headers: {} }));
    await userEvent.click(screen.getByRole('button', { name: 'Export this view (CSV)' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/export/changelog', { params: { entity: 'InvestorIssue' }, responseType: 'blob' }));
  });

  it('paging: "1–50 of 120", Previous disabled on page 1, Next disabled on the last page', async () => {
    const get = mockGet((url, { params }) => Promise.resolve(
      page([row(params.page)], 120, params.page),
    ));
    renderPage();
    expect(await screen.findByText('1–50 of 120')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText('101–120 of 120')).toBeInTheDocument();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled());
    expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { page: 3 } });
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { page: 2 } }));
  });

  it('long values are shortened and expandable; lists, empty values, booleans and reasons render', async () => {
    const long = 'x'.repeat(200);
    mockGet(() => Promise.resolve(page([row(1, {
      entity: 'InvestorIssue',
      reason: 'migration: migrate-issue-mdas',
      changes: [
        { field: 'description', old: long, new: 'Short' },
        { field: 'mdaResponsible', old: ['Ministry of Lands'], new: ['LANDS AND HOUSING', 'BIR'] },
        { field: 'resolution', old: null, new: 'Done' },
        { field: 'oysipaNamed', old: false, new: true },
      ],
    })])));
    renderPage();
    const tr = await screen.findByTestId('changelog-row');
    const [description, mdas, resolution, named] = within(tr).getAllByTestId('change');
    expect(description).toHaveTextContent(`description: ${'x'.repeat(80)}…Show more → Short`);
    await userEvent.click(within(description).getByRole('button', { name: 'Show more' }));
    expect(description).toHaveTextContent(`description: ${long}Show less → Short`);
    expect(mdas).toHaveTextContent('mdaResponsible: Ministry of Lands → LANDS AND HOUSING, BIR');
    expect(resolution).toHaveTextContent('resolution: — → Done');
    expect(named).toHaveTextContent('oysipaNamed: no → yes');
    expect(within(tr).getAllByText(/migration: migrate-issue-mdas/).length).toBeGreaterThan(0);
    expect(within(tr).getByText('Issue · update')).toBeInTheDocument();
  });

  it('a create row without changes shows —; no rows → "No changes recorded"', async () => {
    let answer = page([row(1, { action: 'create', changes: undefined })]);
    mockGet(() => Promise.resolve(answer));
    renderPage();
    const tr = await screen.findByTestId('changelog-row');
    expect(within(tr).getByText('Investor · create')).toBeInTheDocument();
    answer = page([]);
    await pick('Action', 'delete');
    expect(await screen.findByText('No changes recorded for these filters.')).toBeInTheDocument();
  });

  it('403 → a clear message', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({ response: { status: 403, data: { msg: 'Forbidden' } } });
    renderPage();
    expect(await screen.findByText('Only the Director-General and Portal-Admin can view the change log.')).toBeInTheDocument();
  });
});

describe('ChangeLogPage review follow-ups', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a failed fetch clears the rows of the previous filters', async () => {
    let fail = false;
    mockGet(() => (fail ? Promise.reject({ response: { status: 500, data: { message: 'Server Error' } } }) : Promise.resolve(page([row(1)]))));
    renderPage();
    await screen.findByTestId('changelog-row');
    fail = true;
    await pick('Action', 'delete');
    expect(await screen.findByText('Server Error')).toBeInTheDocument();
    expect(screen.queryByTestId('changelog-row')).not.toBeInTheDocument();
  });

  it('"Who" lists the users and filters by user id; batch id filters too', async () => {
    const get = mockGet(() => Promise.resolve(page([row(1)])));
    renderPage();
    await screen.findByTestId('changelog-row');
    expect(get).toHaveBeenCalledWith('/api/users');
    await pick('Who', 'Desk Officer');
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { by: 'u-staff', page: 1 } }));
    fireEvent.change(screen.getByLabelText('Batch id'), { target: { value: ' batch-7 ' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { by: 'u-staff', batchId: 'batch-7', page: 1 } }));
  });

  it('clicking a record id filters by it; the chip clears it', async () => {
    const get = mockGet(() => Promise.resolve(page([row(1)])));
    renderPage();
    await screen.findByTestId('changelog-row');
    await userEvent.click(screen.getByRole('button', { name: '660000000000000000000001' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { entityId: '660000000000000000000001', page: 1 } }));
    expect(screen.getByText('Record 660000000000000000000001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Record 660000000000000000000001' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/changelog', { params: { page: 1 } }));
  });

  it('shows a warning when audit writes have failed; none when healthy', async () => {
    mockGet(() => Promise.resolve(page([row(1)])), {
      health: {
        ok: false, failedWrites: 2, lastFailureAt: '2026-10-24T13:05:00.000Z', lastError: 'down', sinceRestart: 0,
      },
    });
    renderPage();
    expect(await screen.findByText(/2 changes could not be written to the change log/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('no warning when healthy; the page says which records are covered and that values are best-effort', async () => {
    mockGet(() => Promise.resolve(page([row(1)])));
    renderPage();
    await screen.findByTestId('changelog-row');
    expect(screen.queryByText(/could not be written/)).not.toBeInTheDocument();
    expect(screen.getByText(/investors, projects, interactions, issues, announcements and the MoU MDAs setting/)).toBeInTheDocument();
    expect(screen.getByText(/deletes, imports and Evidence library file actions/)).toBeInTheDocument();
    expect(screen.getByText(/best-effort/)).toBeInTheDocument();
  });
});

describe('change value helpers', () => {
  it('formats values', () => {
    expect(formatChangeValue(null)).toBe('—');
    expect(formatChangeValue('')).toBe('—');
    expect(formatChangeValue(true)).toBe('yes');
    expect(formatChangeValue(3)).toBe('3');
    expect(formatChangeValue([])).toBe('[]');
    expect(formatChangeValue(['a', 'b'])).toBe('a, b');
    expect(formatChangeValue('2026-03-01T00:00:00.000Z')).toBe('1 Mar 2026');
    expect(formatChangeValue('2026-10-24T13:05:00.000Z')).toBe('24 Oct 2026, 14:05');
    expect(formatChangeValue([{ note: 'n' }])).toBe('[{"note":"n"}]');
    expect(shortValue('abc', 2)).toEqual({ text: 'ab…', full: 'abc', long: true });
    expect(shortValue('ab', 2)).toEqual({ text: 'ab', full: 'ab', long: false });
  });
});
