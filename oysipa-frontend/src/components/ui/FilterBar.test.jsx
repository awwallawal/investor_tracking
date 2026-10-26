import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import FilterBar from './FilterBar';

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
