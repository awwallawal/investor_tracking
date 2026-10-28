// Project values always show with their currency (e.g. "₦2,500,000,000",
// "US$10,000,000"). Old projects without a currency are NGN.
const SYMBOLS = { NGN: '₦', USD: 'US$', EUR: '€', GBP: '£' };

export const formatMoney = (value, currency) => {
  const n = Number(value);
  const amount = (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const code = currency || 'NGN';
  const symbol = SYMBOLS[code];
  return symbol ? `${symbol}${amount}` : `${amount} (${code})`;
};

// Compact form for dashboards: "₦1.26tn", "₦2bn", "US$391m", "€8m", "₦950k".
// Three significant digits, trailing zeros dropped. null/undefined → "—".
const UNITS = [[1e12, 'tn'], [1e9, 'bn'], [1e6, 'm'], [1e3, 'k']];
export const formatMoneyCompact = (value, currency) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const code = currency || 'NGN';
  const symbol = SYMBOLS[code];
  const abs = Math.abs(n);
  // Round in a unit, then promote when the rounded figure reaches 1000
  // (999,999 → "1m", not "1000k").
  const round = (v) => {
    const a = Math.abs(v);
    const decimals = a >= 100 ? 0 : a >= 10 ? 1 : 2;
    return Number(v.toFixed(decimals));
  };
  let idx = UNITS.findIndex(([size]) => abs >= size);
  if (idx === -1 && Math.round(abs) >= 1000) idx = UNITS.length - 1;
  let text;
  if (idx === -1) {
    text = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  } else {
    let v = round(n / UNITS[idx][0]);
    while (idx > 0 && Math.abs(v) >= 1000) {
      idx -= 1;
      v = round(n / UNITS[idx][0]);
    }
    text = `${String(v)}${UNITS[idx][1]}`;
  }
  return symbol ? `${symbol}${text}` : `${text} (${code})`;
};

// ₦ equivalent of some projects' values, as the dashboard works it out
// (backend services/metrics.js ngnEquivalent): NGN plus every other currency at
// its latest rate (fx.latest[c].rate, ₦ per unit). Only values > 0 count; a
// project with no currency is NGN; "Other" is never converted (listed in
// `excluded`). value is null when a rate is missing.
// → { value, ngnSum, count, excludedCount (projects in `excluded`), missing, excluded, ratesUsed }
export const ngnEquivalentOf = (projects, fx) => {
  const latest = (fx && fx.latest) || {};
  const sums = {};
  const counts = {};
  let count = 0;
  (projects || []).forEach((p) => {
    const v = Number(p?.estimatedValue);
    if (!Number.isFinite(v) || v <= 0) return;
    const c = p.currency || 'NGN';
    sums[c] = (sums[c] || 0) + v;
    counts[c] = (counts[c] || 0) + 1;
    count += 1;
  });
  const missing = [];
  const excluded = [];
  const ratesUsed = [];
  let total = sums.NGN || 0;
  Object.entries(sums).forEach(([c, sum]) => {
    if (c === 'NGN') return;
    if (c === 'Other') { excluded.push(c); return; }
    const r = latest[c];
    if (!r || !Number.isFinite(Number(r.rate))) { missing.push(c); return; }
    ratesUsed.push({ currency: c, rate: Number(r.rate), asOf: r.asOf });
    total += sum * Number(r.rate);
  });
  const excludedCount = excluded.reduce((n, c) => n + counts[c], 0);
  return {
    value: missing.length ? null : total, ngnSum: sums.NGN || 0, count, excludedCount, missing, excluded, ratesUsed,
  };
};

export default formatMoney;
