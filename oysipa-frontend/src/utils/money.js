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

export default formatMoney;
