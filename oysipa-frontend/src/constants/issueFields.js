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

// `mou: true` marks the MDAs in OYSIPA's MoU (Lands, Commerce/Trade,
// Environment, Tax). The fifth MoU MDA is flagged once it is named.
export const MDAS = [
  { name: 'Ministry of Lands, Housing and Urban Development', mou: true },
  { name: 'Ministry of Trade, Investment and Cooperatives', mou: true },
  { name: 'Ministry of Environment and Natural Resources', mou: true },
  { name: 'Oyo State Internal Revenue Service (OYSIRS)', mou: true },
  { name: 'Office of the Surveyor-General', mou: false },
  { name: 'Ministry of Agriculture / OYSADA', mou: false },
  { name: 'Ministry of Culture and Tourism', mou: false },
  { name: 'Ministry of Public Works and Transport', mou: false },
  { name: 'Ministry of Energy and Mineral Resources', mou: false },
  { name: 'Ministry of Finance', mou: false },
  { name: 'Ministry of Justice', mou: false },
  { name: 'Local Government', mou: false },
  { name: 'OYSIPA', mou: false },
  { name: 'Other', mou: false },
];

export const isMouMda = (name) => MDAS.some((m) => m.name === name && m.mou);

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
