const mongoose = require('mongoose');
const { SERVICE_CODES } = require('../constants/serviceCodes');

// A privately stored evidence file in the library. Stored once (unique sha256)
// and linked to any number of investors / interactions. Same storage, types and
// size limit as interaction documents. provider/key/resourceType are internal:
// they are stripped from every JSON response (see toJSON below).
//
// Service codes on a link describe the file only: they are never counted as
// services (the dashboard and export keep counting interactions).
const EvidenceLinkSchema = new mongoose.Schema({
  investor: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  interaction: { type: mongoose.Schema.Types.ObjectId, ref: 'InteractionLog' },
  serviceCodes: {
    type: [{ type: String, enum: { values: SERVICE_CODES, message: 'Invalid service code: {VALUE}' } }],
    default: [],
  },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  linkedAt: { type: Date, required: true },
});

const EvidenceFileSchema = new mongoose.Schema({
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'EvidenceFolder', required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true, unique: true },
  // Happened date; may be empty (screens then show uploadedAt). Never in the future.
  documentDate: { type: Date },
  what: { type: String, trim: true },
  provider: { type: String, required: true },
  key: { type: String, required: true },
  resourceType: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, required: true },
  importBatchId: { type: String },
  links: { type: [EvidenceLinkSchema], default: [] },
}, {
  timestamps: true,
});

EvidenceFileSchema.index({ 'links.investor': 1 });
EvidenceFileSchema.index({ 'links.interaction': 1 });
EvidenceFileSchema.index({ folder: 1 });

const INTERNAL_FIELDS = ['provider', 'key', 'resourceType'];
EvidenceFileSchema.set('toJSON', {
  transform: (doc, ret) => {
    INTERNAL_FIELDS.forEach((f) => { delete ret[f]; });
    return ret;
  },
});

// Query for files with no links ("untagged").
const UNTAGGED = { 'links.0': { $exists: false } };

const EvidenceFile = mongoose.model('EvidenceFile', EvidenceFileSchema);
EvidenceFile.INTERNAL_FIELDS = INTERNAL_FIELDS;
EvidenceFile.UNTAGGED = UNTAGGED;

module.exports = EvidenceFile;
