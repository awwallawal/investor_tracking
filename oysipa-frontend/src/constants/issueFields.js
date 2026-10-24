import { todayLagos } from '../utils/dates';

// Investor issues register (story 11.7). Keep in sync with
// oysipa-backend/src/constants/issueFields.js (the model enums).

export const ISSUE_STATUSES = ['Open', 'In progress', 'Resolved', 'Closed unresolved', 'Withdrawn'];
export const RESOLVED = 'Resolved';
export const CLOSED_UNRESOLVED = 'Closed unresolved';
export const WITHDRAWN = 'Withdrawn';
// Owner rule (24 Oct 2026): closing an issue needs a note in `resolution`,
// whether it is resolved, closed unresolved or withdrawn. Only Resolved sets resolvedDate.
export const NOTE_REQUIRED_STATUSES = [RESOLVED, CLOSED_UNRESOLVED, WITHDRAWN];
export const NOTE_REQUIRED_MSG = 'A resolution / reason note is required to set this status.';

export const ISSUE_CATEGORIES = [
  'land/title',
  'permits/approvals',
  'tax/levies',
  'environment',
  'utilities/power',
  'security',
  'other',
];

export const REPORTED_VIA = ['web form', 'email', 'phone', 'visit', 'event', 'MDA'];

// MDAs: the list comes from GET /api/mdas (src/api/mdas.js, story 11.7c).

// Resolved-share bands (DLR 4.5): basic 50–75%, stretch above 75%.
export const BAND_LABELS = {
  'below basic': 'Below basic (under 50%)',
  basic: 'Basic band (50–75%)',
  stretch: 'Stretch band (over 75%)',
};

export const STATUS_COLORS = {
  Open: 'warning',
  'In progress': 'info',
  Resolved: 'success',
  'Closed unresolved': 'default',
  Withdrawn: 'default',
};

// Years offered in the issue filters and the dashboard: this year back to 2023.
export const issueYears = () => {
  const current = Number(todayLagos().slice(0, 4));
  const years = [];
  for (let y = current; y >= 2023; y -= 1) years.push(y);
  return years;
};
