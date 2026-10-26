// Sector list (story 11.14, includes 11.6). Keep in sync with
// oysipa-backend/src/constants/sectors.js (the API accepts list values only;
// GET /api/sectors serves the same list).

export const NOT_RECORDED = 'Not recorded';

// The six SABER priority sectors (owner decision 26 Oct 2026).
export const PRIORITY_SECTORS = [
  'Infrastructure',
  'Waste and circular economy',
  'Real estate and construction',
  'Agribusiness',
  'Renewable energy',
  'Culture and tourism',
];

export const OTHER_SECTORS = [
  'Manufacturing',
  'Solid minerals and mining',
  'Technology and ICT',
  'Financial services',
  'Trade and retail',
  'Healthcare',
  'Transport and logistics',
  'Oil and gas',
  'Other',
];

export const SECTORS = [
  ...PRIORITY_SECTORS.map((name) => ({ name, priority: true })),
  ...OTHER_SECTORS.map((name) => ({ name, priority: false })),
];

export const SECTOR_NAMES = SECTORS.map((s) => s.name);
export const SECTOR_VALUES = [...SECTOR_NAMES, NOT_RECORDED];
export const isSectorValue = (v) => SECTOR_VALUES.includes(v);
