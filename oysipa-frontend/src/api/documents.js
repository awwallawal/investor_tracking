import apiClient from './api';

// Private interaction documents (FR-Y19). Files go through the backend to
// private storage and open only through short-lived signed links.

export const NOT_CONFIGURED_MSG = 'Document storage is not configured';
export const POPUP_BLOCKED_MSG = 'Allow pop-ups to open documents';

// Accepted by the backend (it re-checks): PDF, Word, Excel, JPEG, PNG.
export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';

// A readable message for a failed document request.
export const documentErrorMessage = (err, fallback) => {
  const status = err?.response?.status;
  if (!err?.response && err?.message === POPUP_BLOCKED_MSG) return POPUP_BLOCKED_MSG;
  if (status === 503) return NOT_CONFIGURED_MSG;
  if (status === 403) return 'You can only attach documents to interactions of investors assigned to you';
  return err?.response?.data?.message || err?.response?.data?.msg || fallback;
};

// Uploads one file. Resolves the new documents[] entry (it carries no URL).
export const uploadInteractionDocument = async (logId, file, documentDate) => {
  const formData = new FormData();
  if (documentDate) formData.append('documentDate', documentDate);
  formData.append('file', file);
  const { data } = await apiClient.post(`/api/interactions/${logId}/documents`, formData);
  return data;
};

// Fetches a signed link (valid a few minutes) and opens it in a new tab.
// Must be called straight from a click handler: the tab is opened
// synchronously (popup blockers refuse window.open after an await), then
// pointed at the signed URL. Throws POPUP_BLOCKED_MSG when no tab opened.
export const openInteractionDocument = async (logId, docId) => {
  const win = window.open('', '_blank');
  if (!win) throw new Error(POPUP_BLOCKED_MSG);
  win.opener = null;
  try {
    const { data } = await apiClient.get(`/api/interactions/${logId}/documents/${docId}/link`);
    win.location.href = data.url;
  } catch (err) {
    win.close();
    throw err;
  }
};

// Evidence library file: same pattern as openInteractionDocument (tab first,
// then the signed link).
export const openEvidenceFile = async (fileId) => {
  const win = window.open('', '_blank');
  if (!win) throw new Error(POPUP_BLOCKED_MSG);
  win.opener = null;
  try {
    const { data } = await apiClient.get(`/api/evidence/files/${fileId}/link`);
    win.location.href = data.url;
  } catch (err) {
    win.close();
    throw err;
  }
};
