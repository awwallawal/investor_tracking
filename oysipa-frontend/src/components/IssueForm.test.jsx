import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import IssueForm from './IssueForm';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role, id = 'u1') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id, role } })}.sig`;

const investors = [
  { _id: 'inv1', investorName: 'Alpha Synthetic', assignedTo: 'u1' },
  { _id: 'inv2', investorName: 'Beta Synthetic', assignedTo: { _id: 'u1', name: 'Me' } },
  { _id: 'inv3', investorName: 'Gamma Synthetic', assignedTo: 'other' },
  { _id: 'inv4', investorName: 'Delta Synthetic' },
];
const mdaList = [
  { code: 'LANDS AND HOUSING', name: 'Ministry of Lands and Housing', abbreviation: 'Lands & Housing', mou: true },
  { code: 'HOUSING', name: 'Oyo State Housing Corporation', abbreviation: 'Housing Corp', mou: false },
  { code: 'BIR', name: 'Board of Internal Revenue', abbreviation: 'BIR', mou: true },
  { code: 'OTHER', name: 'Other', abbreviation: 'Other', mou: false },
];
const projects = { inv1: [{ _id: 'p1', projectTitle: 'Alpha Plant' }], inv2: [{ _id: 'p2', projectTitle: 'Beta Farm' }] };

const mockGets = () => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
  if (url === '/api/investors') return Promise.resolve({ data: investors });
  if (url === '/api/mdas') return Promise.resolve({ data: mdaList });
  const m = url.match(/\/api\/projects\/investors\/(\w+)\/projects/);
  return Promise.resolve({ data: (m && projects[m[1]]) || [] });
});

const choose = async (label, option) => {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
};

const projectReady = () => waitFor(() => expect(screen.getByRole('combobox', { name: /project/i })).not.toHaveAttribute('aria-disabled', 'true'));

describe('IssueForm', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  it('sends investor, category, trimmed description, MDAs and the chosen project', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'i1' } });
    const onSaved = vi.fn();
    render(<IssueForm open onClose={vi.fn()} onSaved={onSaved} />);
    await choose(/^investor/i, 'Alpha Synthetic');
    await projectReady();
    await choose(/project/i, 'Alpha Plant');
    await choose(/category/i, 'land/title');
    await userEvent.type(screen.getByLabelText(/description/i), '  C of O delayed  ');
    // 11.7c: searchable picker; typing "lands" offers the MoU-flagged name.
    await userEvent.type(screen.getByRole('combobox', { name: /mda responsible/i }), 'lands');
    await userEvent.click(await screen.findByRole('option', { name: 'Ministry of Lands and Housing (MoU)' }));
    await userEvent.clear(screen.getByRole('combobox', { name: /mda responsible/i }));
    await userEvent.type(screen.getByRole('combobox', { name: /mda responsible/i }), 'BIR');
    await userEvent.click(await screen.findByRole('option', { name: 'Board of Internal Revenue (MoU)' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/issues', {
      investor: 'inv1',
      category: 'land/title',
      description: 'C of O delayed',
      mdaResponsible: ['LANDS AND HOUSING', 'BIR'],
      project: 'p1',
    }));
    expect(onSaved).toHaveBeenCalledWith({ _id: 'i1' });
  }, 30000);

  it('the project clears when the investor changes', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'i1' } });
    render(<IssueForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    await choose(/^investor/i, 'Alpha Synthetic');
    await projectReady();
    await choose(/project/i, 'Alpha Plant');
    await choose(/^investor/i, 'Beta Synthetic');
    expect(screen.queryByText('Alpha Plant')).not.toBeInTheDocument();
    await choose(/category/i, 'other');
    await userEvent.type(screen.getByLabelText(/description/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).not.toHaveProperty('project');
    expect(post.mock.calls[0][1].investor).toBe('inv2');
  }, 30000);

  it('Staff sees only investors assigned to them (id or populated user)', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'u1'));
    mockGets();
    render(<IssueForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/investors'));
    await userEvent.click(screen.getByRole('combobox', { name: /^investor/i }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Alpha Synthetic', 'Beta Synthetic']);
  });

  it('a failed MDA list load shows "Could not load the MDA list."', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    vi.spyOn(apiClient, 'get').mockImplementation((url) => (url === '/api/mdas'
      ? Promise.reject(new Error('down'))
      : Promise.resolve({ data: url === '/api/investors' ? investors : [] })));
    render(<IssueForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByText('Could not load the MDA list.')).toBeInTheDocument();
  });

  it('MDA search matches the name or the abbreviation, with "(MoU)" in the options', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    render(<IssueForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    const box = screen.getByRole('combobox', { name: /mda responsible/i });
    await userEvent.type(box, 'lands');
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Ministry of Lands and Housing (MoU)']);
    await userEvent.clear(box);
    await userEvent.type(box, 'housing corp');
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Oyo State Housing Corporation']);
  }, 30000);
});
