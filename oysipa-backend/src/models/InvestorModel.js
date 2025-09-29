const mongoose = require('mongoose');

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
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  sector: {
    type: String,
    required: true
  },
  countryOfOrigin: {
    type: String,
    required: true
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
  }
}, { timestamps: true }); // ✅ correct way

const Investor = mongoose.model('Investor', investorSchema);

module.exports = Investor;
