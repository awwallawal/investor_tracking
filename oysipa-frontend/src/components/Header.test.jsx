import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import Header from './Header';

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

describe('Header — global search (placeholder until 11.15)', () => {
  beforeEach(() => {
    localStorage.setItem('token', tokenWith({ id: 'u1', role: 'Director-General', name: 'Adeola Ade' }));
  });
  afterEach(() => localStorage.removeItem('token'));

  it('has the placeholder and the Ctrl K hint', () => {
    renderHeader();
    expect(screen.getByLabelText('Search investors…')).toHaveAttribute('placeholder', 'Search investors…');
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
  });

  it('typing "agro" + Enter goes to /investors?q=agro', async () => {
    renderHeader();
    await userEvent.type(screen.getByLabelText('Search investors…'), 'agro{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/investors?q=agro');
  });

  it('text with spaces and symbols is encoded and trimmed', async () => {
    renderHeader();
    await userEvent.type(screen.getByLabelText('Search investors…'), '  Lakeside & Co {Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/investors?q=Lakeside+%26+Co');
  });

  it('empty (or spaces only) + Enter → no navigation', async () => {
    renderHeader();
    const box = screen.getByLabelText('Search investors…');
    await userEvent.type(box, '{Enter}');
    await userEvent.type(box, '   {Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/);
  });

  it('Ctrl K focuses the search box', () => {
    renderHeader();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByLabelText('Search investors…')).toHaveFocus();
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
  });

  it('Ctrl K is ignored while a dialog is open', () => {
    render(
      <MemoryRouter>
        <Header onDrawerToggle={() => {}} />
        <div role="dialog" aria-label="Some dialog"><button type="button">ok</button></div>
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByLabelText('Search investors…')).not.toHaveFocus();
  });

  it('shows "⌘K" on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    renderHeader();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.queryByText('Ctrl K')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('Enter while an IME composition is open does not search', () => {
    renderHeader();
    const box = screen.getByLabelText('Search investors…');
    fireEvent.change(box, { target: { value: 'agro' } });
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/investors?q=agro');
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
    expect(screen.queryByLabelText('Search investors…')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    vi.restoreAllMocks();
  });

  it('no token → no search box and no user chip', () => {
    renderHeader();
    expect(screen.queryByLabelText('Search investors…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Account/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });
});
