import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from './api';

// Oyo MDA reference list (story 11.7c). The list lives on the server
// (oysipa-backend/src/constants/mdas.js); there is no frontend copy.
// Each entry: { code, name, abbreviation, mou }. Issues store codes.

export const fetchMdas = async () => {
  const { data } = await apiClient.get('/api/mdas');
  return Array.isArray(data) ? data : [];
};

// DG / Portal-Admin: replace the MoU MDAs. Returns the updated list; a
// response that is not a list is an error (the caller keeps its list).
export const saveMouMdas = async (codes) => {
  const { data } = await apiClient.put('/api/mdas/mou', { codes });
  if (!Array.isArray(data)) throw new Error('Unexpected response saving the MoU MDAs.');
  return data;
};

export const mdaOptionLabel = (m) => (m.mou ? `${m.name} (MoU)` : m.name);

// Name for a stored code, with "(MoU)" when flagged; an unknown code shows as itself.
export const mdaDisplayName = (byCode, code) => {
  const m = byCode && byCode[code];
  return m ? mdaOptionLabel(m) : code;
};

// Loads the list once per mount. A failed load leaves an empty list (codes
// then show as themselves).
export const useMdas = () => {
  const [mdas, setMdas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetchMdas()
      .then((list) => { if (active) { setMdas(list); setError(''); } })
      .catch(() => { if (active) setError('Failed to load the MDA list.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const byCode = useMemo(() => Object.fromEntries(mdas.map((m) => [m.code, m])), [mdas]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const nameOf = useCallback((code) => mdaDisplayName(byCode, code), [byCode]);

  return {
    mdas, byCode, nameOf, loading, error, reload, setMdas,
  };
};
