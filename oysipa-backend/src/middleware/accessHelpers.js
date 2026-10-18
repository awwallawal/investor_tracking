const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');

// Shared by projectWriteAccess and investorWriteAccess.

const isAdminRole = (role) => role === 'Director-General' || role === 'Portal-Admin';

// True when the investor exists and is assigned (Investor.assignedTo) to userId.
const isAssignedTo = async (investorId, userId) => {
  if (!mongoose.isValidObjectId(investorId)) return false;
  const investor = await Investor.findById(investorId).select('assignedTo');
  return !!(investor && investor.assignedTo && investor.assignedTo.toString() === userId.toString());
};

// Update operators ($set, $unset, ...) in a body would bypass field-level checks.
// An array body is refused too: Mongoose runs an array update as a pipeline,
// and Model.create with an array creates several documents.
const hasOperatorKey = (body) =>
  Array.isArray(body)
  || !!(body && typeof body === 'object' && Object.keys(body).some((k) => k.startsWith('$')));

module.exports = { isAdminRole, isAssignedTo, hasOperatorKey };
