import apiClient from './api';
import { formatDate } from '../utils/dates';

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

// Story 11.15: list filters for evidence files (folder page, library-wide
// search and the CSV export). Values the server does not know are ignored.
export const EVIDENCE_TYPES = [
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'Image' },
  { value: 'document', label: 'Word document' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
];
export const EVIDENCE_LIST_SPEC = {
  q: 'text',
  untagged: 'flag',
  type: { type: 'multi', options: EVIDENCE_TYPES.map((t) => t.value) },
  from: 'date',
  to: 'date',
  sort: { type: 'sort', keys: ['date', 'name'] },
};
export const evidenceTypeLabel = (v) => (EVIDENCE_TYPES.find((t) => t.value === v) || { label: v }).label;

// Sort choices (story 11.15); the default is date, oldest first.
export const EVIDENCE_SORTS = [
  { value: null, label: 'Date, oldest first' },
  { value: { key: 'date', direction: 'desc' }, label: 'Date, newest first' },
  { value: { key: 'name', direction: 'asc' }, label: 'Name, A–Z' },
];
export const EVIDENCE_CHIP_LABELS = {
  q: 'Search',
  untagged: 'Untagged only',
  type: { label: 'Type', format: (v) => `Type: ${evidenceTypeLabel(v)}` },
  from: { label: 'From', format: (v) => `From ${formatDate(`${v}T00:00:00.000Z`)}` },
  to: { label: 'To', format: (v) => `To ${formatDate(`${v}T00:00:00.000Z`)}` },
};

// Folder files with the list filters: the whole response (X-Total-Count = files
// in the folder). With no params the request has no params object.
export const fetchFolderFilesResponse = (folderId, params = {}) => (Object.keys(params).length
  ? apiClient.get(`/api/evidence/folders/${folderId}/files`, { params })
  : apiClient.get(`/api/evidence/folders/${folderId}/files`));

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
