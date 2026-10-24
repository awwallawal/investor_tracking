import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import AnnouncementForm from './AnnouncementForm';
import apiClient from '../api/api';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role, id = 'u1') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id, role } })}.sig`;

const investors = [
  { _id: 'inv1', investorName: 'Alpha Synthetic', assignedTo: 'u1' },
  { _id: 'inv2', investorName: 'Beta Synthetic', assignedTo: 'other' },
];
const projects = [
  { _id: 'p1', projectTitle: 'Alpha Plant', investor: { _id: 'inv1', investorName: 'Alpha Synthetic' } },
  { _id: 'p2', projectTitle: 'Beta Farm', investor: { _id: 'inv2', investorName: 'Beta Synthetic' } },
];
const mockGets = () => vi.spyOn(apiClient, 'get').mockImplementation((url) => {
  if (url === '/api/investors') return Promise.resolve({ data: investors });
  if (url === '/api/projects') return Promise.resolve({ data: projects });
  if (url === '/api/projects/investors/inv1/projects') return Promise.resolve({ data: [projects[0], { _id: 'p3', projectTitle: 'Alpha Annex' }] });
  return Promise.resolve({ data: [] });
});

const fillBasics = async () => {
  await userEvent.click(screen.getByRole('combobox', { name: /project/i }));
  await userEvent.click(await screen.findByRole('option', { name: 'Alpha Plant — Alpha Synthetic' }));
  fireEvent.change(screen.getByLabelText(/announcement date/i), { target: { value: '2026-04-23' } });
  fireEvent.change(screen.getByRole('textbox', { name: /outlet/i }), { target: { value: '  State website ' } });
};

describe('AnnouncementForm', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('token'); });

  it('registers with project, date, outlet, links and OYSIPA named + role text', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'a1' } });
    const onSaved = vi.fn();
    render(<AnnouncementForm open onClose={vi.fn()} onSaved={onSaved} />);
    await fillBasics();
    fireEvent.change(screen.getByRole('textbox', { name: /^link/i }), { target: { value: 'https://news.example.test/a' } });
    await userEvent.click(screen.getByRole('switch', { name: 'OYSIPA named' }));
    const register = screen.getByRole('button', { name: 'Register' });
    expect(register).toBeDisabled(); // role text required when named
    expect(screen.getByText('Required when OYSIPA is named')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /what it says oysipa did/i }), { target: { value: 'Land allocation' } });
    await userEvent.click(register);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/announcements', {
      project: 'p1',
      announcementDate: '2026-04-23',
      outlet: 'State website',
      url: 'https://news.example.test/a',
      oysipaNamed: true,
      oysipaRoleText: 'Land allocation',
    }));
    expect(onSaved).toHaveBeenCalledWith({ _id: 'a1' });
  });

  it('a javascript: link blocks saving', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    render(<AnnouncementForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillBasics();
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: /^link/i }), { target: { value: 'javascript:x' } });
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });

  it('Staff only see projects of investors assigned to them', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'u1'));
    mockGets();
    render(<AnnouncementForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /project/i }));
    expect(await screen.findByRole('option', { name: 'Alpha Plant — Alpha Synthetic' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Beta Farm/ })).not.toBeInTheDocument();
  });

  it('with projectId: no project picker; posts that project', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'u1'));
    const get = mockGets();
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'a2' } });
    render(<AnnouncementForm open projectId="p9" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: /project/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/announcement date/i), { target: { value: '2026-04-23' } });
    fireEvent.change(screen.getByRole('textbox', { name: /outlet/i }), { target: { value: 'State website' } });
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/announcements', {
      project: 'p9', announcementDate: '2026-04-23', outlet: 'State website', oysipaNamed: false,
    }));
    expect(get).not.toHaveBeenCalled();
  });

  it('Staff with no assigned investors are told why the list is empty', async () => {
    localStorage.setItem('token', tokenFor('Staff', 'nobody'));
    mockGets();
    render(<AnnouncementForm open onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByText("You have no assigned investors' projects to register on.")).toBeInTheDocument();
  });

  it('editing an announcement whose project is missing says so', async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    const announcement = { _id: 'a1', project: null, announcementDate: '2026-04-23T00:00:00.000Z', outlet: 'Old', oysipaNamed: false };
    render(<AnnouncementForm open announcement={announcement} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("This announcement's project could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it("edit sends only the changed fields; the project list is the investor's", async () => {
    localStorage.setItem('token', tokenFor('Director-General', 'dg'));
    mockGets();
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { _id: 'a1', outlet: 'New' } });
    const announcement = {
      _id: 'a1',
      project: { _id: 'p1', projectTitle: 'Alpha Plant', investor: { _id: 'inv1', investorName: 'Alpha Synthetic' } },
      announcementDate: '2026-04-23T00:00:00.000Z',
      outlet: 'Old',
      url: 'https://a.example.test',
      oysipaNamed: false,
    };
    render(<AnnouncementForm open announcement={announcement} onClose={vi.fn()} onSaved={vi.fn()} />);
    const outlet = screen.getByRole('textbox', { name: /outlet/i });
    await userEvent.clear(outlet);
    await userEvent.type(outlet, 'New');
    await userEvent.clear(screen.getByRole('textbox', { name: /^link/i }));
    await userEvent.click(screen.getByRole('combobox', { name: /project/i }));
    expect(await screen.findByRole('option', { name: 'Alpha Annex — Alpha Synthetic' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/announcements/a1', { outlet: 'New', url: '' }));
  });
});
