const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');

const getDashboardKpis = async (req, res) => {
  try {
    const [
      totalInvestors,
      totalProjects,
      projectsByStage,
      allTimeInteractions,
    ] = await Promise.all([
      Investor.countDocuments(),
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

module.exports = {
  getDashboardKpis,
};
