const mongoose = require('mongoose');

// App settings edited in the app (story 11.7c). One document per key.
// Keys: mouMdas (codes of the MDAs in OYSIPA's MoU; DG/Portal-Admin).
const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: { createdAt: false, updatedAt: true },
});

module.exports = mongoose.model('Setting', SettingSchema);
