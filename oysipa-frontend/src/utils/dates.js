// Two dates on every dated record (FR-Y18): the officer-entered "happened" date
// is the main date; the server createdAt is the recorded time. All calendar
// days are Africa/Lagos days.

export const TIME_ZONE = 'Africa/Lagos';
export const MIN_HAPPENED_DAY = '1990-01-01';

const displayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
});
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// "18 Mar 2025", or '' when there is no valid date.
export const formatDate = (value) => {
  const d = toDate(value);
  return d ? displayFormatter.format(d) : '';
};

// Lagos calendar day as YYYY-MM-DD (the value a date input uses), or ''.
export const lagosDay = (value) => {
  const d = toDate(value);
  return d ? dayFormatter.format(d) : '';
};

export const todayLagos = () => lagosDay(new Date());

// The main date to show: the happened date, else the recorded createdAt.
export const mainDate = (record, field) => formatDate(record?.[field] || record?.createdAt);

// "recorded 19 Oct 2026" when the happened date and createdAt fall on different
// Lagos days; null when they are the same day or either is missing.
export const recordedNote = (record, field) => {
  const happened = lagosDay(record?.[field]);
  const recorded = lagosDay(record?.createdAt);
  if (!happened || !recorded || happened === recorded) return null;
  return `recorded ${formatDate(record.createdAt)}`;
};

// One line: "18 Mar 2025 · recorded 19 Oct 2026" or just "18 Mar 2025".
export const dateLine = (record, field) => {
  const main = mainDate(record, field);
  const note = recordedNote(record, field);
  return note ? `${main} · ${note}` : main;
};
