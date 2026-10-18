const mongoose = require('mongoose');
const { SERVICE_CODES } = require('../constants/serviceCodes');

const InteractionLogSchema = new mongoose.Schema({
  // Optional: an interaction can be logged at investor level, before any project exists.
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InvestmentProject',
  },
  // Always set from the project when there is one (see pre('validate')).
  investor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investor',
    required: [function investorRequired() { return !this.project; }, 'Investor is required when there is no project.'],
  },
  loggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  documentUrl: {
    type: String,
  },
  // SABER DLI 4 service codes (field T10).
  serviceCodes: {
    type: [{ type: String, enum: { values: SERVICE_CODES, message: 'Invalid service code: {VALUE}' } }],
    default: [],
  },
  // "Assistance linking investors to credit institutions" has no code in the PDF.
  creditLinkage: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

InteractionLogSchema.index({ investor: 1, createdAt: -1 });

// A project-linked log takes its investor from the project, never from the caller.
InteractionLogSchema.pre('validate', async function setInvestorFromProject() {
  if (!this.project) return;
  if (!this.isNew && !this.isModified('project') && this.investor) return;
  // Required lazily to avoid a load-order dependency between the models.
  // eslint-disable-next-line global-require
  const InvestmentProject = require('./InvestmentProject');
  const project = await InvestmentProject.findById(this.project).select('investor').lean();
  if (project && project.investor) {
    this.investor = project.investor;
  }
});

module.exports = mongoose.model('InteractionLog', InteractionLogSchema);
