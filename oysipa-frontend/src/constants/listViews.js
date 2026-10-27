// Built-in views per list (story 11.15), shown as tabs before the saved views.
// `query` uses the list's URL parameters (see each page's filter spec).
export const BUILT_IN_VIEWS = {
  investors: [
    { key: 'mine', label: 'Assigned to me', query: 'officer=me' },
    { key: 'no-contact', label: 'No contact in 60+ days', query: 'noContactDays=60' },
    { key: 'incomplete', label: 'Incomplete records', query: 'incomplete=1' },
    { key: 'no-first-contact', label: 'Missing first-contact date', query: 'firstContactYear=none' },
  ],
  issues: [
    { key: 'open', label: 'Open', query: 'status=Open&status=In+progress' },
    { key: 'stale', label: 'Stale', query: 'stale=1' },
  ],
  interactions: [
    { key: 'no-code', label: 'Without a SABER code', query: 'noCode=1' },
  ],
  projects: [
    { key: 'with-value', label: 'With a value', query: 'hasValue=1' },
  ],
  announcements: [],
  evidence: [],
  changelog: [],
};

export const ALL_VIEW_LABELS = {
  investors: 'All investors',
  projects: 'All projects',
  interactions: 'All interactions',
  issues: 'All issues',
  announcements: 'All announcements',
  evidence: 'All files',
  changelog: 'All changes',
};
