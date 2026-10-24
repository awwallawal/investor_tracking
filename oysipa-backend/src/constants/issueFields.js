// Investor issues register (story 11.7, SABER DLR 4.5). Single source for the
// model enums. The frontend keeps a copy in oysipa-frontend/src/constants/issueFields.js.
// Field names stay compatible with the parked v2 Grievance Redress epic (Epic 7).

const ISSUE_STATUSES = ['Open', 'In progress', 'Resolved', 'Closed unresolved', 'Withdrawn'];
const RESOLVED = 'Resolved';
const WITHDRAWN = 'Withdrawn';
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

// MDAs an issue can be referred to. `mou: true` marks the MDAs in OYSIPA's MoU
// (Lands, Commerce/Trade, Environment, Tax). The MoU has a fifth MDA that is not
// named yet: flag it here once it is.
const MDAS = [
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
const MDA_NAMES = MDAS.map((m) => m.name);

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
  DEFAULT_ISSUE_STATUS,
  ISSUE_CATEGORIES,
  REPORTED_VIA,
  MDAS,
  MDA_NAMES,
  BAND_BASIC_MIN,
  BAND_STRETCH_ABOVE,
  shareBand,
};
