const mongoose = require('mongoose');

// Evidence library folder (two levels: top-level folders and their subfolders).
// `key` is stable ("engagements-2025" or "engagements-2025/some-event"): the bulk
// attach CLI finds folders by it, so a repeat run creates nothing.
const EvidenceFolderSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  // Optional date of the event or batch the folder holds.
  folderDate: { type: Date },
  // null at the top level; a subfolder's parent is always a top-level folder.
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'EvidenceFolder', default: null },
  order: { type: Number, default: 0 },
}, {
  timestamps: true,
});

EvidenceFolderSchema.index({ parent: 1 });

// Top-level display order (spec): any other top key sorts after these, by name.
const TOP_FOLDER_ORDER = ['engagements-2025', 'programmes', 'website-2025', 'marketing-media', 'mda-records'];

const EvidenceFolder = mongoose.model('EvidenceFolder', EvidenceFolderSchema);
EvidenceFolder.TOP_FOLDER_ORDER = TOP_FOLDER_ORDER;

module.exports = EvidenceFolder;
