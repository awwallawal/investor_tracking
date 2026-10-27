// List filters in the URL (story 11.15): pure helpers behind useListQuery.
//
// A list declares its parameters once (a "spec"):
//   { q: 'text', sector: { type: 'multi', options: SECTOR_VALUES }, hasValue: 'flag',
//     from: 'date', to: 'date', officer: { type: 'multi', pattern: /^(me|unassigned|[0-9a-f]{24})$/ },
//     sort: { type: 'sort', keys: ['name', 'sector'] } }
// Types:
//   'text'   free text (the search box; trimmed, max 200 characters)
//   'flag'   on when the value is 1 or true; sent as "1"
//   'date'   a calendar day YYYY-MM-DD
//   'year'   multi 4-digit years (`allowNone: true` also accepts "none")
//   { type: 'multi', options?, pattern?, split? }  several values, written as
//            repeated params (?country=A&country=B). Each repeated value is taken
//            whole; a single value is split on commas (old links) unless the whole
//            value is itself an option, or `split: false` (free text such as a
//            country, "Korea, Republic of"). With `options` only those
//            (case-insensitive, stored in the option's spelling), with `pattern`
//            only matching ones, with neither any non-empty value. At most 50.
//   { type: 'single', options?, pattern? } one value
//   { type: 'int', min, max } a whole number
//   { type: 'sort', keys } "key" ascending or "-key" descending
// A value that is not valid is ignored: it is not sent and gets no chip. The
// server ignores it too, so a hand-edited or old link never breaks the page.

const MAX_TEXT = 200;
export const MAX_VALUES = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;

const typeOf = (def) => (typeof def === 'string' ? def : def.type);

