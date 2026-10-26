// Exchange rates (story 11.14): Setting `fxRates`, a dated history
// [{ currency, rate, asOf, source }] where rate is ₦ per unit and asOf a
// YYYY-MM-DD happened date (never in the future). The latest asOf per currency
// is the rate in use; a rate older than STALE_DAYS is flagged out of date.
// Edits go through Setting.findOneAndUpdate, so the audit plugin writes the
// ChangeLog row (entity Setting).
const Setting = require('../models/Setting');
const { parseHappenedDate, todayLagos } = require('../utils/happenedDate');

const FX_KEY = 'fxRates';
const FX_CURRENCIES = ['USD', 'EUR', 'GBP'];
const STALE_DAYS = 30;

// Owner decision 26 Oct 2026: the starting rates, seeded by the data clean-up
// migration only when no rates exist.
const SEED_RATES = [
  { currency: 'USD', rate: 1361.84, asOf: '2026-10-23', source: 'CBN NFEM weighted average' },
  { currency: 'EUR', rate: 1525.12, asOf: '2026-10-25', source: 'CBN rate as reported by Aboki Forex (provisional, verify)' },
  { currency: 'GBP', rate: 1787.73, asOf: '2026-10-22', source: 'CBN rate as reported by nairatoday.com (provisional, verify)' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (fromDay, toDay) => Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);

const cleanEntry = (e) => ({
  currency: e.currency, rate: e.rate, asOf: e.asOf, source: e.source || '',
});

// Stored entries that look right (anything else is ignored, never thrown).
const validEntries = (value) => (Array.isArray(value) ? value : [])
  .filter((e) => e && FX_CURRENCIES.includes(e.currency) && typeof e.rate === 'number' && e.rate > 0
    && typeof e.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.asOf))
  .map(cleanEntry);

// History newest first (asOf, then the later entry first).
const sortHistory = (entries) => entries
  .map((e, i) => ({ e, i }))
  .sort((a, b) => (a.e.asOf === b.e.asOf ? b.i - a.i : b.e.asOf.localeCompare(a.e.asOf)))
  .map(({ e }) => e);

// { USD: { rate, asOf, source, ageDays, stale }, ... } for currencies with a rate.
const latestRates = (entries, today = todayLagos()) => {
  const latest = {};
  sortHistory(entries).forEach((e) => {
    if (latest[e.currency]) return;
    const ageDays = daysBetween(e.asOf, today);
    latest[e.currency] = {
      rate: e.rate, asOf: e.asOf, source: e.source, ageDays, stale: ageDays > STALE_DAYS,
    };
  });
  return latest;
};

const describeRates = (entries, today = todayLagos()) => {
  const latest = latestRates(entries, today);
  return {
    currencies: FX_CURRENCIES,
    staleDays: STALE_DAYS,
    latest,
    missing: FX_CURRENCIES.filter((c) => !latest[c]),
    stale: FX_CURRENCIES.filter((c) => latest[c] && latest[c].stale),
    history: sortHistory(entries),
  };
};

const getFxEntries = async () => {
  const setting = await Setting.findOne({ key: FX_KEY }).lean();
  return validEntries(setting && setting.value);
};

const getFxRates = async (today) => describeRates(await getFxEntries(), today);

// Validates one entry from a request body. Returns { entry } or { error }.
const parseFxEntry = (body) => {
  const b = body || {};
  if (!FX_CURRENCIES.includes(b.currency)) return { error: `Currency must be one of ${FX_CURRENCIES.join(', ')}.` };
  const rate = typeof b.rate === 'string' && b.rate.trim() !== '' ? Number(b.rate) : b.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return { error: 'Rate must be a number greater than 0 (₦ per unit).' };
  if (rate > 1e7) return { error: 'Rate is too large.' };
  const parsed = parseHappenedDate(b.asOf, { required: true, label: 'Rate date' });
  if (parsed.error) return { error: parsed.error };
  const source = typeof b.source === 'string' ? b.source.trim() : '';
  if (!source) return { error: 'Say where the rate comes from (source).' };
  if (source.length > 200) return { error: 'Source is too long (200 characters at most).' };
  return {
    entry: {
      currency: b.currency, rate, asOf: parsed.value.toISOString().slice(0, 10), source,
    },
  };
};

// Appends one dated rate atomically ($push: two saves at once both land),
// audited by the Setting plugin. Returns the new state.
const addFxRate = async (entry, userId) => {
  const saved = await Setting.findOneAndUpdate(
    { key: FX_KEY },
    { $push: { value: cleanEntry(entry) }, ...(userId && { $set: { updatedBy: userId } }) },
    { upsert: true, new: true },
  ).lean();
  return describeRates(validEntries(saved && saved.value));
};

module.exports = {
  FX_KEY,
  FX_CURRENCIES,
  STALE_DAYS,
  SEED_RATES,
  latestRates,
  describeRates,
  getFxEntries,
  getFxRates,
  parseFxEntry,
  addFxRate,
  validEntries,
};
