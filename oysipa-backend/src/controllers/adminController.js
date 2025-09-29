const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');

const getDashboardKpis = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalInvestors,
      totalProjects,
      projectsByStage,
      recentInteractions,
    ] = await Promise.all([
      Investor.countDocuments(),
      InvestmentProject.countDocuments(),
      InvestmentProject.aggregate([
        {
          $group: {
            _id: '$lifecycleStatus',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            lifecycleStatus: '$_id',
            count: 1,
          },
        },
      ]),
      InteractionLog.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    res.json({
      totalInvestors,
      totalProjects,
      projectsByStage,
      recentInteractions,
    });
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = {
  getDashboardKpis,
};
