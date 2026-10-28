import React from 'react';
import {
  render, screen, waitFor, within, fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import FillGapsPage from './FillGapsPage';
import apiClient from '../api/api';
import { FILL_GAPS_CHANGED_EVENT } from '../api/fillGaps';

// Story 11.17: Fill the gaps page (synthetic data).
vi.mock('../utils/dates', async (importOriginal) => ({
  ...(await importOriginal()),
  todayLagos: () => '2026-06-15',
}));

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenFor = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user: { id: 'u1', role } })}.sig`;

const log = (id, over = {}) => ({
  id, date: '2025-06-05', recorded: '2025-06-05', category: 'Meeting', description: `Meeting ${id}`, serviceCodes: [], ...over,
});
const project = (over = {}) => ({
  id: 'p1',
  title: 'Synthetic Plant',
  estimatedValue: 0,
  currency: 'NGN',
  location: 'Ibadan',
  estimatedNumberOfJobs: 0,
  missing: ['T5', 'T7', 'T8b', 'T10', 'T11'],
  fixable: true,
  untagged: [log('l1', { description: 'Site meeting' })],
  ...over,
});
const group = (over = {}, projects = [project()]) => ({
  investor: {
    id: 'i1', name: 'Synthetic Foods', keyContactPerson: 'C One', phoneNumber: '', email: 'a@example.com', leadSource: 'Unknown (pre-T11)', firstContactDate: '2025-02-01', t11: { leadSource: true, firstContact: false },
  },
  officer: { id: 'u1', name: 'Gaps Officer' },
  canEdit: true,
  canEditLeadSource: false,
  missing: ['T8b', 'T11'],
  untagged: [],
  fixable: true,
  projects,
  ...over,
});
const response = (groups, over = {}) => ({
  year: 2026,
  currentYear: 2026,
  officer: 'me',
  missing: [],
  q: '',
  summary: {
    checked: 10, complete: 4, completeShare: 0.4, fieldsFilledShare: 0.9, missing: { T5: 3, T6: 1, T7: 2, T8a: 0, T8b: 1, T8c: 0, T10: 2, T11: 1 },
  },
  total: groups.reduce((n, g) => n + g.projects.length, 0),
  groups,
  ...over,
});

let Location;
const LocationProbe = () => {
  Location = useLocation();
  return null;
};
const renderPage = (path = '/fill-gaps') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/fill-gaps" element={<><FillGapsPage /><LocationProbe /></>} />
    </Routes>
  </MemoryRouter>,
);
const lastParams = (spy) => spy.mock.calls.filter(([url]) => url === '/api/fill-gaps').at(-1)[1].params;
const card = (name) => screen.getByRole('article', { name });
const investorBlock = (name) => screen.getByRole('region', { name });

describe('FillGapsPage', () => {
  let getSpy;
  let data;
  beforeEach(() => {
    data = response([group()]);
    getSpy = vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url === '/api/fill-gaps') return Promise.resolve({ data, headers: {} });
      return Promise.resolve({ data: [] });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('token');
  });

  it('Staff: defaults to Mine and the current year; investor block with its project card', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage();
    expect(await screen.findByText('Synthetic Plant')).toBeInTheDocument();
    expect(lastParams(getSpy)).toEqual({ year: '2026', officer: 'me' });
    expect(screen.getByText('4 of 10 projects complete (40%)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
    const inv = investorBlock('Synthetic Foods');
    // Investor fields in the investor block, project fields on the card.
    expect(within(inv).getByLabelText('T8b phone')).toBeInTheDocument();
    expect(within(card('Synthetic Plant')).queryByLabelText('T8b phone')).not.toBeInTheDocument();
    expect(within(card('Synthetic Plant')).getByLabelText('T5 estimated value')).toBeInTheDocument();
    expect(within(card('Synthetic Plant')).getByLabelText('T7 estimated jobs')).toBeInTheDocument();
    expect(screen.queryByLabelText('T6 location')).not.toBeInTheDocument();
    // Staff: lead source locked.
    expect(within(inv).getByText(/Ask the DG or Portal-Admin to set it/)).toBeInTheDocument();
    expect(screen.queryByLabelText('T11 lead source')).not.toBeInTheDocument();
  });

  it('two projects of one investor: the investor fields appear once', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    data = response([group({}, [project(), project({ id: 'p2', title: 'Synthetic Depot', untagged: [log('l2')] })])]);
    renderPage();
    await screen.findByText('Synthetic Depot');
    expect(screen.getAllByLabelText('T8b phone')).toHaveLength(1);
    // One picker per log, each with its own id.
    const pickers = screen.getAllByRole('combobox', { name: 'Tag SABER codes' });
    expect(pickers).toHaveLength(2);
    expect(new Set(pickers.map((p) => p.id)).size).toBe(2);
  });

  it('DG: defaults to All; can set the lead source (no Intermediary referral here)', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    data = response([group({ canEditLeadSource: true })]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    expect(lastParams(getSpy)).toEqual({ year: '2026', officer: 'all' });
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByLabelText('T11 lead source'));
    expect(await screen.findByRole('option', { name: 'Business event or conference' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Intermediary referral' })).not.toBeInTheDocument();
  });

  it('filters come from and go to the URL (year, officer, missing, q)', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage('/fill-gaps?year=2025&officer=all&missing=T7&missing=XX&q=plant');
    await screen.findByText('Synthetic Plant');
    expect(lastParams(getSpy)).toEqual({
      year: '2025', officer: 'all', missing: 'T7', q: 'plant',
    });
    expect(screen.getByText('Missing T7 jobs')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mine' }));
    await waitFor(() => expect(new URLSearchParams(Location.search).get('officer')).toBe('me'));
    await userEvent.click(screen.getByRole('button', { name: 'All years' }));
    await waitFor(() => expect(new URLSearchParams(Location.search).get('year')).toBe('all'));
    await waitFor(() => expect(lastParams(getSpy)).toMatchObject({ year: 'all', officer: 'me' }));
  });

  it.each([
    ['officer=unassigned', { officer: 'unassigned' }],
    ['officer=0123456789abcdef01234567', { officer: '0123456789abcdef01234567' }],
    ['officer=bogus', { officer: 'me' }],
    ['year=1999', { year: '2026' }],
    ['year=2031', { year: '2026' }],
  ])('URL %s → %p (unknown → the default)', async (qs, expected) => {
    localStorage.setItem('token', tokenFor('Staff'));
    renderPage(`/fill-gaps?${qs}`);
    await screen.findByText('Synthetic Plant');
    expect(lastParams(getSpy)).toMatchObject(expected);
  });

  it('project Save sends only the changed fields (trimmed), then re-checks', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} });
    const changed = vi.fn();
    window.addEventListener(FILL_GAPS_CHANGED_EVENT, changed);
    renderPage();
    await screen.findByText('Synthetic Plant');
    const calls = getSpy.mock.calls.length;
    data = response([group({}, [project({ missing: ['T8b', 'T10', 'T11'] })])], { summary: { ...data.summary, complete: 5, completeShare: 0.5 } });
    const c = card('Synthetic Plant');
    await userEvent.type(within(c).getByLabelText('T5 estimated value'), '2,000,000');
    expect(within(c).getByText('= ₦2,000,000')).toBeInTheDocument();
    await userEvent.type(within(c).getByLabelText('T7 estimated jobs'), ' 25 ');
    await userEvent.click(within(c).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
    expect(putSpy).toHaveBeenCalledWith('/api/projects/p1', { estimatedValue: 2000000, estimatedNumberOfJobs: 25 });
    expect(patchSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(getSpy.mock.calls.length).toBe(calls + 1));
    expect(await screen.findByText('5 of 10 projects complete (50%)')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('T5 estimated value')).not.toBeInTheDocument());
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(FILL_GAPS_CHANGED_EVENT, changed);
  });

  it('a changed currency alone is sent', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    data = response([group({}, [project({ missing: ['T5'], estimatedValue: 0 })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    await userEvent.click(within(card('Synthetic Plant')).getByLabelText('Currency'));
    await userEvent.click(await screen.findByRole('option', { name: 'USD' }));
    await userEvent.click(within(card('Synthetic Plant')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('/api/projects/p1', { currency: 'USD' }));
  });

  it('investor Save goes to PUT /api/investors/:id (DG: date and lead source)', async () => {
    localStorage.setItem('token', tokenFor('Director-General'));
    data = response([group({ canEditLeadSource: true, investor: { ...group().investor, firstContactDate: '', t11: { leadSource: true, firstContact: true } } })]);
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByText('Synthetic Plant');
    const inv = investorBlock('Synthetic Foods');
    await userEvent.type(within(inv).getByLabelText('T8b phone'), '  0800 000 0001 ');
    fireEvent.change(within(inv).getByLabelText('T11 first-contact date'), { target: { value: '2025-03-01' } });
    await userEvent.click(within(inv).getByLabelText('T11 lead source'));
    await userEvent.click(await screen.findByRole('option', { name: 'Business event or conference' }));
    await userEvent.click(within(inv).getByRole('button', { name: 'Save investor' }));
    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('/api/investors/i1', {
      phoneNumber: '0800 000 0001', firstContactDate: '2025-03-01', leadSource: 'Business event or conference',
    }));
    expect(putSpy).toHaveBeenCalledTimes(1);
  });

  it('validation: bad amount, fractional jobs, email, future and too-early dates; nothing sent', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    data = response([group({ missing: ['T8c', 'T11'], investor: { ...group().investor, t11: { leadSource: false, firstContact: true } } }, [project({ missing: ['T5', 'T7'] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    const c = card('Synthetic Plant');
    for (const bad of ['0', '1e6', '0x1F', '1,5']) {
      await userEvent.clear(within(c).getByLabelText('T5 estimated value'));
      await userEvent.type(within(c).getByLabelText('T5 estimated value'), bad);
      await userEvent.click(within(c).getByRole('button', { name: 'Save' }));
      expect(await within(c).findByText(/Enter an amount greater than 0/)).toBeInTheDocument();
    }
    await userEvent.type(within(c).getByLabelText('T7 estimated jobs'), '2.5');
    await userEvent.click(within(c).getByRole('button', { name: 'Save' }));
    expect(await within(c).findByText('Enter a whole number greater than 0.')).toBeInTheDocument();
    const inv = investorBlock('Synthetic Foods');
    await userEvent.type(within(inv).getByLabelText('T8c email'), 'not-an-email');
    fireEvent.change(within(inv).getByLabelText('T11 first-contact date'), { target: { value: '2027-01-01' } });
    await userEvent.click(within(inv).getByRole('button', { name: 'Save investor' }));
    expect(await within(inv).findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(inv).getByText('The date cannot be in the future.')).toBeInTheDocument();
    fireEvent.change(within(inv).getByLabelText('T11 first-contact date'), { target: { value: '1980-01-01' } });
    await userEvent.click(within(inv).getByRole('button', { name: 'Save investor' }));
    expect(await within(inv).findByText('The date cannot be before 1 January 1990.')).toBeInTheDocument();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('server errors show on that block: validation message, 403 text', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const putSpy = vi.spyOn(apiClient, 'put').mockRejectedValueOnce({ response: { status: 400, data: { message: 'Email already used by another investor.' } } });
    data = response([group({ missing: ['T8c'] }, [project({ missing: ['T6'] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    const inv = investorBlock('Synthetic Foods');
    await userEvent.type(within(inv).getByLabelText('T8c email'), 'taken@example.com');
    await userEvent.click(within(inv).getByRole('button', { name: 'Save investor' }));
    expect(await within(inv).findByText(/Not saved: investor fields: Email already used by another investor\./)).toBeInTheDocument();
    putSpy.mockRejectedValueOnce({ response: { status: 403, data: { msg: 'Forbidden' } } });
    const c = card('Synthetic Plant');
    await userEvent.type(within(c).getByLabelText('T6 location'), 'Oyo');
    await userEvent.click(within(c).getByRole('button', { name: 'Save' }));
    expect(await within(c).findByText(/You can only change records of investors assigned to you\./)).toBeInTheDocument();
  });

  it('partial failure: says what saved and what did not; re-checks', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    vi.spyOn(apiClient, 'patch').mockRejectedValue({ response: { status: 400, data: { message: 'Invalid service code.' } } });
    data = response([group({ missing: [] }, [project({ missing: ['T6', 'T10'] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    const calls = getSpy.mock.calls.length;
    const c = card('Synthetic Plant');
    await userEvent.type(within(c).getByLabelText('T6 location'), 'Oyo');
    await userEvent.click(within(c).getByLabelText('Tag SABER codes'));
    await userEvent.click(await screen.findByRole('option', { name: /^M2/ }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(c).getByRole('button', { name: 'Save' }));
    expect(await within(c).findByText('Saved: project fields. Not saved: tags on 2025-06-05: Invalid service code.')).toBeInTheDocument();
    await waitFor(() => expect(getSpy.mock.calls.length).toBe(calls + 1));
    expect(within(c).getByLabelText('T6 location')).toHaveValue('');
  });

  it('tags an untagged interaction in place (PATCH), investor-level logs once on the investor', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} });
    data = response([group({ missing: [], untagged: [log('li', { description: 'Investor call' })] }, [project({ missing: ['T10'] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    expect(screen.getByText(/2025-06-05 · Meeting · Site meeting/)).toBeInTheDocument();
    expect(within(investorBlock('Investor-level interactions of Synthetic Foods')).getByText(/Investor call/)).toBeInTheDocument();
    const c = card('Synthetic Plant');
    await userEvent.click(within(c).getByLabelText('Tag SABER codes'));
    await userEvent.click(await screen.findByRole('option', { name: /^M2/ }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(c).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/api/interactions/l1', { serviceCodes: ['M2'] }));
  });

  it('"Log support" opens the interaction form for the project; past year presets 31 Dec', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { _id: 'new' } });
    data = response([group({ missing: [] }, [project({ missing: ['T10'], untagged: [] })])], { year: 2025 });
    renderPage('/fill-gaps?year=2025');
    await screen.findByText('Synthetic Plant');
    await userEvent.click(screen.getByRole('button', { name: 'Log support' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Date it happened')).toHaveValue('2025-12-31');
    expect(within(dialog).getByText('For T10 in 2025, the date must be in 2025 or earlier.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Interaction Description'), 'Support visit');
    await userEvent.click(within(dialog).getByLabelText('Service Category'));
    await userEvent.click(await screen.findByRole('option', { name: 'Meeting' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Log' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/projects/p1/interactions', expect.objectContaining({ interactionDate: '2025-12-31', description: 'Support visit' })));
  });

  it('the current year: Log support has no preset date', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    data = response([group({ missing: [] }, [project({ missing: ['T10'], untagged: [] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    await userEvent.click(screen.getByRole('button', { name: 'Log support' }));
    expect(within(await screen.findByRole('dialog')).getByLabelText('Date it happened')).toHaveValue('');
  });

  it('nothing the user can fix: no Save, a note', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    data = response([group({ missing: ['T11'], fixable: false }, [project({ missing: ['T11'], fixable: false, untagged: [] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing you can fill here/)).toBeInTheDocument();
  });

  it('a group the user may not edit is read-only and names the officer', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    data = response([group({ canEdit: false, fixable: false, officer: { id: 'u2', name: 'Other Officer' } })], { officer: 'all' });
    renderPage('/fill-gaps?officer=all');
    await screen.findByText('Synthetic Plant');
    expect(screen.getByText(/assigned to Other Officer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('T5 estimated value')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log support' })).not.toBeInTheDocument();
  });

  it('a complete project leaves the list after the re-check', async () => {
    localStorage.setItem('token', tokenFor('Staff'));
    vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} });
    data = response([group({ missing: [] }, [project({ missing: ['T6'] })])]);
    renderPage();
    await screen.findByText('Synthetic Plant');
    data = response([]);
    await userEvent.type(screen.getByLabelText('T6 location'), 'Oyo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Nothing to fill')).toBeInTheDocument();
    expect(screen.queryByText('Synthetic Plant')).not.toBeInTheDocument();
  });
});
