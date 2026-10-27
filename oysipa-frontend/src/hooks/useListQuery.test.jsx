import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import useListQuery from './useListQuery';
import {
  canonicalQuery, parseQuery, resultCountLabel, totalFromResponse,
} from '../utils/listQuery';

const SPEC = {
  q: 'text',
  sector: { type: 'multi', options: ['Agribusiness', 'Manufacturing', 'Not recorded'] },
  officer: { type: 'multi', pattern: /^(me|unassigned|[0-9a-f]{24})$/ },
  firstContactYear: { type: 'year', allowNone: true },
  hasValue: 'flag',
  noContactDays: { type: 'int', min: 1, max: 3650 },
  from: 'date',
  sort: { type: 'sort', keys: ['name', 'sector'] },
};

let lq;
let location;
let navigate;
const Probe = () => {
  lq = useListQuery(SPEC);
  location = useLocation();
  navigate = useNavigate();
  return (
    <div>
      <input aria-label="search" value={lq.searchInput} onChange={(e) => lq.setSearchInput(e.target.value)} />
      <span data-testid="params">{JSON.stringify(lq.apiParams)}</span>
    </div>
  );
};
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><Probe /></MemoryRouter>);

describe('utils/listQuery', () => {
  it('parses multi values (comma-separated), canonical spelling, drops unknown values', () => {
    const v = parseQuery(SPEC, 'sector=agribusiness,Space,Manufacturing,Agribusiness&officer=me,bad id&firstContactYear=2025,none,20x5&hasValue=true&noContactDays=0&from=2026-02-30');
    expect(v.sector).toEqual(['Agribusiness', 'Manufacturing']);
    expect(v.officer).toEqual(['me']);
    expect(v.firstContactYear).toEqual(['2025', 'none']);
    expect(v.hasValue).toBe(true);
    expect(v.noContactDays).toBe('');
    expect(v.from).toBe('');
  });

  it('canonical query: spec order, valid values only, optional sort', () => {
    expect(canonicalQuery(SPEC, 'sort=-name&sector=Manufacturing&q=%20agro%20&x=1')).toBe('q=agro&sector=Manufacturing&sort=-name');
    expect(canonicalQuery(SPEC, 'sort=-name&sector=Manufacturing', { withSort: false })).toBe('sector=Manufacturing');
    expect(canonicalQuery(SPEC, 'sort=height')).toBe('');
  });

  it('result count and total header', () => {
    expect(resultCountLabel(12, 177, 'investor')).toBe('12 of 177 investors');
    expect(resultCountLabel(1, null, 'issue')).toBe('1 issue');
    expect(totalFromResponse({ headers: { 'x-total-count': '42' } })).toBe(42);
    expect(totalFromResponse({ headers: {} })).toBeNull();
  });
});

describe('useListQuery', () => {
  it('reads the URL into api params (unknown values ignored)', () => {
    renderAt('/investors?sector=Agribusiness,Nowhere&hasValue=1&sort=-name');
    expect(lq.values.sector).toEqual(['Agribusiness']);
    expect(lq.apiParams).toEqual({ sector: 'Agribusiness', hasValue: '1', sort: '-name' });
    expect(lq.sort).toEqual({ key: 'name', direction: 'desc' });
    expect(lq.activeCount).toBe(2);
  });

  it('filter changes add history entries: Back restores the previous filters', () => {
    renderAt('/investors');
    act(() => lq.toggle('sector', 'Agribusiness'));
    expect(location.search).toBe('?sector=Agribusiness');
    act(() => lq.toggle('sector', 'Manufacturing'));
    expect(lq.values.sector).toEqual(['Agribusiness', 'Manufacturing']);
    expect(location.search).toBe('?sector=Agribusiness&sector=Manufacturing');
    expect(lq.apiParams).toEqual({ sector: ['Agribusiness', 'Manufacturing'] });
    act(() => navigate(-1));
    expect(lq.values.sector).toEqual(['Agribusiness']);
    act(() => lq.remove('sector', 'Agribusiness'));
    expect(location.search).toBe('');
  });

  it('the search box writes ?q= after the pause; a URL change from outside updates the box', () => {
    vi.useFakeTimers();
    try {
      renderAt('/investors?q=old');
      expect(screen.getByLabelText('search')).toHaveValue('old');
      fireEvent.change(screen.getByLabelText('search'), { target: { value: 'lake' } });
      expect(location.search).toBe('?q=old');
      act(() => { vi.advanceTimersByTime(300); });
      expect(location.search).toBe('?q=lake');
      act(() => navigate('/investors?q=forest'));
      expect(screen.getByLabelText('search')).toHaveValue('forest');
      act(() => lq.clearSearch());
      expect(screen.getByLabelText('search')).toHaveValue('');
      expect(location.search).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('applyQuery opens a view; clearAll keeps the sort and other params', () => {
    renderAt('/investors?sector=Manufacturing&sort=name&tab=x');
    act(() => lq.applyQuery('officer=me&q=agro'));
    expect(lq.values.sector).toEqual([]);
    expect(lq.values.officer).toEqual(['me']);
    expect(screen.getByLabelText('search')).toHaveValue('agro');
    expect(lq.sort).toEqual({ key: 'name', direction: 'asc' });
    expect(lq.canonical('q=agro&officer=me&sort=name')).toBe(lq.filterKey);
    act(() => lq.clearAll());
    expect(location.search).toBe('?sort=name&tab=x');
  });

  it('typing not yet written is dropped when Back restores an entry (never written onto it)', () => {
    vi.useFakeTimers();
    try {
      renderAt('/investors?q=old');
      act(() => lq.toggle('sector', 'Agribusiness'));
      fireEvent.change(screen.getByLabelText('search'), { target: { value: 'pending' } });
      act(() => navigate(-1));
      expect(screen.getByLabelText('search')).toHaveValue('old');
      act(() => { vi.advanceTimersByTime(500); });
      expect(location.search).toBe('?q=old');
    } finally {
      vi.useRealTimers();
    }
  });

  it('chips: one per value, removable', () => {
    renderAt('/investors?sector=Agribusiness,Manufacturing&hasValue=1&q=agro');
    const chips = lq.chips({ q: 'Search', sector: 'Sector', hasValue: 'With a value' });
    expect(chips.map((c) => c.label)).toEqual(['Search: "agro"', 'Sector: Agribusiness', 'Sector: Manufacturing', 'With a value']);
    act(() => chips[2].onRemove());
    expect(lq.values.sector).toEqual(['Agribusiness']);
  });
});
