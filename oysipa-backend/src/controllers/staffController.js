const InvestmentProject = require('../models/InvestmentProject');
const Investor = require('../models/InvestorModel');

exports.getStaffDashboard = async (req, res) => {
  try {
    const staffId = req.user.id;

    // Role-based access control: Only Staff can access this dashboard
    if (req.user.role !== 'Staff') {
      return res.status(403).json({ msg: 'Access denied: Not a Staff member' });
    }

    // Find all projects assigned to the staff member
    const projects = await InvestmentProject.find({ assignedTo: staffId })
      .populate('investor', 'investorName');

    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
};