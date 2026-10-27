// CSV writing (story 11.15 list exports). RFC 4180 quoting; a text cell that
// starts with = + - @ (or a tab / CR) is prefixed with ' so a spreadsheet never
// runs it as a formula, except a plain phone number or number (+234 801…,
// -5, (0)80-1234) which cannot be one and is kept as typed.
const { lagosDay } = require('../utils/happenedDate');

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^\+?[\d\s().-]+$/;

const cell = (value) => {
  if (value === undefined || value === null) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const row = (values) => values.map(cell).join(',');

// rows: arrays of cells. Lines end with CRLF; a BOM lets Excel read UTF-8.
const toCsv = (rows) => `﻿${rows.map(row).join('\r\n')}\r\n`;

// Date → YYYY-MM-DD (UTC: happened dates are stored as the day at 00:00Z).
const isoDay = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10);
};
// Instant → its Lagos calendar day (a recorded time standing in for a happened date).
const lagosIsoDay = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : lagosDay(t);
};
// Instant → full ISO time.
const isoTime = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString();
};

module.exports = {
  cell, row, toCsv, isoDay, isoTime, lagosIsoDay,
};
