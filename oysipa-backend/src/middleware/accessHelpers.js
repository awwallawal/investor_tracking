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

// Interaction writes (Tag services, documents): DG/Admin always; Staff only when
// the log's investor is assigned to them. A project-linked log follows the
// project's current investor; the stored investor is used only when there is no
// project or it is gone. `log` needs `investor` and `project`.
const canWriteInteraction = async (log, user) => {
  if (isAdminRole(user.role)) return true;
  if (user.role !== 'Staff') return false;
  let investorId = log.investor;
  if (log.project) {
    // Required lazily: InvestmentProject's model file is loaded after this one.
    // eslint-disable-next-line global-require
    const InvestmentProject = require('../models/InvestmentProject');
    const project = await InvestmentProject.findById(log.project).select('investor').lean();
    if (project && project.investor) investorId = project.investor;
  }
  return !!investorId && isAssignedTo(investorId, user._id);
};

module.exports = { isAdminRole, isAssignedTo, hasOperatorKey, canWriteInteraction };
