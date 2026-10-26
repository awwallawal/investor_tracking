// Analytics (story 11.14): the DG dashboard and the "My work" page, both from
// the shared metrics service (services/metrics.js), plus the exchange rates
// and the sector list the screens use.
const { overview, mine, resolveYear } = require('../services/metrics');
const { getFxRates, parseFxEntry, addFxRate } = require('../services/fxRates');
const { SECTORS, NOT_RECORDED } = require('../constants/sectors');

// GET /api/analytics/overview?year=YYYY|all (default: the current Lagos year)
const getOverview = async (req, res) => {
  try {
    const raw = req.query ? req.query.year : undefined;
    const parsed = resolveYear(raw);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    return res.json(await overview({ year: parsed.year }));
  } catch (error) {
    console.error('Error building the analytics overview:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/analytics/mine (Staff: their assigned investors; DG/Admin: all)
const getMine = async (req, res) => {
  try {
    return res.json(await mine({ user: req.user }));
  } catch (error) {
    console.error('Error building "My work":', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/fx-rates (all roles)
const listFxRates = async (req, res) => {
  try {
    return res.json(await getFxRates());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// POST /api/fx-rates { currency, rate, asOf, source } (DG / Portal-Admin)
const createFxRate = async (req, res) => {
  try {
    const { entry, error } = parseFxEntry(req.body);
    if (error) return res.status(400).json({ message: error });
    return res.status(201).json(await addFxRate(entry, req.user && req.user._id));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// GET /api/sectors (all roles): the sector list, priority sectors first.
const listSectors = (req, res) => res.json({ sectors: SECTORS, notRecorded: NOT_RECORDED });

module.exports = {
  getOverview, getMine, listFxRates, createFxRate, listSectors,
};
