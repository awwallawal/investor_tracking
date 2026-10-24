const mongoose = require('mongoose');
const auditPlugin = require('../utils/auditPlugin');
const { SERVICE_CODES } = require('../constants/serviceCodes');

// A privately stored file (FR-Y19). provider/key/resourceType are internal:
// they are stripped from every JSON response (see toJSON below).
const DocumentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  // Happened date of the document (officer-entered; today when left empty).
  documentDate: { type: Date },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, required: true },
  provider: { type: String, required: true },
  key: { type: String, required: true },
  resourceType: { type: String },
});

const INTERNAL_DOCUMENT_FIELDS = ['provider', 'key', 'resourceType'];
DocumentSchema.set('toJSON', {
  transform: (doc, ret) => {
    INTERNAL_DOCUMENT_FIELDS.forEach((f) => { delete ret[f]; });
    return ret;
  },
});

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
  // Legacy public link (pre-11.4b). Kept and still displayed.
  documentUrl: {
    type: String,
  },
  // Happened date (officer-entered). No schema default: the controllers set
  // today on create, and old records without one display their createdAt.
  interactionDate: {
    type: Date,
  },
  documents: {
    type: [DocumentSchema],
    default: undefined,
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
  // Import stamps (story 11.11): the file's interaction id (repeat-safe key),
  // the run that created it, and the file's tags.
  importRef: {
    type: String,
  },
  importBatchId: {
    type: String,
  },
  importTags: {
    type: [String],
    default: undefined,
  },
}, {
  timestamps: true,
});

InteractionLogSchema.index({ investor: 1, createdAt: -1 });
// Unique: one interaction per file id, even if two import runs overlap.
InteractionLogSchema.index({ importRef: 1 }, { unique: true, sparse: true });

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

// Story 11.10: ChangeLog create/update rows with old/new values.
InteractionLogSchema.plugin(auditPlugin, { entity: 'InteractionLog' });

const InteractionLog = mongoose.model('InteractionLog', InteractionLogSchema);
InteractionLog.INTERNAL_DOCUMENT_FIELDS = INTERNAL_DOCUMENT_FIELDS;

module.exports = InteractionLog;
