import apiClient from './api';

// Evidence library API. The server re-checks every role rule.

// Fired after anything that may change the untagged count (tag, upload,
// delete); the sidebar badge listens and refetches.
export const UNTAGGED_CHANGED_EVENT = 'evidence-untagged-changed';
export const notifyUntaggedChanged = () => window.dispatchEvent(new Event(UNTAGGED_CHANGED_EVENT));

export const fetchUntaggedCount = async () => (await apiClient.get('/api/evidence/untagged-count')).data.count;
export const fetchFolders = async () => (await apiClient.get('/api/evidence/folders')).data;
export const createFolder = async (body) => (await apiClient.post('/api/evidence/folders', body)).data;
export const fetchFolderFiles = async (folderId, { untagged = false } = {}) => (
  await apiClient.get(`/api/evidence/folders/${folderId}/files${untagged ? '?untagged=1' : ''}`)
).data;

export const uploadEvidenceFile = async (folderId, file, { documentDate, what } = {}) => {
  const formData = new FormData();
  if (documentDate) formData.append('documentDate', documentDate);
  if (what) formData.append('what', what);
  formData.append('file', file);
  return (await apiClient.post(`/api/evidence/folders/${folderId}/files`, formData)).data;
};

export const addEvidenceLink = async (fileId, { investor, interaction, serviceCodes }) => (
  await apiClient.post(`/api/evidence/files/${fileId}/links`, {
    investor, ...(interaction && { interaction }), serviceCodes: serviceCodes || [],
  })
).data;

export const removeEvidenceLink = async (fileId, linkId, reason) => (
  await apiClient.delete(`/api/evidence/files/${fileId}/links/${linkId}`, reason ? { data: { reason } } : undefined)
).data;

export const deleteEvidenceFile = async (fileId, reason) => (
  await apiClient.delete(`/api/evidence/files/${fileId}`, { data: { reason } })
).data;

export const evidenceErrorMessage = (err, fallback) => {
  const status = err?.response?.status;
  if (status === 503) return 'Document storage is not configured';
  if (status === 403) return 'You can only tag files to investors assigned to you';
  return err?.response?.data?.message || err?.response?.data?.msg || err?.message || fallback;
};
