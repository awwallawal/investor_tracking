// One tone map for every status shown as a StatusBadge (story 11.16): issue
// statuses, user state and roles, evidence and announcement flags. A label not
// in the map uses the default (neutral) tone; lifecycle stages use `stage`.
export const STATUS_TONES = {
  // Issues (story 11.7)
  Open: 'warning',
  'In progress': 'info',
  Resolved: 'success',
  'Closed unresolved': 'default',
  Withdrawn: 'default',
  // Users
  Active: 'success',
  Inactive: 'default',
  Revoked: 'default',
  Pending: 'warning',
  'Director-General': 'primary',
  'Portal-Admin': 'info',
  Staff: 'default',
  // Evidence and announcements
  Untagged: 'warning',
  Tagged: 'success',
  'OYSIPA named': 'success',
  'OYSIPA not named': 'default',
};

// Lifecycle stages are set by the Portal-Admin, so they share one tone.
export const STAGE_TONE = 'info';

export const statusTone = (label) => STATUS_TONES[label] || 'default';