const isValidDay = (v) => {
  if (!DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const splitValues = (raw) => String(raw || '').split(',').map((v) => v.trim()).filter(Boolean);

// The raw values of a multi param: repeated values whole; one value split on
// commas unless it is whole a known value (or the definition says split: false).
const rawValues = (def, raw) => {
  const list = (Array.isArray(raw) ? raw : [raw]).filter((v) => v !== null && v !== undefined).map(String);
  if (list.length !== 1) return list.map((v) => v.trim()).filter(Boolean);
  const one = list[0].trim();
  if (!one) return [];
  if (def.split === false) return [one];
  if (def.options && def.options.some((o) => String(o).toLowerCase() === one.toLowerCase())) return [one];
  return splitValues(one);
};

// One accepted value in its canonical spelling, or null.
const acceptOne = (def, value) => {
  if (def.options) {
    const found = def.options.find((o) => String(o).toLowerCase() === value.toLowerCase());
    return found === undefined ? null : String(found);
  }
  if (def.pattern && !def.pattern.test(value)) return null;
  return value;
};

// Parses one raw URL value (string or null) for a definition. Returns the
// empty value of the type when nothing valid is left.
export const parseParam = (def, raw) => {
  const type = typeOf(def);
  const first = Array.isArray(raw) ? raw[0] : raw;
  const text = first === null || first === undefined ? '' : String(first);
  switch (type) {
    case 'text':
      return text.trim().slice(0, MAX_TEXT);
    case 'flag':
      return text === '1' || text.toLowerCase() === 'true';
    case 'date':
      return isValidDay(text.trim()) ? text.trim() : '';
    case 'int': {
      const n = Number(text.trim());
      if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(n)) return '';
      if (def.min !== undefined && n < def.min) return '';
      if (def.max !== undefined && n > def.max) return '';
      return String(n);
    }
    case 'year': {
      const out = [];
      rawValues({}, raw).forEach((v) => {
        if (out.length >= MAX_VALUES) return;
        const value = def.allowNone && v.toLowerCase() === 'none' ? 'none' : v;
        if ((value === 'none' || (YEAR.test(value) && Number(value) >= 1990 && Number(value) <= 2100)) && !out.includes(value)) out.push(value);
      });
      return out;
    }
    case 'single':
      return text.trim() ? acceptOne(def, text.trim()) || '' : '';
    case 'sort': {
      const t = text.trim();
      const desc = t.startsWith('-');
      const key = desc ? t.slice(1) : t;
      return (def.keys || []).includes(key) ? { key, direction: desc ? 'desc' : 'asc' } : null;
    }
    case 'multi':
    default: {
      const out = [];
      rawValues(def, raw).forEach((v) => {
        if (out.length >= MAX_VALUES) return;
        const value = acceptOne(def, v);
        if (value !== null && !out.includes(value)) out.push(value);
      });
      return out;
    }
  }
};

// The URL form of a parsed value, or '' when it is empty.
export const serialiseParam = (def, value) => {
  const type = typeOf(def);
  if (type === 'flag') return value ? '1' : '';
  if (type === 'sort') return value && value.key ? `${value.direction === 'desc' ? '-' : ''}${value.key}` : '';
  if (Array.isArray(value)) return value.join(',');
  return value ? String(value) : '';
};

export const isEmptyValue = (value) => value === null || value === undefined || value === '' || value === false
  || (Array.isArray(value) && value.length === 0);

// { name: parsedValue } for every parameter of the spec.
export const parseQuery = (spec, searchParams) => {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;
  const values = {};
  Object.entries(spec).forEach(([name, def]) => {
    const t = typeOf(def);
    values[name] = parseParam(def, t === 'multi' || t === 'year' ? params.getAll(name) : params.get(name));
  });
  // An inverted range (from after to) is ignored, as on the server.
  if (values.from && values.to && typeOf(spec.from) === 'date' && typeOf(spec.to) === 'date' && values.from > values.to) {
    values.from = '';
    values.to = '';
  }
  return values;
};

// Writes one parsed value into URLSearchParams (multi values as repeated params).
export const writeParam = (params, name, def, value) => {
  params.delete(name);
  if (def && Array.isArray(value)) {
    value.forEach((v) => params.append(name, String(v)));
    return;
  }
  const s = def ? serialiseParam(def, value) : (value ? String(value) : '');
  if (s) params.set(name, s);
};

// Canonical query string (spec order, valid values only). `withSort: false`
// leaves the sort out (e.g. to compare a view's filters).
export const canonicalQuery = (spec, searchParams, { withSort = true } = {}) => {
  const values = parseQuery(spec, searchParams);
  const out = new URLSearchParams();
  Object.entries(spec).forEach(([name, def]) => {
    if (!withSort && typeOf(def) === 'sort') return;
    writeParam(out, name, def, values[name]);
  });
  return out.toString();
};

// Request params for the API: valid, non-empty values only. One value is a
// string; several are an array, sent as repeated params (?a=1&a=2, see api.js).
export const apiParamsFor = (spec, values) => {
  const out = {};
  Object.entries(spec).forEach(([name, def]) => {
    const v = values[name];
    if (Array.isArray(v)) {
      if (v.length === 1) out[name] = v[0];
      else if (v.length > 1) out[name] = [...v];
      return;
    }
    const s = serialiseParam(def, v);
    if (s) out[name] = s;
  });
  return out;
};

// Number of active filters (the sort is not a filter).
export const activeFilterCount = (spec, values) => Object.entries(spec)
  .filter(([name, def]) => typeOf(def) !== 'sort' && !isEmptyValue(values[name])).length;

// The unfiltered total from the X-Total-Count header, or null.
export const totalFromResponse = (response) => {
  const header = response?.headers?.['x-total-count'];
  if (header === undefined || header === null || header === '') return null;
  const n = Number(header);
  return Number.isFinite(n) ? n : null;
};

// "12 of 177 investors" (or "12 investors" when the total is unknown).
export const resultCountLabel = (shown, total, noun, plural = `${noun}s`) => {
  const word = (n) => (n === 1 ? noun : plural);
  if (total === null || total === undefined) return `${shown} ${word(shown)}`;
  return `${shown} of ${total} ${word(total)}`;
};

export const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
export const OFFICER_PATTERN = /^(me|unassigned|[0-9a-fA-F]{24})$/;
export const USER_PATTERN = /^(me|[0-9a-fA-F]{24})$/;
