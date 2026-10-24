import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import IssueDetailPage from './IssueDetailPage';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role, id = 'u1') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id, role } })}.sig`;

const issue = {
  _id: 'i1',
  investor: { _id: 'inv1', investorName: 'Synthetic Investor', assignedTo: 'u1' },
  category: 'land/title',
  description: 'C of O delayed',
  status: 'Open',
  dateReported: '2026-03-01T00:00:00.000Z',
  dateRegistered: '2026-03-02T10:00:00.000Z',
  createdAt: '2026-03-02T10:00:00.000Z',
  mdaResponsible: ['LANDS AND HOUSING', 'HOUSING', 'GONE'],
  actions: [
    { _id: 'a1', date: '2026-03-03T00:00:00.000Z', by: 'Lands desk', note: 'Letter to Lands', recordedBy: { name: 'Officer One' }, recordedAt: '2026-03-03T09:00:00.000Z' },
  ],
  files: [{ _id: 'f1', fileName: 'scan.pdf', uploadedAt: '2026-03-03T09:00:00.000Z' }],
};

const mdaList = [
  { code: 'LANDS AND HOUSING', name: 'Ministry of Lands and Housing', abbreviation: 'Lands & Housing', mou: true },
  { code: 'HOUSING', name: 'Oyo State Housing Corporation', abbreviation: 'Housing Corp', mou: false },
  { code: 'BIR', name: 'Board of Internal Revenue', abbreviation: 'BIR', mou: true },
  { code: 'OTHER', name: 'Other', abbreviation: 'Other', mou: false },
];
// GET /api/mdas gets the MDA list; every other GET gets `data`.
const mockGet = (data) => vi.spyOn(apiClient, 'get').mockImplementation((url) => Promise.resolve({ data: url === '/api/mdas' ? mdaList : data }));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/issues/i1']}>
    <Routes><Route path="/issues/:id" element={<IssueDetailPage />} /></Routes>
  </MemoryRouter>
);

describe('IssueDetailPage', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  it('shows the issue, MoU flag, the actions with who/when and the files', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet(issue);
    renderPage();
    expect(await screen.findByText('Synthetic Investor')).toBeInTheDocument();
    // 11.7c: names from GET /api/mdas, "(MoU)" when set, an unknown code as itself.
    expect(await screen.findByText('MDA responsible: Ministry of Lands and Housing (MoU), Oyo State Housing Corporation, GONE')).toBeInTheDocument();
    expect(screen.getByText('Letter to Lands')).toBeInTheDocument();
    expect(screen.getByText(/3 Mar 2026 · Lands desk · recorded by Officer One on 3 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText('scan.pdf')).toBeInTheDocument();
    // Assigned Staff can write; only DG/Admin can delete.
    expect(screen.getByRole('button', { name: 'Add action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('Staff not assigned: read only', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'someone-else'));
    mockGet(issue);
    renderPage();
    await screen.findByText('Letter to Lands');
    expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save status' })).not.toBeInTheDocument();
  });

  it('adds an action and shows it', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGet(issue);
    const added = { ...issue, files: undefined, actions: [...issue.actions, { _id: 'a2', date: '2026-03-04T00:00:00.000Z', by: 'DG', note: 'Site visit', recordedBy: { name: 'DG' }, recordedAt: '2026-03-04T09:00:00.000Z' }] };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: added });
    renderPage();
    await screen.findByText('Letter to Lands');
    await userEvent.type(screen.getByLabelText(/what was done/i), 'Site visit');
    await userEvent.click(screen.getByRole('button', { name: 'Add action' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/issues/i1/actions', { note: 'Site visit' }));
    expect(await screen.findByText('Site visit')).toBeInTheDocument();
    // Files are kept after an update.
    expect(within(document.body).getByText('scan.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
  it.each([
    ['Withdrawn', 'Investor withdrew the complaint'],
    ['Closed unresolved', 'Investor relocated out of state'],
  ])('shows the note for %s', async (status, resolution) => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet({ ...issue, status, resolution });
    renderPage();
    expect(await screen.findByText(`${status}: ${resolution}`)).toBeInTheDocument();
  });

  it('shows the Resolved note with its date (unchanged)', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet({ ...issue, status: 'Resolved', resolution: 'Title issued', resolvedDate: '2026-04-01T10:00:00.000Z' });
    renderPage();
    expect(await screen.findByText(/^Resolved .*2026: Title issued$/)).toBeInTheDocument();
  });
});

describe('IssueDetailPage — reference and Edit details (11.7b)', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  const withRef = {
    ...issue, reference: 'ISS-09', reportedVia: 'visit', projectText: 'Old project text',
  };

  it('shows the reference in the breadcrumb and the title area', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet(withRef);
    renderPage();
    await screen.findByText('Synthetic Investor');
    expect(screen.getByText('ISS-09').closest('nav')).toBeInTheDocument();
    expect(screen.getByText('Issue ISS-09')).toBeInTheDocument();
  });

  it('falls back to the importRef when the issue has no reference yet', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet({ ...issue, importRef: 'ISS-03' });
    renderPage();
    await screen.findByText('Synthetic Investor');
    expect(screen.getByText('ISS-03').closest('nav')).toBeInTheDocument();
  });

  it('assigned Staff edits category and clears reported via; the page shows the saved values', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet(withRef);
    const saved = {
      ...withRef, files: undefined, category: 'tax/levies', reportedVia: undefined, projectText: undefined,
    };
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: saved });
    renderPage();
    await screen.findByText('Synthetic Investor');
    expect(screen.getByText(/via visit/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'tax/levies' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /reported via/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Not recorded' }));
    await userEvent.clear(within(dialog).getByLabelText('Project text'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save details' }));
    // Only the changed fields: the unknown stored code 'GONE' is not re-sent.
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/issues/i1', {
      category: 'tax/levies',
      reportedVia: '',
      projectText: '',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit details' })).not.toBeInTheDocument());
    expect(screen.getByText('tax/levies')).toBeInTheDocument();
    expect(screen.queryByText(/via visit/)).not.toBeInTheDocument();
    // Files are kept after the update.
    expect(screen.getByText('scan.pdf')).toBeInTheDocument();
  });

  it('edits the description: only the trimmed description is sent; empty keeps Save disabled', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGet(withRef);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ...withRef, files: undefined, description: 'C of O delayed at Lands' } });
    renderPage();
    await screen.findByText('Synthetic Investor');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    const field = within(dialog).getByRole('textbox', { name: /description/i });
    fireEvent.change(field, { target: { value: '   ' } });
    expect(within(dialog).getByRole('button', { name: 'Save details' })).toBeDisabled();
    expect(within(dialog).getByText('A description is required.')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '  C of O delayed at Lands ' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/issues/i1', { description: 'C of O delayed at Lands' }));
    expect(await screen.findByText('C of O delayed at Lands')).toBeInTheDocument();
  });

  it('a server error is shown in the dialog and nothing changes', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGet(withRef);
    vi.spyOn(apiClient, 'put').mockRejectedValue({ response: { status: 400, data: { message: 'Date reported cannot be in the future.' } } });
    renderPage();
    await screen.findByText('Synthetic Investor');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /category/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'security' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save details' }));
    expect(await within(dialog).findByText('Date reported cannot be in the future.')).toBeInTheDocument();
  });

  it('an unknown stored MDA code is marked in the picker and can be removed', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGet(withRef);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ...withRef, mdaResponsible: ['LANDS AND HOUSING', 'HOUSING'] } });
    renderPage();
    await screen.findByText('Synthetic Investor');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    const chip = (await within(dialog).findByText('GONE (not on the MDA list)')).closest('.MuiChip-root');
    await userEvent.click(chip.querySelector('.MuiChip-deleteIcon'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/issues/i1', { mdaResponsible: ['LANDS AND HOUSING', 'HOUSING'] }));
  });

  // GET /api/mdas → the list; the investor's projects URL → `projects` (or a
  // failure); every other GET → the issue.
  const mockGetWithProjects = (data, projects) => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
    if (url === '/api/mdas') return Promise.resolve({ data: mdaList });
    if (url === '/api/projects/investors/inv1/projects') return projects ? Promise.resolve({ data: projects }) : Promise.reject(new Error('down'));
    return Promise.resolve({ data });
  });

  it("picks one of the investor's projects: the PUT sends its _id", async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGetWithProjects(withRef, [{ _id: 'p1', projectTitle: 'Synthetic Plant' }, { _id: 'p2', projectTitle: 'Synthetic Farm' }]);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { ...withRef, project: { _id: 'p2', projectTitle: 'Synthetic Farm' } } });
    renderPage();
    await screen.findByText('Synthetic Investor');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^project$/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Synthetic Farm' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/issues/i1', { project: 'p2' }));
  });

  it('a failed project list shows an error; the current project stays selectable', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    mockGetWithProjects({ ...withRef, project: { _id: 'p1', projectTitle: 'Current Plant' } }, null);
    renderPage();
    await screen.findByText('Synthetic Investor');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit details' });
    expect(await within(dialog).findByText("Could not load this investor's projects.")).toBeInTheDocument();
    const select = within(dialog).getByRole('combobox', { name: /^project$/i });
    expect(select).toHaveTextContent('Current Plant');
    await userEvent.click(select);
    expect(await screen.findByRole('option', { name: 'Current Plant' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No project' })).toBeInTheDocument();
  });

  it('Staff not assigned sees no Edit details button', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'someone-else'));
    mockGet(withRef);
    renderPage();
    await screen.findByText('Letter to Lands');
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});
