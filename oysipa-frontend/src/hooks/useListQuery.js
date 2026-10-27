import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  activeFilterCount, apiParamsFor, canonicalQuery, isEmptyValue, parseQuery, writeParam,
} from '../utils/listQuery';

const SEARCH_DEBOUNCE_MS = 300;

// URL ↔ filters for a list page (story 11.15). Every filter, the search text
// and the sort live in the URL (see utils/listQuery.js for the spec format), so
// Back, refresh and a shared link restore the view.
//
//   const lq = useListQuery(SPEC);
//   lq.values           parsed, valid values ({ q: 'agro', sector: ['Agribusiness'], ... })
//   lq.apiParams        { sector: 'Agribusiness,Manufacturing', q: 'agro' } for the request
//   lq.searchInput / lq.setSearchInput / lq.clearSearch
//                       the search box: it updates at once; ?q= (and the request)
//                       follows after a 300 ms pause, replacing the history entry
//   lq.set({ sector: [...] })  filter changes add a history entry (Back undoes them)
//   lq.toggle(name, value) / lq.remove(name, value?) / lq.clearAll()
//   lq.sort / lq.setSort({ key, direction } | null)
//   lq.applyQuery('officer=me')  open a saved or built-in view (its filters replace the current ones)
//   lq.queryString      canonical query (filters and sort)
//   lq.filterKey        the same (filters and sort): views are matched on both
//   lq.canonical(qs)    the canonical form of another query (to compare views)
//   lq.activeCount      number of active filters
//   lq.chips(labels)    removable chips for the active filters
//
// `spec` should be stable (module level, or memoised when its options load).
// The text parameter is `q`.
const useListQuery = (spec, { debounceMs = SEARCH_DEBOUNCE_MS } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  // The search string our own last write produced: any other URL change is a
  // navigation from outside (Back/Forward, a link) and drops pending typing.
  const ownSearch = useRef(null);
  const setParamsRef = useRef(null);
  setParamsRef.current = (update, options) => {
    setSearchParamsRef.current((prev) => {
      const next = update(prev);
      ownSearch.current = next.toString();
      return next;
    }, options);
  };
  const hasText = !!spec.q;
  const search = searchParams.toString();

  const values = useMemo(() => parseQuery(spec, new URLSearchParams(search)), [spec, search]);
  const urlQ = hasText ? values.q : '';

  // --- the search box (debounced into ?q=) ---
  const [searchInput, setSearchInput] = useState(urlQ);
  const [q, setQ] = useState(urlQ);
  // The q last written to (or read from) the URL: tells our own writes apart
  // from back/forward or a link.
  const lastUrlQ = useRef(urlQ);

  useEffect(() => {
    if (!hasText) return undefined;
    const next = searchInput.trim();
    if (next === q) return undefined;
    const t = setTimeout(() => setQ(next), debounceMs);
    return () => clearTimeout(t);
  }, [searchInput, q, hasText, debounceMs]);

  // q → URL (replace, so typing does not fill the history).
  useEffect(() => {
    if (!hasText || lastUrlQ.current === q) return;
    lastUrlQ.current = q;
    setParamsRef.current((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('q', q); else next.delete('q');
      return next;
    }, { replace: true });
  }, [q, hasText]);

  // URL → box, when the URL changes from outside (back/forward, a link, a view
  // tab). Typing not yet written is dropped, so it never lands on the restored entry.
  const lastSearch = useRef(search);
  useEffect(() => {
    if (!hasText || search === lastSearch.current) return;
    lastSearch.current = search;
    const own = search === ownSearch.current;
    if (own && urlQ === lastUrlQ.current) return;
    lastUrlQ.current = urlQ;
    setSearchInput(urlQ);
    setQ(urlQ);
  }, [urlQ, search, hasText]);

  const syncText = useCallback((value) => {
    const text = value || '';
    lastUrlQ.current = text;
    setSearchInput(text);
    setQ(text);
  }, []);

  // --- writes ---
  // changes: { name: value } in the parsed form ('' / [] / false / null removes it).
  const set = useCallback((changes, { replace = false } = {}) => {
    if (hasText && 'q' in changes) syncText(String(changes.q || '').trim());
    setParamsRef.current((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([name, value]) => writeParam(next, name, spec[name], value));
      return next;
    }, { replace });
  }, [spec, hasText, syncText]);

  const toggle = useCallback((name, value) => {
    const current = Array.isArray(values[name]) ? values[name] : [];
    set({ [name]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
  }, [values, set]);

  const remove = useCallback((name, value) => {
    if (value !== undefined && Array.isArray(values[name])) {
      set({ [name]: values[name].filter((v) => v !== value) });
    } else {
      set({ [name]: '' });
    }
  }, [values, set]);

  // Removes every filter of the spec (and the sort); other params stay.
  const clearAll = useCallback(({ keepSort = true } = {}) => {
    if (hasText) syncText('');
    setParamsRef.current((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(spec).forEach(([name, def]) => {
        if (keepSort && (typeof def === 'object' && def.type === 'sort')) return;
        next.delete(name);
      });
      return next;
    });
  }, [spec, hasText, syncText]);

  // Opens a view: its filters (and sort, when it has one) replace the current ones.
  const applyQuery = useCallback((query) => {
    const parsed = parseQuery(spec, new URLSearchParams(query || ''));
    if (hasText) syncText(parsed.q || '');
    setParamsRef.current((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(spec).forEach(([name, def]) => {
        const isSort = typeof def === 'object' && def.type === 'sort';
        if (isSort && !parsed[name]) return; // a view without a sort keeps the current one
        writeParam(next, name, def, parsed[name]);
      });
      return next;
    });
  }, [spec, hasText, syncText]);

  const clearSearch = useCallback(() => {
    if (hasText) set({ q: '' }, { replace: true });
  }, [hasText, set]);

  const sortName = useMemo(() => Object.keys(spec).find((n) => typeof spec[n] === 'object' && spec[n].type === 'sort'), [spec]);
  const setSort = useCallback((sort) => {
    if (sortName) set({ [sortName]: sort });
  }, [sortName, set]);

  const apiParams = useMemo(() => apiParamsFor(spec, values), [spec, values]);
  const queryString = useMemo(() => canonicalQuery(spec, new URLSearchParams(search)), [spec, search]);
  const filterKey = queryString;
  const canonical = useCallback((query) => canonicalQuery(spec, new URLSearchParams(query || '')), [spec]);

  // labels: { name: 'Sector' | { label, format(value) → text } }. A param with
  // no label gets no chip. Multi values get one chip each.
  const chips = useCallback((labels) => {
    const out = [];
    Object.entries(labels).forEach(([name, l]) => {
      const value = values[name];
      if (isEmptyValue(value)) return;
      const label = typeof l === 'string' ? l : l.label;
      const format = (typeof l === 'object' && l.format) || ((v) => (label ? `${label}: ${v}` : String(v)));
      if (name === 'q') {
        out.push({ key: 'q', label: typeof l === 'object' && l.format ? l.format(value) : `Search: "${value}"`, onRemove: clearSearch });
      } else if (Array.isArray(value)) {
        value.forEach((v) => out.push({ key: `${name}:${v}`, label: format(v), onRemove: () => remove(name, v) }));
      } else {
        out.push({ key: name, label: value === true ? (typeof l === 'object' && l.format ? l.format(value) : label) : format(value), onRemove: () => remove(name) });
      }
    });
    return out;
  }, [values, remove, clearSearch]);

  return {
    values,
    apiParams,
    queryString,
    filterKey,
    canonical,
    activeCount: activeFilterCount(spec, values),
    searchInput,
    setSearchInput,
    clearSearch,
    set,
    toggle,
    remove,
    clearAll,
    applyQuery,
    sort: sortName ? values[sortName] : null,
    setSort,
    chips,
  };
};

export default useListQuery;
