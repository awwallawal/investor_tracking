// Shared helpers for the announcements register (story 11.8, DLR 4.4): the
// announcement's Evidence library folder, the interactions it may link and the
// yearly metric. Used by announcementController, adminController and the loader.
const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const { topOrder } = require('./evidenceLibrary');
const { findOrCreateFolder, yearRange } = require('./issueRegister');
const { lagosDay } = require('../utils/happenedDate');
const { EXCLUDED_ORGANISATION_TYPES, announcementBand } = require('../constants/announcementFields');

const ANNOUNCEMENTS_TOP_KEY = 'announcements';
const ANNOUNCEMENTS_TOP_NAME = 'Announcements';
const ANNOUNCEMENTS_TOP_DESCRIPTION = 'Archived copies of investment announcements (DLR 4.4), one subfolder per announcement.';

// The announcement's own subfolder: announcements/<importRef or id>.
const SAFE_REF = /^[A-Za-z0-9_-]{1,60}$/;
const announcementRef = (a) => (typeof a.importRef === 'string' && SAFE_REF.test(a.importRef) ? a.importRef : String(a._id));
const announcementFolderKey = (a) => `${ANNOUNCEMENTS_TOP_KEY}/${announcementRef(a)}`;

// The announcement's subfolder (and the top folder), created when missing.
// `audit` = { actor, batchId } makes the loader record 'import' rows.
// Returns { folder, created: <number of folders created> }.
const ensureAnnouncementFolder = async (announcement, audit) => {
  const top = await findOrCreateFolder({
    key: ANNOUNCEMENTS_TOP_KEY,
    name: ANNOUNCEMENTS_TOP_NAME,
    description: ANNOUNCEMENTS_TOP_DESCRIPTION,
    parent: null,
    order: topOrder(ANNOUNCEMENTS_TOP_KEY),
  }, audit);
  const day = announcement.announcementDate ? lagosDay(new Date(announcement.announcementDate)) : '';
  const ref = announcementRef(announcement);
  const sub = await findOrCreateFolder({
    key: announcementFolderKey(announcement),
    name: `Announcement ${day || ''} ${ref === String(announcement._id) ? ref.slice(-6) : ref}`.replace(/\s+/g, ' ').trim(),
    description: `Archived copies of investment announcement ${ref}.`,
    ...(announcement.announcementDate && { folderDate: announcement.announcementDate }),
    parent: top.folder._id,
    order: 0,
  }, audit);
  return { folder: sub.folder, created: (top.created ? 1 : 0) + (sub.created ? 1 : 0) };
};

// Which of these interaction ids an announcement of `project` may link:
// interactions of the project, or of its investor (investor-level or on any of
// its projects). Returns { ok: [ObjectId], bad: [raw] } (ok de-duplicated).
const checkSupportingInteractions = async (rawIds, projectDoc) => {
  const ids = [...new Set(rawIds.map(String))];
  const bad = ids.filter((id) => !mongoose.isValidObjectId(id));
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  if (valid.length === 0) return { ok: [], bad };
  const investorId = projectDoc.investor;
  const projectIds = investorId
    ? await InvestmentProject.find({ investor: investorId }).distinct('_id')
    : [projectDoc._id];
  const or = [{ project: projectDoc._id }, { project: { $in: projectIds } }];
  if (investorId) or.push({ investor: investorId });
  const found = await InteractionLog.find({ _id: { $in: valid }, $or: or }).select('_id').lean();
  const okSet = new Set(found.map((l) => String(l._id)));
  return {
    ok: valid.filter((id) => okSet.has(id)).map((id) => new mongoose.Types.ObjectId(id)),
    bad: [...bad, ...valid.filter((id) => !okSet.has(id))],
  };
};

// DLR 4.4 for year Y: announcements with announcementDate in Y (Lagos day) and
// oysipaNamed = true. Projects of Intermediaries / Promotion agents are left
// out. Never counted by createdAt.
// Condition for announcements in the DLR 4.4 scope: not of a project of an
// Intermediary / Promotion agent. Shared with the list filter `counted=1`
// (story 11.15), so the dashboard count and its list agree.
const countedAnnouncementCondition = async () => {
  const excludedInvestors = await Investor.find({ organisationType: { $in: EXCLUDED_ORGANISATION_TYPES } }).distinct('_id');
  const excludedProjects = excludedInvestors.length
    ? await InvestmentProject.find({ investor: { $in: excludedInvestors } }).distinct('_id')
    : [];
  return excludedProjects.length ? { project: { $nin: excludedProjects } } : {};
};

const announcementsMetric = async (year) => {
  const counted = await InvestmentAnnouncement.countDocuments({
    // year null: every year (the 11.9 SABER report for "all").
    ...(year === null ? {} : { announcementDate: yearRange(year) }),
    oysipaNamed: true,
    ...(await countedAnnouncementCondition()),
  });
  return { year, counted, band: announcementBand(counted) };
};

module.exports = {
  ANNOUNCEMENTS_TOP_KEY,
  ANNOUNCEMENTS_TOP_NAME,
  announcementRef,
  announcementFolderKey,
  ensureAnnouncementFolder,
  checkSupportingInteractions,
  announcementsMetric,
  countedAnnouncementCondition,
  // The year range the metric uses (shared with the 11.9 report rows).
  yearRange,
};
