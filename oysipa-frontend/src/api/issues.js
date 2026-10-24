import apiClient from './api';

// Investor issues register (story 11.7). The server re-checks every role rule.

export const fetchIssues = async ({ status, year, investor } = {}) => {
  const params = {
    ...(status && { status }),
    ...(year && { year }),
    ...(investor && { investor }),
  };
  const { data } = Object.keys(params).length
    ? await apiClient.get('/api/issues', { params })
    : await apiClient.get('/api/issues');
  return data;
};

export const fetchIssue = async (id) => (await apiClient.get(`/api/issues/${id}`)).data;
export const createIssue = async (body) => (await apiClient.post('/api/issues', body)).data;
export const updateIssue = async (id, body) => (await apiClient.put(`/api/issues/${id}`, body)).data;
export const addIssueAction = async (id, body) => (await apiClient.post(`/api/issues/${id}/actions`, body)).data;
export const deleteIssue = async (id, reason) => (await apiClient.delete(`/api/issues/${id}`, { data: { reason } })).data;

export const uploadIssueFile = async (id, file, { documentDate } = {}) => {
  const formData = new FormData();
  if (documentDate) formData.append('documentDate', documentDate);
  formData.append('file', file);
  return (await apiClient.post(`/api/issues/${id}/files`, formData)).data;
};

export const fetchIssuesMetric = async (year) => (
  await apiClient.get('/api/admin/issues-metric', { params: { year } })
).data;

export const issueErrorMessage = (err, fallback) => {
  const status = err?.response?.status;
  if (status === 503) return 'Document storage is not configured';
  if (status === 403) return 'You can only change issues of investors assigned to you';
  return err?.response?.data?.message || err?.response?.data?.msg || fallback;
};
