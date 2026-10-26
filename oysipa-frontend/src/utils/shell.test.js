import { vi } from 'vitest';
import { initialsFor, isActivePath, searchShortcutLabel } from './shell';

describe('initialsFor', () => {
  it('two words of the name', () => expect(initialsFor({ name: 'Adeola Ade', role: 'Staff' })).toBe('AA'));
  it('one word → its first two letters', () => expect(initialsFor({ name: 'Folake', role: 'Staff' })).toBe('FO'));
  it('extra spaces are ignored', () => expect(initialsFor({ name: '  Adeola   Ade  ', role: 'Staff' })).toBe('AA'));
  it('empty or whitespace name → from the role', () => {
    expect(initialsFor({ name: '', role: 'Director-General' })).toBe('DG');
    expect(initialsFor({ name: '   ', role: 'Portal-Admin' })).toBe('PA');
    expect(initialsFor({ role: 'Staff' })).toBe('ST');
  });
  it('nothing at all → "?"', () => {
    expect(initialsFor(null)).toBe('?');
    expect(initialsFor({})).toBe('?');
  });
});

describe('isActivePath', () => {
  it('exact and nested routes', () => {
    expect(isActivePath('/investors', '/investors')).toBe(true);
    expect(isActivePath('/investors/abc', '/investors')).toBe(true);
    expect(isActivePath('/investorsx', '/investors')).toBe(false);
  });
  it('a trailing slash is ignored', () => {
    expect(isActivePath('/investors/', '/investors')).toBe(true);
    expect(isActivePath('/investors', '/investors/')).toBe(true);
  });
  it('the root matches only itself', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/investors', '/')).toBe(false);
    expect(isActivePath('/', '/investors')).toBe(false);
  });
  it('is case-insensitive', () => {
    expect(isActivePath('/Investors/ABC', '/investors')).toBe(true);
  });
});

describe('searchShortcutLabel', () => {
  afterEach(() => vi.restoreAllMocks());
  it('"⌘K" on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(searchShortcutLabel()).toBe('⌘K');
  });
  it('"Ctrl K" elsewhere', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(searchShortcutLabel()).toBe('Ctrl K');
  });
});
