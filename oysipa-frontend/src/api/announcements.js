import apiClient from './api';

// Announcements register (story 11.8). The server re-checks every role rule.

export const fetchAnnouncements = async ({ year, oysipaNamed, project } = {}) => {
  const params = {
    ...(year && { year }),
    ...(oysipaNamed && { oysipaNamed }),
    ...(project && { project }),
  };
  const { data } = Object.keys(params).length
    ? await apiClient.get('/api/announcements', { params })
    : await apiClient.get('/api/announcements');
  return data;
};

export const fetchAnnouncement = async (id) => (await apiClient.get(`/api/announcements/${id}`)).data;
export const createAnnouncement = async (body) => (await apiClient.post('/api/announcements', body)).data;
export const updateAnnouncement = async (id, body) => (await apiClient.put(`/api/announcements/${id}`, body)).data;
export const linkAnnouncementInteractions = async (id, interactions) => (
  await apiClient.post(`/api/announcements/${id}/interactions`, { interactions })
).data;
export const unlinkAnnouncementInteraction = async (id, interactionId) => (
  await apiClient.delete(`/api/announcements/${id}/interactions/${interactionId}`)
).data;
export const deleteAnnouncement = async (id, reason) => (
  await apiClient.delete(`/api/announcements/${id}`, { data: { reason } })
).data;

export const uploadAnnouncementFile = async (id, file, { documentDate } = {}) => {
  const formData = new FormData();
  if (documentDate) formData.append('documentDate', documentDate);
  formData.append('file', file);
  return (await apiClient.post(`/api/announcements/${id}/files`, formData)).data;
};

export const fetchAnnouncementsMetric = async (year) => (
  await apiClient.get('/api/admin/announcements-metric', { params: { year } })
).data;

export const announcementErrorMessage = (err, fallback) => {
  const status = err?.response?.status;
  if (status === 503) return 'Document storage is not configured';
  if (status === 403) return 'You can only change announcements of investors assigned to you';
  return err?.response?.data?.message || err?.response?.data?.msg || fallback;
};
