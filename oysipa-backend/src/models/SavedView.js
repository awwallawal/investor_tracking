const mongoose = require('mongoose');

// A saved list view (story 11.15): a named URL query of one list, stored per
// user. DG / Portal-Admin can share a view with everyone.
const LISTS = ['investors', 'projects', 'interactions', 'issues', 'announcements', 'evidence', 'changelog'];
const MAX_NAME = 80;
const MAX_QUERY = 2000;

const SavedViewSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  list: { type: String, enum: LISTS, required: true },
  name: {
    type: String, required: true, trim: true, maxlength: MAX_NAME,
  },
  // URL query without the leading '?', e.g. "sector=Agribusiness&q=agro".
  query: { type: String, default: '', maxlength: MAX_QUERY },
  shared: { type: Boolean, default: false },
}, { timestamps: true });

SavedViewSchema.index({ list: 1, owner: 1 });
SavedViewSchema.index({ list: 1, shared: 1 });

const SavedView = mongoose.model('SavedView', SavedViewSchema);
SavedView.LISTS = LISTS;
SavedView.MAX_NAME = MAX_NAME;
SavedView.MAX_QUERY = MAX_QUERY;

module.exports = SavedView;
