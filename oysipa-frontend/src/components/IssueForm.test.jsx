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
const projects = { inv1: [{ _id: 'p1', projectTitle: 'Alpha Plant' }], inv2: [{ _id: 'p2', projectTitle: 'Beta Farm' }] };

const mockGets = () => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
  if (url === '/api/investors') return Promise.resolve({ data: investors });
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
    await choose(/mda responsible/i, /Ministry of Lands/);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/issues', {
      investor: 'inv1',
      category: 'land/title',
      description: 'C of O delayed',
      mdaResponsible: ['Ministry of Lands, Housing and Urban Development'],
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
});
