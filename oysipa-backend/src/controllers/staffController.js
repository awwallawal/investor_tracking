const mongoose = require('mongoose');
const InvestmentProject = require('../models/InvestmentProject');
const Investor = require('../models/InvestorModel');

exports.getStaffDashboard = async (req, res) => {
  try {
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    // Role-based access control: Only Staff can access this dashboard
    if (req.user.role !== 'Staff') {
      return res.status(403).json({ msg: 'Access denied: Not a Staff member' });
    }

    // Find all investors assigned to the staff member
    const assignedInvestors = await Investor.find({ assignedTo: staffId }).select('_id');
    const investorIds = assignedInvestors.map(inv => inv._id);

    // Find all projects linked to those investors
    const projects = await InvestmentProject.find({ investor: { $in: investorIds } })
      .populate('investor', 'investorName');

    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
};