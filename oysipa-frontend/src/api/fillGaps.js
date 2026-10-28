import apiClient from './api';

// Fill the gaps (story 11.17): the T1–T11 worklist (read-only endpoint, every
// role). Fixes are saved through the existing routes (PUT /api/projects/:id,
// PUT /api/investors/:id, PATCH /api/interactions/:id).

// Fired after a fix, so the sidebar badge recounts.
export const FILL_GAPS_CHANGED_EVENT = 'fill-gaps-changed';

// The badge count is cached for 60 s (the sidebar remounts on every page); a
// fix clears it.
const COUNT_TTL_MS = 60 * 1000;
let cachedCount = null; // { value, at }
export const clearFillGapsCount = () => { cachedCount = null; };
export const notifyFillGapsChanged = () => {
  clearFillGapsCount();
  window.dispatchEvent(new Event(FILL_GAPS_CHANGED_EVENT));
};

// params: { year, officer, missing, q }
export const fetchFillGaps = async (params) => (await apiClient.get('/api/fill-gaps', { params })).data;

// The signed-in officer's own incomplete projects in the current SABER year (badge).
export const fetchFillGapsCount = async () => {
  if (cachedCount && Date.now() - cachedCount.at < COUNT_TTL_MS) return cachedCount.value;
  const { count } = (await apiClient.get('/api/fill-gaps', { params: { count: 1, officer: 'me' } })).data;
  cachedCount = { value: count, at: Date.now() };
  return count;
};
