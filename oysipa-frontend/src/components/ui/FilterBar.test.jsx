import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import FilterBar, {
  FacetFilter, ToggleFilter, DateRangeFilter, SortMenu,
} from './FilterBar';

describe('FilterBar', () => {
  it('lays out the search slot, filter slots, count, chips and Clear all', async () => {
    const removeA = vi.fn();
    const clearAll = vi.fn();
    render(
      <FilterBar
        search={<input aria-label="Search investors" />}
        filters={<select aria-label="Type"><option>All</option></select>}
        resultCount="12 of 177 investors"
        chips={[{ key: 'a', label: 'Agribusiness', onRemove: removeA }, { key: 'b', label: 'First contact 2025', onRemove: vi.fn() }]}
        onClearAll={clearAll}
      />
    );
    const bar = screen.getByRole('region', { name: 'Search and filters' });
    expect(within(bar).getByLabelText('Search investors')).toBeInTheDocument();
    expect(within(bar).getByLabelText('Type')).toBeInTheDocument();
    expect(within(bar).getByText('12 of 177 investors')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Agribusiness' }));
    expect(removeA).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(clearAll).toHaveBeenCalledTimes(1);
  });

  it('no chips → no Clear all', () => {
    render(<FilterBar search={<input aria-label="q" />} resultCount="3 results" onClearAll={() => {}} />);
    expect(screen.getByText('3 results')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it.each([0, '', null, undefined])('resultCount %p with no chips → nothing printed under the search', (count) => {
    const { container } = render(<FilterBar search={<input aria-label="q" />} resultCount={count} />);
    const bar = container.querySelector('section');
    expect(bar.textContent).toBe('');
    expect(bar.children).toHaveLength(1);
  });
});

describe('FilterBar controls (story 11.15)', () => {
  it('FacetFilter: pill shows the count; options toggle; counts shown; Clear', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FacetFilter label="Sector" options={[{ value: 'Agribusiness', label: 'Agribusiness', count: 4 }, 'Manufacturing']} selected={[]} onChange={onChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sector' }));
    const menu = screen.getByRole('menu', { name: 'Sector' });
    expect(within(menu).getByText('4')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Agribusiness/ }));
    expect(onChange).toHaveBeenLastCalledWith(['Agribusiness']);
    rerender(<FacetFilter label="Sector" options={['Agribusiness', 'Manufacturing']} selected={['Agribusiness']} onChange={onChange} />);
    expect(within(screen.getByRole('menu', { name: 'Sector' })).getByRole('menuitemcheckbox', { name: /Agribusiness/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Manufacturing/ }));
    expect(onChange).toHaveBeenLastCalledWith(['Agribusiness', 'Manufacturing']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear sector' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('FacetFilter single: choosing replaces; pill names the choice', async () => {
    const onChange = vi.fn();
    render(<FacetFilter single label="OYSIPA named" options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} selected={['true']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'OYSIPA named: Yes' })).toHaveTextContent('OYSIPA named · Yes');
    await userEvent.click(screen.getByRole('button', { name: 'OYSIPA named: Yes' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /No/ }));
    expect(onChange).toHaveBeenLastCalledWith(['false']);
  });

  it('FacetFilter searchable narrows the options', async () => {
    render(<FacetFilter searchable label="Country" options={['Nigeria', 'Ghana', 'China']} selected={[]} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Country' }));
    await userEvent.type(screen.getByLabelText('Find country'), 'gh');
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(1);
  });

  it('ToggleFilter is a pressed/unpressed pill', async () => {
    const onChange = vi.fn();
    render(<ToggleFilter label="With a value" active={false} onChange={onChange} />);
    const pill = screen.getByRole('button', { name: 'With a value' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pill);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('DateRangeFilter: Apply sends both days; from after to is refused; Clear', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<DateRangeFilter label="Date" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    const dialog = screen.getByRole('dialog', { name: 'Date' });
    fireEvent.change(within(dialog).getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(within(dialog).getByLabelText('To'), { target: { value: '2026-02-01' } });
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('To'), { target: { value: '2026-03-31' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-03-01', to: '2026-03-31' });
    rerender(<DateRangeFilter label="Date" from="2026-03-01" to="2026-03-31" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Date · 1 Mar 2026 – 31 Mar 2026/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Date ·/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '', to: '' });
  });

  it('SortMenu names the current sort and changes it', async () => {
    const onChange = vi.fn();
    const options = [{ value: null, label: 'Date, oldest first' }, { value: { key: 'date', direction: 'desc' }, label: 'Date, newest first' }];
    render(<SortMenu options={options} value={null} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Sort: Date, oldest first/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sort:/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Date, newest first' }));
    expect(onChange).toHaveBeenCalledWith({ key: 'date', direction: 'desc' });
  });
});
