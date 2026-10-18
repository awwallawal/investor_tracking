const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const { isAdminRole, isAssignedTo, hasOperatorKey } = require('./accessHelpers');
const InvestmentProject = require('../models/InvestmentProject');

const DENIED_MSG = 'Forbidden: You can only change projects of investors assigned to you';

// Staff may write only on projects whose investor is assigned to them
// (Investor.assignedTo). Director-General and Portal-Admin pass straight through.
// A missing project or malformed id is passed on so the controller keeps its
// existing response. Unexpected errors fail closed with 500.
const projectWriteAccess = async (req, res, next) => {
  try {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ msg: 'Authentication error: User data is missing.' });
    }
    if (isAdminRole(req.user.role)) {
      return next();
    }
    if (req.user.role !== 'Staff') {
      return res.status(403).json({ msg: 'Forbidden: You do not have access to this resource' });
    }

    // Update operators ($set, $unset, ...) would let the body bypass the checks below.
    if (hasOperatorKey(req.body)) {
      return res.status(400).json({ msg: 'Invalid update' });
    }

    const userId = req.user._id;
    let investorId;

    if (req.params.investorId) {
      investorId = req.params.investorId;
      if (!mongoose.isValidObjectId(investorId)) return next();
      const exists = await Investor.exists({ _id: investorId });
      if (!exists) return next();
    } else {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return next();
      const project = await InvestmentProject.findById(id).select('investor');
      if (!project) return next();
      investorId = project.investor;
    }

    if (!(await isAssignedTo(investorId, userId))) {
      return res.status(403).json({ msg: DENIED_MSG });
    }

    // Moving a project to another investor: that investor must be theirs too.
    // (On create the controller overwrites investor with :investorId, so skip it there.)
    const bodyInvestor = req.body && req.body.investor;
    if (!req.params.investorId && bodyInvestor !== undefined && bodyInvestor !== null && bodyInvestor !== '') {
      const target = typeof bodyInvestor === 'object' && bodyInvestor._id ? bodyInvestor._id : bodyInvestor;
      if (!(await isAssignedTo(target, userId))) {
        return res.status(403).json({ msg: DENIED_MSG });
      }
    }

    return next();
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ msg: 'Server Error' });
  }
};

module.exports = projectWriteAccess;
