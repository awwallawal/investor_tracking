const mongoose = require('mongoose');

const InteractionLogSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InvestmentProject',
    required: true,
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
}, {
  timestamps: true,
});

module.exports = mongoose.model('InteractionLog', InteractionLogSchema);