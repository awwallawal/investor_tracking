const mongoose = require('mongoose');
const auditPlugin = require('../utils/auditPlugin');

const lifecycleStatusSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  order: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    trim: true
  }
});

// Story 11.10: create/update rows in the ChangeLog (the delete writes its own).
lifecycleStatusSchema.plugin(auditPlugin, { entity: 'LifecycleStatus' });

const LifecycleStatus = mongoose.model('LifecycleStatus', lifecycleStatusSchema);

module.exports = LifecycleStatus;
