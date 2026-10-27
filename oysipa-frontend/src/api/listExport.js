import apiClient from './api';

// CSV export of a list's current view (story 11.15). The server applies the
// same filters as the list, refuses more than 5,000 rows (400 "narrow the
// filters") and records every export in the ChangeLog.

const fileNameFrom = (headers, list) => {
  const disposition = headers?.['content-disposition'] || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  return `oysipa-${list}.csv`;
};

// Same download pattern as the import report (ImportInvestorsDialog).
const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked after a moment: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const readBlobText = (blob) => {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
};

// An error response arrives as a Blob (responseType 'blob'): read its JSON message.
export const exportErrorMessage = async (err) => {
  const data = err?.response?.data;
  let body = data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try { body = JSON.parse(await readBlobText(data)); } catch { body = null; }
  }
  if (err?.response?.status === 403) return 'You cannot export this list.';
  return (body && (body.message || body.msg)) || 'The export failed. Check your connection and try again.';
};

export const exportList = async (list, params = {}) => {
  const response = await apiClient.get(`/api/export/${list}`, { params, responseType: 'blob' });
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8' });
  const fileName = fileNameFrom(response.headers, list);
  saveBlob(blob, fileName);
  return fileName;
};
