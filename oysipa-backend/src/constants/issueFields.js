// Investor issues register (story 11.7, SABER DLR 4.5). Single source for the
// model enums. The frontend keeps a copy in oysipa-frontend/src/constants/issueFields.js.
// Field names stay compatible with the parked v2 Grievance Redress epic (Epic 7).

const ISSUE_STATUSES = ['Open', 'In progress', 'Resolved', 'Closed unresolved', 'Withdrawn'];
const RESOLVED = 'Resolved';
const WITHDRAWN = 'Withdrawn';
const CLOSED_UNRESOLVED = 'Closed unresolved';
// Owner rule (24 Oct 2026): closing an issue needs a note in `resolution`,
// whether it is resolved, closed unresolved or withdrawn. Only Resolved sets resolvedDate.
const NOTE_REQUIRED_STATUSES = [RESOLVED, CLOSED_UNRESOLVED, WITHDRAWN];
const DEFAULT_ISSUE_STATUS = 'Open';

const ISSUE_CATEGORIES = [
  'land/title',
  'permits/approvals',
  'tax/levies',
  'environment',
  'utilities/power',
  'security',
  'other',
];

const REPORTED_VIA = ['web form', 'email', 'phone', 'visit', 'event', 'MDA'];

// MDAs: see constants/mdas.js (story 11.7c). Issues store MDA codes.

// Resolved-share bands (DLR 4.5): basic 50–75%, stretch above 75%.
const BAND_BASIC_MIN = 0.5;
const BAND_STRETCH_ABOVE = 0.75;
const shareBand = (share) => {
  if (share === null || share === undefined) return null;
  if (share > BAND_STRETCH_ABOVE) return 'stretch';
  if (share >= BAND_BASIC_MIN) return 'basic';
  return 'below basic';
};

module.exports = {
  ISSUE_STATUSES,
  RESOLVED,
  WITHDRAWN,
  CLOSED_UNRESOLVED,
  NOTE_REQUIRED_STATUSES,
  DEFAULT_ISSUE_STATUS,
  ISSUE_CATEGORIES,
  REPORTED_VIA,
  BAND_BASIC_MIN,
  BAND_STRETCH_ABOVE,
  shareBand,
};
