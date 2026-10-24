const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const { INVESTOR_COUNT_FILTER } = require('../constants/investorFields');
const { parseYear, issuesMetric } = require('../services/issueRegister');
const { todayLagos } = require('../utils/happenedDate');

const getDashboardKpis = async (req, res) => {
  try {
    const [
      totalInvestors,
      totalProjects,
      projectsByStage,
      allTimeInteractions,
    ] = await Promise.all([
      // Only organisation type Investor (or none set: old records) counts.
      Investor.countDocuments(INVESTOR_COUNT_FILTER),
      InvestmentProject.countDocuments(),
      InvestmentProject.aggregate([
        {
          $lookup: {
            from: 'lifecyclestatuses', // The collection name for LifecycleStatus model
            localField: 'lifecycleStatus',
            foreignField: '_id',
            as: 'statusDetails',
          },
        },
        {
          $unwind: '$statusDetails',
        },
        {
          $group: {
            _id: '$statusDetails.name',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            count: 1,
          },
        },
      ]),
      InteractionLog.countDocuments(),
    ]);

    res.json({
      totalInvestors,
      totalProjects,
      projectsByStage,
      recentInteractions: allTimeInteractions, // Keep the original field name for compatibility
    });
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/admin/issues-metric?year= (default: the current Lagos year)
// Resolved share (DLR 4.5) by dateReported, Withdrawn left out.
const getIssuesMetric = async (req, res) => {
  try {
    const raw = req.query && req.query.year;
    const year = raw === undefined || raw === '' ? Number(todayLagos().slice(0, 4)) : parseYear(raw);
    if (!year) return res.status(400).json({ message: 'Invalid year.' });
    return res.json(await issuesMetric(year));
  } catch (error) {
    console.error('Error fetching the issues metric:', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = {
  getDashboardKpis,
  getIssuesMetric,
};
