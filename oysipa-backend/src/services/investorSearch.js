// Investor Directory search (story 11.7). Case-insensitive partial match on
// investorName, sector, countryOfOrigin, keyContactPerson, headOffice,
// leadSourceDetail, and the title / location of the investor's projects.
// Notes are never searched.
//
// Both sides are normalised: lower case, "&" = "and", punctuation ignored,
// whitespace collapsed. Stored values cannot be normalised inside a regex, so
// the normalised query becomes a pattern that tolerates them instead: between
// any two characters any run of punctuation / spaces may appear, and the word
// "and" also matches "&". Every character is regex-escaped.
const InvestmentProject = require('../models/InvestmentProject');

const INVESTOR_FIELDS = ['investorName', 'sector', 'countryOfOrigin', 'keyContactPerson', 'headOffice', 'leadSourceDetail'];
const PROJECT_FIELDS = ['projectTitle', 'location'];
const MAX_QUERY = 200;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

// "Lakeside Marine & Tourism!" → "lakeside marine and tourism"
const normaliseSearch = (raw) => String(raw || '')
  .slice(0, MAX_QUERY)
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}\s]+/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

const GAP = '[\\W_]*';

// Pattern source for a normalised query, or null when nothing is left.
const searchPattern = (raw) => {
  const norm = normaliseSearch(raw);
  if (!norm) return null;
  return norm.split(' ').map((token) => {
    const chars = [...token].map(escapeRegex).join(GAP);
    return token === 'and' ? `(?:${chars}|&)` : chars;
  }).join(GAP);
};

// Mongo filter for the search, or null when the query is empty after normalising.
const investorSearchFilter = async (raw) => {
  const source = searchPattern(raw);
  if (!source) return null;
  const regex = new RegExp(source, 'i');
  const investorIds = await InvestmentProject.find({ $or: PROJECT_FIELDS.map((f) => ({ [f]: regex })) }).distinct('investor');
  return {
    $or: [
      ...INVESTOR_FIELDS.map((f) => ({ [f]: regex })),
      ...(investorIds.length ? [{ _id: { $in: investorIds } }] : []),
    ],
  };
};

module.exports = {
  normaliseSearch, searchPattern, investorSearchFilter, escapeRegex, INVESTOR_FIELDS, PROJECT_FIELDS,
};
