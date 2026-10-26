// Country labels for analytics and the investor country filter (story 11.14).
// Country stays free text on the investor; these helpers only group it.
const { NOT_RECORDED } = require('./sectors');

// Stored values that mean "no country recorded" (compare form).
const NO_COUNTRY = ['', 'not stated', 'not known', 'not recorded', 'unknown', 'n/a'];

const countryKey = (raw) => String(raw === undefined || raw === null ? '' : raw).replace(/\s+/g, ' ').trim().toLowerCase();

// Stored value → the label it is grouped under ("Not recorded" when empty or unknown).
const countryLabel = (raw) => {
  const key = countryKey(raw);
  if (NO_COUNTRY.includes(key)) return NOT_RECORDED;
  return String(raw).replace(/\s+/g, ' ').trim();
};

// Whether a stored value falls under the requested label (case and spaces ignored).
const countryMatches = (raw, label) => {
  if (countryKey(label) === countryKey(NOT_RECORDED)) return countryLabel(raw) === NOT_RECORDED;
  return countryLabel(raw) !== NOT_RECORDED && countryKey(raw) === countryKey(label);
};

module.exports = { countryLabel, countryMatches, countryKey };
