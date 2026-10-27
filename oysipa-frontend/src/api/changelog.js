import apiClient from './api';

// Read-only ChangeLog viewer (story 11.10). DG / Portal-Admin only; the server
// re-checks the role. Rows: { _id, createdAt, byName, role, entity, entityId,
// action, reason, changes: [{ field, old, new }] }, newest first, 50 per page.

export const CHANGELOG_ENTITIES = [
  { value: 'Investor', label: 'Investor' },
  { value: 'InvestmentProject', label: 'Project' },
  { value: 'InteractionLog', label: 'Interaction' },
  { value: 'InvestorIssue', label: 'Issue' },
  { value: 'InvestmentAnnouncement', label: 'Announcement' },
  { value: 'Setting', label: 'Setting' },
  { value: 'EvidenceFile', label: 'Evidence file' },
  { value: 'EvidenceFolder', label: 'Evidence folder' },
  { value: 'LifecycleStatus', label: 'Lifecycle status' },
  { value: 'ChangeLog', label: 'Change log (exports)' },
  { value: 'SaberReport', label: 'SABER report (downloads)' },
];

export const CHANGELOG_ACTIONS = ['create', 'update', 'delete', 'import', 'upload', 'link', 'unlink', 'export'];

export const entityLabel = (entity) => (CHANGELOG_ENTITIES.find((e) => e.value === entity) || {}).label || entity;

// Empty filters are left out of the query.
export const fetchChangeLog = async ({
  entity, action, entityId, by, batchId, from, to, page = 1,
} = {}) => {
  const params = {
    ...(entity && { entity }),
    ...(action && { action }),
    ...(entityId && { entityId }),
    ...(by && { by }),
    ...(batchId && { batchId }),
    ...(from && { from }),
    ...(to && { to }),
    page,
  };
  const { data } = await apiClient.get('/api/changelog', { params });
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    total: Number(data?.total) || 0,
    page: Number(data?.page) || page,
    pageSize: Number(data?.pageSize) || 50,
  };
};

// Audit write failures: { ok, failedWrites, lastFailureAt, lastError, sinceRestart }.
export const fetchChangeLogHealth = async () => (await apiClient.get('/api/changelog/health')).data;

// Users for the "Who" filter (DG / Portal-Admin list): [{ _id, name, role }].
export const fetchChangeLogUsers = async () => {
  const { data } = await apiClient.get('/api/users');
  return Array.isArray(data) ? data.map((u) => ({ _id: u._id, name: u.name, role: u.role })) : [];
};

export const changeLogErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return 'Only the Director-General and Portal-Admin can view the change log.';
  return err?.response?.data?.message || err?.response?.data?.msg || fallback;
};
