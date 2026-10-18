const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const { isAdminRole, isAssignedTo, hasOperatorKey } = require('./accessHelpers');

const DENIED_MSG = 'Forbidden: You can only change investors assigned to you';

// Investor writes (POST /api/investors, PUT /api/investors/:id).
// Director-General and Portal-Admin pass straight through.
// Staff:
//   - create: the new investor is always assigned to them (assignedTo is overwritten).
//   - edit: only investors assigned to them; assignedTo is stripped from the body,
//     so Staff can never change an assignment (the edit form always sends it).
// A missing or malformed investor id is passed on so the controller keeps its
// existing response. Unexpected errors fail closed with 500.
// Field-level rules for later stories (e.g. 11.5: only DG/Admin may correct
// leadSource after create) belong in this middleware.
const investorWriteAccess = async (req, res, next) => {
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

    if (req.method === 'POST') {
      if (!req.body || typeof req.body !== 'object') req.body = {};
      req.body.assignedTo = userId;
      return next();
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return next();
    const exists = await Investor.exists({ _id: id });
    if (!exists) return next();

    if (!(await isAssignedTo(id, userId))) {
      return res.status(403).json({ msg: DENIED_MSG });
    }

    if (req.body && typeof req.body === 'object') {
      delete req.body.assignedTo;
    }
    return next();
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ msg: 'Server Error' });
  }
};

module.exports = investorWriteAccess;
