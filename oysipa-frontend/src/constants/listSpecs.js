// URL filter specs of every list (story 11.15), one place so the built-in
// views and the dashboard links can be checked against them
// (listSpecs.test.js). Format: see utils/listQuery.js.
import { SECTOR_VALUES } from './sectors';
import { CURRENCIES, LEAD_SOURCES, ORGANISATION_TYPES } from './investorFields';
import { SERVICE_CODES } from './serviceCodes';
import { ISSUE_CATEGORIES, ISSUE_STATUSES, issueYears } from './issueFields';
import { CHANGELOG_ACTIONS, CHANGELOG_ENTITIES } from '../api/changelog';
import { EVIDENCE_LIST_SPEC } from '../api/evidence';
import { OBJECT_ID, OFFICER_PATTERN, USER_PATTERN } from '../utils/listQuery';

export const MAX_COUNTRY = 100;

// Categories officers pick in the interaction form (System Update is written by the app).
export const INTERACTION_CATEGORIES = ['Meeting', 'Call', 'Email', 'Site Visit', 'System Update', 'Other'];

export const INVESTOR_SPEC = {
  q: 'text',
  sector: { type: 'multi', options: SECTOR_VALUES },
  // Free text ("Korea, Republic of"): one value is never split on commas.
  country: { type: 'multi', pattern: new RegExp(`^.{1,${MAX_COUNTRY}}$`), split: false },
  leadSource: { type: 'multi', options: LEAD_SOURCES },
  organisationType: { type: 'multi', options: ORGANISATION_TYPES },
  // Status names come from the API; any name is passed (no match → no investors).
  stage: { type: 'multi' },
  officer: { type: 'multi', pattern: OFFICER_PATTERN },
  firstContactYear: { type: 'year', allowNone: true },
  hasValue: 'flag',
  noContactDays: { type: 'int', min: 1, max: 3650 },
  incomplete: 'flag',
  sort: { type: 'sort', keys: ['name', 'sector', 'country', 'firstContact'] },
};

export const PROJECT_SPEC = {
  q: 'text',
  sector: { type: 'multi', options: SECTOR_VALUES },
  lifecycleStatus: { type: 'multi' },
  currency: { type: 'multi', options: CURRENCIES },
  hasValue: 'flag',
  hasJobs: 'flag',
  // The projects the SABER report (11.9) checks for T1–T11 in that year.
  saberYear: { type: 'year' },
  investor: { type: 'multi', pattern: OBJECT_ID },
  officer: { type: 'multi', pattern: OFFICER_PATTERN },
  organisationType: { type: 'multi', options: ORGANISATION_TYPES },
  sort: { type: 'sort', keys: ['title', 'value', 'jobs', 'stage'] },
};

export const INTERACTION_SPEC = {
  q: 'text',
  category: { type: 'multi', options: INTERACTION_CATEGORIES },
  serviceCode: { type: 'multi', options: SERVICE_CODES.map((s) => s.code) },
  noCode: 'flag',
  // Credit-linkage interactions (the 11.9 SABER report card).
  creditLinkage: 'flag',
  // Logs with a happened date only (no recorded-date fallback for year), as the counts.
  dated: 'flag',
  // Officer logs only (no System Update rows), as the "Logged this month" card counts.
  officerLogs: 'flag',
  investor: { type: 'multi', pattern: OBJECT_ID },
  // The officer assigned to the log's investor (the "My work" card link).
  officer: { type: 'multi', pattern: OFFICER_PATTERN },
  loggedBy: { type: 'multi', pattern: USER_PATTERN },
  from: 'date',
  to: 'date',
  year: { type: 'year' },
  sort: { type: 'sort', keys: ['date'] },
};

export const ISSUE_SPEC = {
  q: 'text',
  status: { type: 'multi', options: ISSUE_STATUSES },
  category: { type: 'multi', options: ISSUE_CATEGORIES },
  // MDA codes come from GET /api/mdas; any code is passed (the server ignores unknown ones).
  mda: { type: 'multi' },
  year: { type: 'year' },
  stale: 'flag',
  investor: { type: 'multi', pattern: OBJECT_ID },
  officer: { type: 'multi', pattern: OFFICER_PATTERN },
  sort: { type: 'sort', keys: ['date'] },
};

// The year filter offers this year back to 2023 (as before); another ?year= is ignored.
export const ANNOUNCEMENT_SPEC = {
  q: 'text',
  year: { type: 'multi', options: issueYears().map(String) },
  oysipaNamed: { type: 'single', options: ['true', 'false'] },
  project: { type: 'multi', pattern: OBJECT_ID },
  // DLR 4.4 scope: projects of Intermediaries / Promotion agents left out (the dashboard card).
  counted: 'flag',
  from: 'date',
  to: 'date',
  sort: { type: 'sort', keys: ['date'] },
};

// Newest first only: no sort.
export const CHANGELOG_SPEC = {
  entity: { type: 'single', options: CHANGELOG_ENTITIES.map((e) => e.value) },
  action: { type: 'single', options: CHANGELOG_ACTIONS },
  by: { type: 'single' },
  batchId: { type: 'single', pattern: /^.{1,100}$/ },
  entityId: { type: 'single', pattern: OBJECT_ID },
  from: 'date',
  to: 'date',
};

export const LIST_SPECS = {
  investors: INVESTOR_SPEC,
  projects: PROJECT_SPEC,
  interactions: INTERACTION_SPEC,
  issues: ISSUE_SPEC,
  announcements: ANNOUNCEMENT_SPEC,
  evidence: EVIDENCE_LIST_SPEC,
  changelog: CHANGELOG_SPEC,
};

// The list a path opens (/investors?… → investors), or null.
export const listForPath = (path) => {
  const m = /^\/([a-z]+)\/?(\?|$)/.exec(path || '');
  return m && LIST_SPECS[m[1]] ? m[1] : null;
};
