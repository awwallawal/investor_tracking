// Sector list (story 11.14, includes 11.6). Single source for investor and
// project sectors. The frontend keeps a copy in
// oysipa-frontend/src/constants/sectors.js; GET /api/sectors serves this list.
//
// Priority sectors are the six SABER priority sectors (owner decision 26 Oct 2026).

const NOT_RECORDED = 'Not recorded';
const OTHER = 'Other';

const PRIORITY_SECTORS = [
  'Infrastructure',
  'Waste and circular economy',
  'Real estate and construction',
  'Agribusiness',
  'Renewable energy',
  'Culture and tourism',
];

const OTHER_SECTORS = [
  'Manufacturing',
  'Solid minerals and mining',
  'Technology and ICT',
  'Financial services',
  'Trade and retail',
  'Healthcare',
  'Transport and logistics',
  'Oil and gas',
  OTHER,
];

const SECTORS = [
  ...PRIORITY_SECTORS.map((name) => ({ name, priority: true })),
  ...OTHER_SECTORS.map((name) => ({ name, priority: false })),
];
const SECTOR_NAMES = SECTORS.map((s) => s.name);
// Values a record may store: the list plus "Not recorded".
const SECTOR_VALUES = [...SECTOR_NAMES, NOT_RECORDED];
const isPrioritySector = (name) => PRIORITY_SECTORS.includes(name);

// Compare form: lower case, "&" = "and", one space, trimmed.
const norm = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();

// Spellings (compare form) → sector. Sector names themselves match too.
const ALIASES = {
  // Agribusiness
  'agriculture/agribusiness': 'Agribusiness',
  'agriculture / agribusiness': 'Agribusiness',
  agriculture: 'Agribusiness',
  agritech: 'Agribusiness',
  'agriculture/agritech': 'Agribusiness',
  agro: 'Agribusiness',
  'agro-allied': 'Agribusiness',
  'agribusiness and infrastructure': 'Agribusiness',
  // Culture and tourism
  tourism: 'Culture and tourism',
  'tourism and leisure': 'Culture and tourism',
  'tourism and hospitality': 'Culture and tourism',
  hospitality: 'Culture and tourism',
  culture: 'Culture and tourism',
  // Infrastructure
  'infrastructure, energy, agriculture, mining': 'Infrastructure',
  // Solid minerals and mining
  'solid minerals': 'Solid minerals and mining',
  mining: 'Solid minerals and mining',
  'mining and solid minerals': 'Solid minerals and mining',
  // Technology and ICT
  ict: 'Technology and ICT',
  technology: 'Technology and ICT',
  tech: 'Technology and ICT',
  // Trade and retail
  'retail and trade': 'Trade and retail',
  trade: 'Trade and retail',
  retail: 'Trade and retail',
  // Healthcare
  'healthcare infrastructure': 'Healthcare',
  health: 'Healthcare',
  // Oil and gas
  'energy (oil and gas)': 'Oil and gas',
  // Transport and logistics
  transport: 'Transport and logistics',
  logistics: 'Transport and logistics',
  // Financial services
  finance: 'Financial services',
  // Other (known: no warning)
  'development partner': OTHER,
  'employer federation': OTHER,
  'development partner / employer federation': OTHER,
  // Not recorded
  'not known': NOT_RECORDED,
  'not stated': NOT_RECORDED,
  unknown: NOT_RECORDED,
  'n/a': NOT_RECORDED,
};
SECTOR_VALUES.forEach((name) => { ALIASES[norm(name)] = name; });

const lookup = (text) => ALIASES[norm(text)];

// "Base (qualifier)" → { base, qualifier }, else null.
const splitQualifier = (text) => {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(String(text));
  return m ? { base: m[1], qualifier: m[2] } : null;
};

// Any spelling → { sector, detail, warning? }.
// - Empty, "Not known" → "Not recorded" (no detail).
// - Case and spaces are ignored; a bracketed qualifier maps by its base;
//   "Intermediary (x)" maps by its bracket.
// - detail keeps the original text when it differs from the sector name.
// - Anything unknown → "Other" with a warning (the text is kept as detail).
const resolveSector = (raw) => {
  const text = raw === undefined || raw === null ? '' : String(raw).trim().replace(/\s+/g, ' ');
  if (!text) return { sector: NOT_RECORDED, detail: null };
  const withDetail = (sector) => ({
    sector,
    detail: sector === NOT_RECORDED || norm(text) === norm(sector) ? null : text,
  });

  const direct = lookup(text);
  if (direct) return withDetail(direct);

  const q = splitQualifier(text);
  if (q) {
    if (norm(q.base) === 'intermediary') {
      const inner = lookup(q.qualifier)
        || (q.qualifier.split('/').map((p) => lookup(p)).find(Boolean));
      if (inner && inner !== NOT_RECORDED) return withDetail(inner);
      return { ...withDetail(OTHER), warning: `Sector "${text}" is not on the list; set to Other.` };
    }
    const base = lookup(q.base);
    if (base) return withDetail(base);
  }
  return { ...withDetail(OTHER), warning: `Sector "${text}" is not on the list; set to Other.` };
};

// A value the API accepts (list values only).
const isSectorValue = (v) => typeof v === 'string' && SECTOR_VALUES.includes(v);

module.exports = {
  NOT_RECORDED,
  OTHER_SECTOR: OTHER,
  PRIORITY_SECTORS,
  OTHER_SECTORS,
  SECTORS,
  SECTOR_NAMES,
  SECTOR_VALUES,
  isPrioritySector,
  isSectorValue,
  resolveSector,
};
