import React from 'react';
import {
  render, screen, within, fireEvent, waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import Header from './Header';
import apiClient from '../api/api';

// Unsigned JWT-shaped token; jwtDecode only reads the payload.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const tokenWith = (user) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user })}.sig`;

const Location = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
};

const renderHeader = (path = '/dashboard') => render(
  <MemoryRouter initialEntries={[path]}>
    <Header onDrawerToggle={() => {}} />
    <Location />
  </MemoryRouter>
);

describe('Header — global search (11.15)', () => {
  beforeEach(() => {
    localStorage.setItem('token', tokenWith({ id: 'u1', role: 'Director-General', name: 'Adeola Ade' }));
  });
  afterEach(() => {
    localStorage.removeItem('token');
    vi.restoreAllMocks();
  });

  const searchDialog = () => screen.queryByRole('dialog', { name: 'Search everything' });

  it('has the search trigger with its placeholder and the Ctrl K hint', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'Search everything' });
    expect(trigger).toHaveTextContent('Search investors, projects, issues, announcements, files…');
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
    expect(searchDialog()).not.toBeInTheDocument();
  });

  it('clicking the box opens the search dialog with the input focused', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Search everything' }));
    expect(searchDialog()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Search everything' })).toHaveFocus());
  });

  it.each([['Ctrl K', { ctrlKey: true }], ['⌘K', { metaKey: true }]])('%s opens the search dialog', (label, mods) => {
    renderHeader();
    fireEvent.keyDown(window, { key: 'k', ...mods });
    expect(searchDialog()).toBeInTheDocument();
  });

  it('typing in the dialog searches every record type and Enter opens the record', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        q: 'iss-04',
        groups: [{
          type: 'issues', label: 'Issues', count: 1, seeAll: '/issues?q=iss-04',
          items: [{ _id: 's1', title: 'ISS-04 · Synthetic Co', subtitle: 'Open', to: '/issues/s1' }],
        }],
      },
    });
    renderHeader();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox', { name: 'Search everything' }), { target: { value: 'iss-04' } });
    expect(await screen.findByText('ISS-04 · Synthetic Co')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/search', { params: { q: 'iss-04' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search everything' }), { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/issues/s1');
    await waitFor(() => expect(searchDialog()).not.toBeInTheDocument());
  });

  it('Ctrl K is ignored while another input has focus', () => {
    render(
      <MemoryRouter>
        <Header onDrawerToggle={() => {}} />
        <input aria-label="Other field" />
      </MemoryRouter>
    );
    const other = screen.getByLabelText('Other field');
    other.focus();
    fireEvent.keyDown(other, { key: 'k', ctrlKey: true });
    expect(other).toHaveFocus();
    expect(searchDialog()).not.toBeInTheDocument();
  });

  it('Ctrl K is ignored while a dialog is open', () => {
    render(
      <MemoryRouter>
        <Header onDrawerToggle={() => {}} />
        <div role="dialog" aria-label="Some dialog"><button type="button">ok</button></div>
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(searchDialog()).not.toBeInTheDocument();
  });

  it('shows "⌘K" on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    renderHeader();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.queryByText('Ctrl K')).not.toBeInTheDocument();
  });

  it('has the compact OYSIPA mark (shown below md)', () => {
    renderHeader();
    expect(screen.getByRole('img', { name: 'OYSIPA' })).toBeInTheDocument();
  });
});

describe('Header — user chip', () => {
  afterEach(() => localStorage.removeItem('token'));

  it('token with a name: name + role + initials; the menu logs out', async () => {
    localStorage.setItem('token', tokenWith({ id: 'u1', role: 'Director-General', name: 'Adeola Ade' }));
    renderHeader();
    const chip = screen.getByRole('button', { name: 'Account: Adeola Ade, Director-General' });
    expect(within(chip).getByText('Adeola Ade')).toBeInTheDocument();
    expect(within(chip).getByText('Director-General')).toBeInTheDocument();
    expect(within(chip).getByText('AA')).toBeInTheDocument();

    await userEvent.click(chip);
    const menu = await screen.findByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Log out' }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('old token without a name: shows the role only, initials from the role', () => {
    localStorage.setItem('token', tokenWith({ id: 'u1', role: 'Portal-Admin' }));
    renderHeader();
    const chip = screen.getByRole('button', { name: 'Account: Portal-Admin' });
    expect(within(chip).getByText('Portal-Admin')).toBeInTheDocument();
    expect(within(chip).getByText('PA')).toBeInTheDocument();
    expect(within(chip).queryByText('undefined')).not.toBeInTheDocument();
  });

  it('a token that cannot be decoded: no chip, a plain Log out button', async () => {
    localStorage.setItem('token', 'not-a-jwt');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHeader();
    expect(screen.queryByRole('button', { name: /Account/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search everything' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    vi.restoreAllMocks();
  });

  it('no token → no search box and no user chip', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: 'Search everything' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Account/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });
});
