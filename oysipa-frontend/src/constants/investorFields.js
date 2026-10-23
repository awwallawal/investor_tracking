// Investor fields for SABER T11 (story 11.5). Keep in sync with
// oysipa-backend/src/constants/investorFields.js (the model enums).

export const UNKNOWN_LEAD_SOURCE = 'Unknown (pre-T11)';
export const INTERMEDIARY_REFERRAL = 'Intermediary referral';

export const LEAD_SOURCES = [
  'Media campaign or advertising',
  'Business event or conference',
  INTERMEDIARY_REFERRAL,
  'OYSIPA proactive outreach',
  'Publication or website enquiry',
  'Existing investor referral',
  'Government or MDA referral',
  'Walk-in or unsolicited direct enquiry',
  'Other',
  UNKNOWN_LEAD_SOURCE,
];

// Lead sources an officer can choose for a new record.
export const NEW_LEAD_SOURCES = LEAD_SOURCES.filter((s) => s !== UNKNOWN_LEAD_SOURCE);

// Only 'Investor' counts in investor totals.
export const ORGANISATION_TYPES = ['Investor', 'Intermediary', 'Promotion agent', 'Contact'];
export const DEFAULT_ORGANISATION_TYPE = 'Investor';

export const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'Other'];
export const DEFAULT_CURRENCY = 'NGN';
