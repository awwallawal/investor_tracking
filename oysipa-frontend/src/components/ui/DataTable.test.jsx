import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import DataTable from './DataTable';
import EmptyState from './EmptyState';

const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'jobs', label: 'Jobs', sortable: true, align: 'right' },
  { key: 'country', label: 'Country', hideOnPhone: true },
];
const rows = [
  { _id: '1', name: 'Bravo', jobs: 20, country: 'NG' },
  { _id: '2', name: 'alpha', jobs: 5, country: 'UK' },
  { _id: '3', name: 'Charlie', jobs: null, country: 'GH' },
];

const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

const Detail = () => <p>{`detail ${useParams().id}`}</p>;
const renderTable = (props = {}) => render(
  <MemoryRouter initialEntries={['/list']}>
    <Routes>
      <Route path="/list" element={<DataTable columns={columns} rows={rows} {...props} />} />
      <Route path="/items/:id" element={<Detail />} />
    </Routes>
  </MemoryRouter>
);

describe('DataTable', () => {
  it('renders rows in the given order with headers', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(names()).toEqual(['Bravo', 'alpha', 'Charlie']);
  });

  it('clicking a sortable header reorders rows and sets aria-sort (asc → desc → off)', async () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: 'Name' });
    expect(header).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Country' })).not.toHaveAttribute('aria-sort');

    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(names()).toEqual(['alpha', 'Bravo', 'Charlie']);

    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(names()).toEqual(['Charlie', 'Bravo', 'alpha']);

    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'none');
    expect(names()).toEqual(['Bravo', 'alpha', 'Charlie']);
  });

  it('numeric sort keeps empty values last in both directions', async () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: 'Jobs' });
    await userEvent.click(within(header).getByRole('button'));
    expect(names()).toEqual(['alpha', 'Bravo', 'Charlie']);
    await userEvent.click(within(header).getByRole('button'));
    expect(names()).toEqual(['Bravo', 'alpha', 'Charlie']);
  });

  it('0 rows → the empty state', () => {
    renderTable({ rows: [], emptyState: <EmptyState title="No investors yet" /> });
    expect(screen.getByRole('status')).toHaveTextContent('No investors yet');
  });

  it('0 rows while loading → Loading, not the empty state', () => {
    renderTable({ rows: [], loading: true, emptyState: <EmptyState title="No investors yet" /> });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pages on the client', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ _id: String(i), name: `Row ${i + 1}`, jobs: i, country: 'NG' }));
    renderTable({ rows: many, pageSize: 3 });
    expect(names()).toEqual(['Row 1', 'Row 2', 'Row 3']);
    expect(screen.getByText('Rows 1–3 of 7')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(names()).toEqual(['Row 4', 'Row 5', 'Row 6']);
  });

  it('no paging controls when everything fits', () => {
    renderTable();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  it('row link: clicking the row opens it; a button inside the row does not', async () => {
    const cols = [...columns, { key: 'act', label: 'Actions', render: () => <button type="button">Delete</button> }];
    renderTable({ columns: cols, rowLink: (row) => `/items/${row._id}` });
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(screen.queryByText(/detail/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('alpha'));
    expect(screen.getByText('detail 2')).toBeInTheDocument();
  });

  it('scrolls sideways inside its own box', () => {
    const { container } = renderTable({ minWidth: 880 });
    const box = container.querySelector('.MuiTableContainer-root');
    expect(getComputedStyle(box).overflowX).toBe('auto');
  });

  const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ _id: String(i), name: `Row ${i + 1}`, jobs: i, country: 'NG' }));
  const Harness = ({ rows: r, resetKey }) => (
    <MemoryRouter><DataTable columns={columns} rows={r} pageSize={3} resetKey={resetKey} /></MemoryRouter>
  );

  it('page 3, then fewer rows → the last valid page shows (never an empty page)', async () => {
    const { rerender } = render(<Harness rows={makeRows(9)} />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(names()).toEqual(['Row 7', 'Row 8', 'Row 9']);
    rerender(<Harness rows={makeRows(5)} />);
    expect(names()).toEqual(['Row 4', 'Row 5']);
    expect(screen.getByText('Rows 4–5 of 5')).toBeInTheDocument();
  });

  it('a re-render with a new (inline) rows array keeps the page; a new resetKey goes back to page 1', async () => {
    const { rerender } = render(<Harness rows={makeRows(9)} resetKey="a" />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(names()).toEqual(['Row 4', 'Row 5', 'Row 6']);
    rerender(<Harness rows={makeRows(9)} resetKey="a" />);
    expect(names()).toEqual(['Row 4', 'Row 5', 'Row 6']);
    rerender(<Harness rows={makeRows(9)} resetKey="b" />);
    expect(names()).toEqual(['Row 1', 'Row 2', 'Row 3']);
  });

  it('Ctrl/Cmd/middle click and selected text do not open the row', () => {
    renderTable({ rowLink: (row) => `/items/${row._id}` });
    const cell = screen.getByText('alpha');
    fireEvent.click(cell, { ctrlKey: true });
    fireEvent.click(cell, { metaKey: true });
    fireEvent.click(cell, { button: 1 });
    expect(screen.queryByText(/detail/)).not.toBeInTheDocument();

    const range = document.createRange();
    range.selectNodeContents(cell);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    fireEvent.click(cell);
    expect(screen.queryByText(/detail/)).not.toBeInTheDocument();

    window.getSelection().removeAllRanges();
    fireEvent.click(cell);
    expect(screen.getByText('detail 2')).toBeInTheDocument();
  });
});
