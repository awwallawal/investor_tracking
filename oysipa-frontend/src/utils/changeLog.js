// Display helpers for the Change log page (story 11.10).
import { TIME_ZONE, formatDate } from './dates';

export const SHORT_VALUE_LENGTH = 80;

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

// "24 Oct 2026, 14:05" (Lagos time), or '' when not a valid time.
export const formatTime = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? timeFormatter.format(d) : '';
};

// One value of a change as text: — for none, yes/no, Lagos dates, JSON for lists and objects.
export const formatChangeValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') {
    // Happened dates are stored as the day at 00:00Z: shown as the day only.
    if (ISO_DATE_TIME.test(value)) return value.endsWith('T00:00:00.000Z') ? formatDate(value) : formatTime(value);
    return value;
  }
  if (Array.isArray(value) && value.length === 0) return '[]';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// { text, full, long }: text is shortened with … when longer than `max`.
export const shortValue = (value, max = SHORT_VALUE_LENGTH) => {
  const full = formatChangeValue(value);
  if (full.length <= max) return { text: full, full, long: false };
  return { text: `${full.slice(0, max)}…`, full, long: true };
};
