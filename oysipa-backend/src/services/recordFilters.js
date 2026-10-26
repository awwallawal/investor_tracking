// Click-through filters (story 11.14): sector and country conditions shared by
// GET /api/investors and GET /api/projects. They match on the same grouping the
// analytics use (resolveSector / countryLabel), so a bar's count and the list it
// opens agree even before the clean-up migration has run.
const { resolveSector, NOT_RECORDED, SECTOR_VALUES } = require('../constants/sectors');
const { countryMatches } = require('../constants/countries');

const ci = (v) => String(v).trim().toLowerCase();
const isNotRecorded = (v) => ci(v) === ci(NOT_RECORDED);

// A sector filter value → its list spelling (case-insensitive), or null.
const canonicalSector = (v) => (typeof v === 'string' ? SECTOR_VALUES.find((s) => ci(s) === ci(v)) || null : null);

const missing = (field) => [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }];

// Mongo condition: records whose `field` resolves to `sector`.
const sectorCondition = async (Model, raw, field = 'sector') => {
  const sector = canonicalSector(raw) || raw;
  const stored = (await Model.distinct(field)).filter((v) => typeof v === 'string');
  const values = stored.filter((v) => resolveSector(v).sector === sector);
  if (sector === NOT_RECORDED) return { $or: [{ [field]: { $in: values } }, ...missing(field)] };
  return { [field]: { $in: values } };
};

// Mongo condition: investors whose country falls under `label`.
const countryCondition = async (Model, label, field = 'countryOfOrigin') => {
  const stored = (await Model.distinct(field)).filter((v) => typeof v === 'string');
  const values = stored.filter((v) => countryMatches(v, label));
  if (isNotRecorded(label)) return { $or: [{ [field]: { $in: values } }, ...missing(field)] };
  return { [field]: { $in: values } };
};

module.exports = { sectorCondition, countryCondition, canonicalSector };
