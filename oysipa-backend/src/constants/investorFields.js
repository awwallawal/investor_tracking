// Investor fields for SABER T11 (story 11.5). Single source for the model enums.
// The frontend keeps a copy in oysipa-frontend/src/constants/investorFields.js.

const UNKNOWN_LEAD_SOURCE = 'Unknown (pre-T11)';

const LEAD_SOURCES = [
  'Media campaign or advertising',
  'Business event or conference',
  'Intermediary referral',
  'OYSIPA proactive outreach',
  'Publication or website enquiry',
  'Existing investor referral',
  'Government or MDA referral',
  'Walk-in or unsolicited direct enquiry',
  'Other',
  UNKNOWN_LEAD_SOURCE,
];

// Only 'Investor' counts in investor totals.
const ORGANISATION_TYPES = ['Investor', 'Intermediary', 'Promotion agent', 'Contact'];
const DEFAULT_ORGANISATION_TYPE = 'Investor';

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'Other'];
const DEFAULT_CURRENCY = 'NGN';

// Investor email check: accepts long endings such as .africa.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Investors counted in totals: organisation type Investor, or none set (old records).
const INVESTOR_COUNT_FILTER = { organisationType: { $in: [DEFAULT_ORGANISATION_TYPE, null] } };

module.exports = {
  UNKNOWN_LEAD_SOURCE,
  LEAD_SOURCES,
  ORGANISATION_TYPES,
  DEFAULT_ORGANISATION_TYPE,
  CURRENCIES,
  DEFAULT_CURRENCY,
  EMAIL_RE,
  INVESTOR_COUNT_FILTER,
};
