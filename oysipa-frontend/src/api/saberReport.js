import apiClient from './api';
import { fileNameFrom, saveBlob } from './listExport';

// SABER report / verifier export (story 11.9). DG / Portal-Admin only.
// Every download is recorded in the ChangeLog by the server.

export const fetchSaberReport = async (year) => {
  const { data } = await apiClient.get('/api/saber-report', { params: { year: String(year) } });
  return data;
};

const TYPES = { pdf: 'application/pdf', all: 'application/zip' };
const extension = (part) => ({ pdf: 'pdf', all: 'zip' }[part] || 'csv');

// part: completeness | services | credit | announcements | issues | pdf | all
export const downloadSaberReport = async (year, part) => {
  const response = await apiClient.get('/api/saber-report/download', {
    params: { year: String(year), part },
    responseType: 'blob',
  });
  const type = TYPES[part] || 'text/csv;charset=utf-8';
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type });
  const fileName = fileNameFrom(response.headers, part, `saber-report-${year}-${part}.${extension(part)}`);
  saveBlob(blob, fileName);
  return fileName;
};
