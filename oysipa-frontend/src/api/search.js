import apiClient from './api';

// Global search (story 11.15): GET /api/search?q= → { q, groups: [{ type,
// label, count, items: [{ _id, title, subtitle, to }], seeAll }] }.
// The server returns only what the user may list (never the change log).
export const SEARCH_MIN_LENGTH = 2;

// Same normalisation as the server (services/investorSearch.js normaliseSearch):
// lower case, "&" = and, punctuation ignored, spaces collapsed. "!!" is empty.
export const normaliseSearch = (raw) => String(raw || '')
  .slice(0, 200)
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}\s]+/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

// True when the text is long enough to search (2+ characters after normalising).
export const isSearchable = (raw) => normaliseSearch(raw).length >= SEARCH_MIN_LENGTH;

export const searchAll = async (q) => (await apiClient.get('/api/search', { params: { q } })).data;
