import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/api';
import { totalFromResponse } from '../utils/listQuery';

// Loads a list from the API with the current filter params (story 11.15).
// Only the newest request may set the list (a slower, older one is dropped).
// With no params the request is sent without a params object.
//
//   const { data, total, loaded, error, reload, setData } = useListData('/api/issues', lq.apiParams);
//   total: the unfiltered total from X-Total-Count (null when the server sent none)
//   error: the server's 400 message, else `errorMessage`
//   loading: a request is in flight. When the params change the old rows are
//   cleared (loaded = false), so they never show under the new filters.
const useListData = (url, params, { errorMessage = 'Could not load the list. Check your connection and try again.', initial = [], enabled = true } = {}) => {
  const [state, setState] = useState({ data: initial, total: null, loaded: false, error: '', loading: false });
  const requestId = useRef(0);
  const paramsKey = JSON.stringify(params || {});
  const lastKey = useRef(null);
  const initialRef = useRef(initial);

  const load = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    const p = JSON.parse(paramsKey);
    const changed = lastKey.current !== null && lastKey.current !== paramsKey;
    lastKey.current = paramsKey;
    setState((s) => (changed
      ? { ...s, data: initialRef.current, loaded: false, error: '', loading: true }
      : { ...s, loading: true }));
    try {
      const response = Object.keys(p).length ? await apiClient.get(url, { params: p }) : await apiClient.get(url);
      if (id !== requestId.current) return;
      setState({ data: response.data, total: totalFromResponse(response), loaded: true, error: '', loading: false });
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      const serverMessage = err?.response?.status === 400 && (err.response.data?.message || err.response.data?.msg);
      setState((s) => ({ ...s, error: serverMessage || errorMessage, loading: false }));
    }
  }, [url, paramsKey, errorMessage]);

  useEffect(() => {
    if (enabled) load();
  }, [load, enabled]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: load, setData };
};

export default useListData;
