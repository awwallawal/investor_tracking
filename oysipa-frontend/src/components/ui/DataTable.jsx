import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import EmptyState from './EmptyState';

const hideOnPhoneSx = { display: { xs: 'none', sm: 'table-cell' } };

const defaultCompare = (a, b) => {
  const empty = (v) => v === undefined || v === null || v === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1; // empties last
  if (empty(b)) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

// A list table: optional client-side sort (per column) and paging, an empty
// state, and an optional row link. It scrolls sideways inside its own box so
// the page never does.
//
// columns: [{ key, label, render(row), sortable, sortKey, sortValue(row), align, hideOnPhone, width }]
// (sortKey: the sort's name when it differs from key, e.g. the server's sort key)
// rowLink(row) → path: clicking the row (outside links and buttons) opens it.
//
// Controlled sort (story 11.15, the sort lives in the URL): pass `sort`
// ({ key, direction } or null) and `onSortChange(next)`. With `manualSort` the
// rows are shown in the order given (the server sorted them).
const DataTable = ({
  columns,
  rows,
  getRowKey = (row) => row._id ?? row.id,
  rowLink,
  emptyState,
  loading = false,
  pageSize = 25,
  minWidth,
  ariaLabel,
  initialSort = null, // { key, direction: 'asc' | 'desc' }
  resetKey, // back to the first page when this changes (e.g. a new search or filter)
  sort: controlledSort,
  onSortChange,
  manualSort = false,
}) => {
  const navigate = useNavigate();
  const [ownSort, setOwnSort] = useState(initialSort);
  const controlled = typeof onSortChange === 'function';
  const sort = controlled ? (controlledSort || null) : ownSort;
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort || manualSort) return rows;
    const col = columns.find((c) => (c.sortKey || c.key) === sort.key);
    if (!col) return rows;
    const value = col.sortValue || ((row) => row[col.key]);
    const dir = sort.direction === 'desc' ? -1 : 1;
    // Stable: equal values keep their server order.
    return rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const va = value(a.row);
        const vb = value(b.row);
        const empties = [va, vb].map((v) => v === undefined || v === null || v === '');
        // Empty values stay last in both directions.
        if (empties[0] !== empties[1]) return empties[0] ? 1 : -1;
        return (defaultCompare(va, vb) * dir) || (a.i - b.i);
      })
      .map(({ row }) => row);
  }, [rows, columns, sort, manualSort]);

  // Back to the first page only when the caller's resetKey changes.
  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    setPage(0);
  }, [resetKey]);

  // A shorter list never leaves an empty page: stay on the last valid one.
  const lastPage = pageSize ? Math.max(0, Math.ceil(sorted.length / pageSize) - 1) : 0;
  const currentPage = Math.min(page, lastPage);
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  const paged = pageSize && sorted.length > pageSize
    ? sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
    : sorted;

  const nextSort = (prev, key) => {
    if (!prev || prev.key !== key) return { key, direction: 'asc' };
    if (prev.direction === 'asc') return { key, direction: 'desc' };
    return null;
  };
  const toggleSort = (key) => {
    if (controlled) onSortChange(nextSort(sort, key));
    else setOwnSort((prev) => nextSort(prev, key));
    setPage(0);
  };

  const handleRowClick = (event, row) => {
    if (!rowLink) return;
    // Ctrl/Cmd/Shift/middle click, or selecting text, is not "open this row".
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && String(selection).trim()) return;
    // Links, buttons and inputs inside the row keep their own behaviour.
    if (event.target.closest('a, button, input, select, textarea, [role="button"], [role="combobox"]')) return;
    navigate(rowLink(row));
  };

  let body;
  if (loading && rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={columns.length}>
          <Typography variant="body2" color="text.secondary">Loading...</Typography>
        </TableCell>
      </TableRow>
    );
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={columns.length} sx={{ borderBottom: 0 }}>
          {emptyState || <EmptyState title="Nothing to show" />}
        </TableCell>
      </TableRow>
    );
  } else {
    body = paged.map((row) => (
      <TableRow
        hover
        key={getRowKey(row)}
        onClick={rowLink ? (e) => handleRowClick(e, row) : undefined}
        sx={rowLink ? { cursor: 'pointer' } : undefined}
      >
        {columns.map((col) => (
          <TableCell
            key={col.key}
            align={col.align}
            className={col.align === 'right' ? 'tabular-nums' : undefined}
            sx={col.hideOnPhone ? hideOnPhoneSx : undefined}
          >
            {col.render ? col.render(row) : row[col.key]}
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <Card sx={{ minWidth: 0 }}>
      <TableContainer sx={{ overflowX: 'auto', '&.MuiPaper-root, &': { border: 0, boxShadow: 'none' } }}>
        <Table aria-label={ariaLabel} sx={minWidth ? { minWidth } : undefined}>
          <TableHead>
            <TableRow>
              {columns.map((col) => {
                const active = sort?.key === (col.sortKey || col.key);
                let ariaSort;
                if (col.sortable) ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <TableCell
                    key={col.key}
                    align={col.align}
                    aria-sort={ariaSort}
                    sx={{ ...(col.hideOnPhone ? hideOnPhoneSx : {}), ...(col.width ? { width: col.width } : {}) }}
                  >
                    {col.sortable ? (
                      <TableSortLabel
                        active={active}
                        direction={active ? sort.direction : 'asc'}
                        onClick={() => toggleSort(col.sortKey || col.key)}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : col.label}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>{body}</TableBody>
        </Table>
      </TableContainer>
      {pageSize && sorted.length > pageSize && (
        <TablePagination
          component="div"
          count={sorted.length}
          page={currentPage}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[]}
          labelDisplayedRows={({ from, to, count }) => `Rows ${from}–${to} of ${count}`}
        />
      )}
    </Card>
  );
};

export default DataTable;
