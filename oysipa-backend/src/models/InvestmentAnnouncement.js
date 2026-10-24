const mongoose = require('mongoose');
const auditPlugin = require('../utils/auditPlugin');

// Announcements register (story 11.8, SABER DLR 4.4): a public investment
// announcement and whether it names OYSIPA's support. The investor is the
// project's investor (not stored). Field names are kept v2-compatible.
//
// Server-owned: createdBy, importRef, importBatchId, importNote,
// createdAt/updatedAt. Never taken from the client.
const httpUrl = {
  validator: (v) => {
    if (v === undefined || v === null || v === '') return true;
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  },
  message: 'Links must start with http:// or https://',
};

const InvestmentAnnouncementSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentProject', required: true },
  // Happened date: when it was published. The metric counts by this date.
  announcementDate: { type: Date, required: true },
  // Who published it (e.g. a newspaper or the State website).
  outlet: { type: String, required: true, trim: true },
  url: { type: String, trim: true, validate: httpUrl },
  // e.g. a web archive link.
  archivedCopyUrl: { type: String, trim: true, validate: httpUrl },
  oysipaNamed: { type: Boolean, required: true, default: false },
  // What the release says OYSIPA did. Required when oysipaNamed is true.
  oysipaRoleText: {
    type: String,
    trim: true,
    required: [function roleRequired() { return this.oysipaNamed === true; }, 'Say what the announcement says OYSIPA did.'],
  },
  // Interactions of the project or of its investor that show OYSIPA's support.
  supportingInteractions: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InteractionLog' }],
    default: [],
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Import stamps (loader). importRef is the file's id.
  importRef: { type: String, trim: true },
  importBatchId: { type: String },
  importNote: { type: String, trim: true },
}, {
  timestamps: true,
});

InvestmentAnnouncementSchema.index({ project: 1 });
InvestmentAnnouncementSchema.index({ announcementDate: 1 });
InvestmentAnnouncementSchema.index({ supportingInteractions: 1 });
InvestmentAnnouncementSchema.index({ importRef: 1 }, { unique: true, sparse: true });

// Story 11.10: ChangeLog create/update rows with old/new values.
InvestmentAnnouncementSchema.plugin(auditPlugin, { entity: 'InvestmentAnnouncement' });

module.exports = mongoose.model('InvestmentAnnouncement', InvestmentAnnouncementSchema);
