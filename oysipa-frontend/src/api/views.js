import apiClient from './api';

// Saved views (story 11.15): stored on the server per user; DG/Portal-Admin can
// share a view with everyone. The server re-checks every rule.

export const fetchViews = async (list) => {
  const { data } = await apiClient.get('/api/views', { params: { list } });
  return Array.isArray(data) ? data : [];
};
export const createView = async ({ list, name, query, shared = false }) => (
  await apiClient.post('/api/views', { list, name, query, shared })
).data;
export const updateView = async (id, body) => (await apiClient.put(`/api/views/${id}`, body)).data;
export const deleteView = async (id) => (await apiClient.delete(`/api/views/${id}`)).data;

export const viewErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return 'Only the Director-General or a Portal Admin can share a view with everyone.';
  return err?.response?.data?.message || err?.response?.data?.msg || fallback;
};
