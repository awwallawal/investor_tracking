const mongoose = require('mongoose');
const auditPlugin = require('../utils/auditPlugin');
const {
  LEAD_SOURCES, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE, EMAIL_RE,
} = require('../constants/investorFields');

const investorSchema = new mongoose.Schema({
  investorName: {
    type: String,
    required: true,
    trim: true,
    unique: true // optional but useful
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true, // Add this to allow multiple null emails
    match: [EMAIL_RE, 'Please fill a valid email address']
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  // Story 11.14: one of the sector list (src/constants/sectors.js) or
  // "Not recorded". Checked by the API, not the schema, so records saved before
  // the clean-up migration still load and save.
  sector: {
    type: String,
    required: true
  },
  // Optional free text kept next to the sector (e.g. the original spelling).
  sectorDetail: {
    type: String,
    trim: true
  },
  countryOfOrigin: {
    type: String,
    required: true
  },
  // Optional free text kept next to the country (data clean-up, 11.14).
  countryDetail: {
    type: String,
    trim: true
  },
  companyRegistrationInfo: {
    type: String
  },
  keyContactPerson: {
    type: String
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Happened date of first contact (officer-entered). No default: set by the
  // controller on create; old records keep none and display createdAt.
  firstContactDate: {
    type: Date
  },
  // SABER T11 (story 11.5). No schema default: the controller requires it on
  // create, and the migration sets "Unknown (pre-T11)" on older records.
  leadSource: {
    type: String,
    enum: { values: LEAD_SOURCES, message: 'Invalid lead source: {VALUE}' }
  },
  leadSourceDetail: {
    type: String,
    trim: true
  },
  organisationType: {
    type: String,
    enum: { values: ORGANISATION_TYPES, message: 'Invalid organisation type: {VALUE}' },
    default: DEFAULT_ORGANISATION_TYPE
  },
  // Set when leadSource is "Intermediary referral"; must be an Intermediary record.
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investor'
  },
  notes: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  headOffice: {
    type: String,
    trim: true
  },
  // Import stamps (story 11.11): the run that created the record, and the file's tags.
  importBatchId: {
    type: String
  },
  importTags: {
    type: [String],
    default: undefined
  }
}, { timestamps: true }); // ✅ correct way

// Story 11.10: ChangeLog create/update rows with old/new values.
investorSchema.plugin(auditPlugin, { entity: 'Investor' });

const Investor = mongoose.model('Investor', investorSchema);

module.exports = Investor;
