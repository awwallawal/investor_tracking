// Fill the gaps (story 11.17). All roles may read.
// GET /api/fill-gaps?year=YYYY|all&officer=me|all|<id>&missing=T5,T7&q=  → { year, currentYear, summary, total, rows }
// GET /api/fill-gaps?count=1&officer=me                                   → { year, currentYear, count } (sidebar badge)
// year: as the SABER report (2000 to the current Lagos year, or all; default
// the current year); anything else → 400. Unknown officer / missing values are
// ignored. Fixes are saved through the existing audited routes, never here.
const { resolveYear } = require('../services/metrics');
const { buildFillGaps } = require('../services/fillGaps');

const getFillGaps = async (req, res) => {
  try {
    const query = req.query || {};
    const parsed = resolveYear(Array.isArray(query.year) ? query.year[0] : query.year);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const result = await buildFillGaps({ year: parsed.year, query, user: req.user });
    return res.json({ ...result, currentYear: parsed.current });
  } catch (error) {
    console.error('Error building Fill the gaps:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getFillGaps };
