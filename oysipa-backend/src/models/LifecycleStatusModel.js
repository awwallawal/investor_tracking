const mongoose = require('mongoose');

const lifecycleStatusSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  order: {
    type: Number,
    required: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  }
});

const LifecycleStatus = mongoose.model('LifecycleStatus', lifecycleStatusSchema);

module.exports = LifecycleStatus;
