// Shared helpers for the Evidence library (controller, bulk attach CLI and the
// investor / interaction delete cascades).
const crypto = require('crypto');
const path = require('path');
const EvidenceFile = require('../models/EvidenceFile');
const EvidenceFolder = require('../models/EvidenceFolder');
const { ALLOWED } = require('../middleware/documentUpload');
const { SERVICE_CODES } = require('../constants/serviceCodes');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// MIME type from the extension only (never from the content), through the same
// map the upload route uses, so both paths accept exactly the same types.
const mimeFromName = (fileName) => {
  const types = ALLOWED[path.extname(fileName || '').toLowerCase()];
  return types ? types[0] : null;
};

// Top-level display order: the five known keys first, then by name.
const topOrder = (key) => {
  const i = EvidenceFolder.TOP_FOLDER_ORDER.indexOf(key);
  return i === -1 ? EvidenceFolder.TOP_FOLDER_ORDER.length : i;
};

const compareTop = (a, b) => (a.order - b.order) || String(a.name).localeCompare(String(b.name));
// Subfolders: by folderDate (empty dates last), then key.
const compareSub = (a, b) => {
  const ta = a.folderDate ? new Date(a.folderDate).getTime() : Infinity;
  const tb = b.folderDate ? new Date(b.folderDate).getTime() : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return String(a.key).localeCompare(String(b.key));
};

// Folder dates are optional calendar days (YYYY-MM-DD). Returns { value } or { error }.
const parseFolderDate = (raw) => {
  if (raw === undefined || raw === null || raw === '') return { value: undefined };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: 'Folder date must be a date (YYYY-MM-DD).' };
  }
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    return { error: 'Folder date is not a valid date.' };
  }
  return { value: d };
};

// Validates and dedupes service codes. Returns { codes } or { error }.
const parseLinkCodes = (raw) => {
  if (raw === undefined || raw === null) return { codes: [] };
  if (!Array.isArray(raw)) return { error: 'serviceCodes must be an array of service codes.' };
  const invalid = raw.filter((c) => typeof c !== 'string' || !SERVICE_CODES.includes(c));
  if (invalid.length > 0) {
    return { error: `Invalid service code(s): ${invalid.map((c) => JSON.stringify(c)).join(', ')}` };
  }
  return { codes: SERVICE_CODES.filter((c) => raw.includes(c)) };
};

// Links that point at any of these investors, interactions, investor issues or
// announcements, as [{ fileId, link }]. Used by the investor, interaction, issue
// and announcement delete cascades.
const findLinksTo = async ({
  investorIds = [], interactionIds = [], issueIds = [], announcementIds = [],
}) => {
  if (investorIds.length === 0 && interactionIds.length === 0 && issueIds.length === 0 && announcementIds.length === 0) return [];
  const files = await EvidenceFile.find({
    $or: [
      { 'links.investor': { $in: investorIds } },
      { 'links.interaction': { $in: interactionIds } },
      { 'links.issue': { $in: issueIds } },
      { 'links.announcement': { $in: announcementIds } },
    ],
  }).select('links').lean();
  const inv = new Set(investorIds.map(String));
  const ints = new Set(interactionIds.map(String));
  const iss = new Set(issueIds.map(String));
  const anns = new Set(announcementIds.map(String));
  return files.flatMap((f) => (f.links || [])
    .filter((l) => inv.has(String(l.investor))
      || (l.interaction && ints.has(String(l.interaction)))
      || (l.issue && iss.has(String(l.issue)))
      || (l.announcement && anns.has(String(l.announcement))))
    .map((link) => ({ fileId: f._id, link })));
};

// Snapshots for ChangeLog `unlink` rows (entity EvidenceFile, snapshot = the link).
const unlinkSnapshots = (found) => found.map(({ fileId, link }) => ({ _id: fileId, link }));

// Removes exactly these links. The files stay in the library.
const pullLinks = async (found) => {
  const byFile = new Map();
  found.forEach(({ fileId, link }) => {
    const k = String(fileId);
    if (!byFile.has(k)) byFile.set(k, { fileId, ids: [] });
    byFile.get(k).ids.push(link._id);
  });
  await Promise.all([...byFile.values()].map(({ fileId, ids }) => EvidenceFile.updateOne(
    { _id: fileId },
    { $pull: { links: { _id: { $in: ids } } } },
  )));
};

// Library files linked to these interactions, per interaction id:
// { [logId]: [{ _id, fileName, mimeType, size, documentDate, uploadedAt }] }.
const evidenceFilesByInteraction = async (logIds) => {
  if (logIds.length === 0) return {};
  const files = (await EvidenceFile.find({ 'links.interaction': { $in: logIds } })
    .select('fileName mimeType size documentDate uploadedAt links.interaction')
    .lean())
    // Same order as the folder page: happened date (else upload date), then name.
    .sort((a, b) => (new Date(a.documentDate || a.uploadedAt) - new Date(b.documentDate || b.uploadedAt))
      || String(a.fileName).localeCompare(String(b.fileName)));
  const wanted = new Set(logIds.map(String));
  const out = {};
  files.forEach((f) => {
    const seen = new Set();
    (f.links || []).forEach((l) => {
      const k = l.interaction && String(l.interaction);
      if (!k || !wanted.has(k) || seen.has(k)) return;
      seen.add(k);
      if (!out[k]) out[k] = [];
      out[k].push({
        _id: f._id, fileName: f.fileName, mimeType: f.mimeType, size: f.size, documentDate: f.documentDate, uploadedAt: f.uploadedAt,
      });
    });
  });
  return out;
};

// Adds `evidenceFiles` to each interaction log (mongoose documents or plain).
const withEvidenceFiles = async (logs) => {
  const byLog = await evidenceFilesByInteraction(logs.map((l) => l._id));
  return logs.map((l) => {
    const plain = typeof l.toJSON === 'function' ? l.toJSON() : { ...l };
    plain.evidenceFiles = byLog[String(l._id)] || [];
    return plain;
  });
};

module.exports = {
  sha256,
  mimeFromName,
  topOrder,
  compareTop,
  compareSub,
  parseFolderDate,
  parseLinkCodes,
  findLinksTo,
  unlinkSnapshots,
  pullLinks,
  evidenceFilesByInteraction,
  withEvidenceFiles,
};
