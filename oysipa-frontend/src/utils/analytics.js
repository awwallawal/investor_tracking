import { formatMoneyCompact } from './money';
import { formatDate } from './dates';

// Text helpers for the analytics screens (story 11.14).

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// A metrics `change` → "new vs 2025" (previous year 0), "+25% vs 2025", "−3 vs 2025", "same as 2025".
export const changeText = (c, previousYear) => {
  if (!c) return '';
  if (c.isNew) return `new vs ${previousYear}`;
  if (c.previous === 0 && c.current === 0) return `none in either year`;
  if (c.delta === 0) return `same as ${previousYear}`;
  if (c.pct === null || c.pct === undefined) return `${c.delta > 0 ? '+' : '−'}${fmt(Math.abs(c.delta))} vs ${previousYear}`;
  const pct = Math.round(Math.abs(c.pct) * 100);
  return `${c.delta > 0 ? '+' : '−'}${pct}% vs ${previousYear}`;
};

// "39 of 183 projects have a value".
export const coverageText = (cov, noun, what) => {
  if (!cov) return '';
  return `${fmt(cov.with)} of ${fmt(cov.total)} ${noun} ${what}`;
};

// "+ US$391m · €8m" (currencies other than NGN with a value).
export const otherCurrenciesText = (byCurrency) => Object.entries(byCurrency || {})
  .filter(([c, s]) => c !== 'NGN' && s && s.count)
  .map(([c, s]) => formatMoneyCompact(s.sum, c))
  .join(' · ');

// "USD 1,361.84 (23 Oct 2026), EUR ..." for the rates used.
export const ratesUsedText = (ratesUsed) => (ratesUsed || [])
  .map((r) => `${r.currency} ₦${Number(r.rate).toLocaleString('en-US', { maximumFractionDigits: 2 })} (${formatDate(r.asOf)})`)
  .join(', ');

export const formatCount = fmt;
