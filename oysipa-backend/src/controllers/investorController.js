const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const { investorSearchFilter } = require('../services/investorSearch');
const { recordActionGroups } = require('../utils/recordDeletion');
const { parseHappenedDate, stripTimestamps } = require('../utils/happenedDate');
const { isAdminRole } = require('../middleware/accessHelpers');
const { findLinksTo, unlinkSnapshots, pullLinks } = require('../services/evidenceLibrary');
const {
  LEAD_SOURCES, UNKNOWN_LEAD_SOURCE, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE, INVESTOR_COUNT_FILTER,
} = require('../constants/investorFields');

// Validates body.firstContactDate in place. On create an empty value becomes
// today; on update an empty value leaves the stored date alone.
// Returns an error message or null.
const applyFirstContactDate = (body, { isCreate }) => {
  const parsed = parseHappenedDate(body.firstContactDate, { label: 'First contact date' });
  if (parsed.error) return parsed.error;
  if (parsed.value !== undefined) {
    body.firstContactDate = parsed.value;
  } else if (isCreate) {
    body.firstContactDate = new Date();
  } else {
    delete body.firstContactDate;
  }
  return null;
};

// An empty or whitespace-only email means "no email": never stored as ''
// (email is unique + sparse, so two '' values would clash). On create the key
// is removed; on update it is $unset.
const isBlankEmail = (v) => v === null || (typeof v === 'string' && v.trim() === '');

// Server-owned import stamps are never taken from the client.
const stripServerFields = (body) => {
  delete body.importBatchId;
  delete body.importTags;
  return body;
};

// Mongo duplicate key (11000) → a clear message naming the field.
const duplicateMessage = (error) => {
  const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
  if (field === 'email') return 'Another investor already uses this email address.';
  if (field === 'investorName') return 'An investor with this name already exists.';
  return 'This investor duplicates an existing record.';
};

const sendWriteError = (res, error) => {
  if (error && error.code === 11000) {
    return res.status(400).json({ message: duplicateMessage(error) });
  }
  return res.status(400).json({ error: error.message });
};

// Validates body.referredBy in place: empty → removed (or null on update);
// otherwise it must be an Intermediary record. Returns an error message or null.
// An unchanged value on update (the edit form re-sends it) is not re-checked.
const applyReferredBy = async (body, { isCreate, investorId }) => {
  if (!('referredBy' in body)) return null;
  const raw = body.referredBy && typeof body.referredBy === 'object' ? body.referredBy._id : body.referredBy;
  if (raw === undefined || raw === null || raw === '') {
    if (isCreate) delete body.referredBy;
    else body.referredBy = null;
    return null;
  }
  if (!mongoose.isValidObjectId(raw)) return '"Referred by" must be an Intermediary record.';
  if (!isCreate && mongoose.isValidObjectId(investorId)) {
    const current = await Investor.findById(investorId).select('referredBy').lean();
    if (current && current.referredBy && String(current.referredBy) === String(raw)) {
      body.referredBy = raw;
      return null;
    }
  }
  const referrer = await Investor.findById(raw).select('organisationType').lean();
  if (!referrer || referrer.organisationType !== 'Intermediary') {
    return '"Referred by" must be an Intermediary record.';
  }
  body.referredBy = raw;
  return null;
};

exports.createInvestor = async (req, res) => {
  try {
    // createdAt/updatedAt are server-set; client values are ignored.
    const body = stripServerFields(stripTimestamps({ ...(req.body || {}) }));

    // T11: lead source is required on new records; "Unknown (pre-T11)" is only
    // for records that existed before T11 (set by the migration).
    if (!body.leadSource) {
      return res.status(400).json({ message: 'Lead source is required.' });
    }
    if (body.leadSource === UNKNOWN_LEAD_SOURCE) {
      return res.status(400).json({ message: `"${UNKNOWN_LEAD_SOURCE}" cannot be chosen for a new investor.` });
    }
    if (!LEAD_SOURCES.includes(body.leadSource)) {
      return res.status(400).json({ message: 'Invalid lead source.' });
    }
    if (body.leadSource !== 'Intermediary referral') delete body.referredBy;
    const referredError = await applyReferredBy(body, { isCreate: true });
    if (referredError) return res.status(400).json({ message: referredError });

    const dateError = applyFirstContactDate(body, { isCreate: true });
    if (dateError) return res.status(400).json({ message: dateError });
    if ('email' in body && isBlankEmail(body.email)) delete body.email;
    const investor = await Investor.create(body);
    return res.status(201).json(investor);
  } catch (error) {
    return sendWriteError(res, error);
  }
};

// GET /api/investors?leadSource=&organisationType=&q=
// organisationType=Investor also matches old records with no type set.
// q: search (see services/investorSearch.js), ANDed with the filters.
// The response stays an array; X-Total-Count holds the unfiltered total.
exports.getAllInvestors = async (req, res) => {
    try {
        const filter = {};
        const { leadSource, organisationType } = req.query || {};
        if (typeof leadSource === 'string' && leadSource) {
            if (!LEAD_SOURCES.includes(leadSource)) return res.status(400).json({ message: 'Invalid lead source filter.' });
            filter.leadSource = leadSource === UNKNOWN_LEAD_SOURCE ? { $in: [UNKNOWN_LEAD_SOURCE, null] } : leadSource;
        }
        if (typeof organisationType === 'string' && organisationType) {
            if (!ORGANISATION_TYPES.includes(organisationType)) return res.status(400).json({ message: 'Invalid organisation type filter.' });
            filter.organisationType = organisationType === DEFAULT_ORGANISATION_TYPE
                ? INVESTOR_COUNT_FILTER.organisationType
                : organisationType;
        }
        const { q } = req.query || {};
        if (q !== undefined && typeof q !== 'string') return res.status(400).json({ message: 'Invalid search.' });
        const search = q ? await investorSearchFilter(q) : null;
        // A query with nothing searchable left (e.g. "!!!") matches nothing.
        if (q && !search) {
            res.set('X-Total-Count', String(await Investor.countDocuments({})));
            return res.send([]);
        }
        const query = search ? { $and: [filter, search] } : filter;
        const [investors, total] = await Promise.all([Investor.find(query), Investor.countDocuments({})]);
        res.set('X-Total-Count', String(total));
        res.send(investors);
    } catch (error) {
        res.status(500).send(error);
    }
};

exports.getInvestorById = async (req, res) => {
    try {
        const investor = await Investor.findById(req.params.id)
          .populate('assignedTo', 'name')
          .populate('referredBy', 'investorName organisationType');
        if (!investor) {
            return res.status(404).send();
        }
        res.send(investor);
    } catch (error) {
        res.status(500).send(error);
    }
};

exports.updateInvestor = async (req, res) => {
    try {
        // createdAt/updatedAt are server-set; client values are ignored.
        const body = stripServerFields(stripTimestamps({ ...(req.body || {}) }));
        // T11: lead source is fixed after create; only DG/Admin can correct it.
        // referredBy is part of the lead source: locked the same way.
        if (!isAdminRole(req.user && req.user.role)) {
          delete body.leadSource;
          delete body.referredBy;
        }
        // referredBy only belongs with "Intermediary referral": cleared when the
        // resulting lead source is anything else.
        let current = null;
        if (mongoose.isValidObjectId(req.params.id)) {
          current = await Investor.findById(req.params.id).select('leadSource referredBy').lean();
        }
        const resultingLead = body.leadSource !== undefined ? body.leadSource : current && current.leadSource;
        if (resultingLead !== 'Intermediary referral' && ('referredBy' in body || (current && current.referredBy))) {
          body.referredBy = null;
        }
        const referredError = await applyReferredBy(body, { isCreate: false, investorId: req.params.id });
        if (referredError) return res.status(400).json({ message: referredError });
        const dateError = applyFirstContactDate(body, { isCreate: false });
        if (dateError) return res.status(400).json({ message: dateError });
        let update = body;
        if ('email' in body && isBlankEmail(body.email)) {
          update = { ...body, $unset: { email: 1 } };
          delete update.email;
        }
        const investor = await Investor.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!investor) {
            return res.status(404).json({ error: 'Investor not found' });
        }
        return res.json(investor);
    } catch (error) {
        return sendWriteError(res, error);
    }
};

// @desc    Delete an investor, its projects and every related interaction.
//          Every document is written to the ChangeLog first; if that fails,
//          nothing is deleted. No transaction (the target MongoDB may be standalone).
// @route   DELETE /api/investors/:id
// @access  Private (Director-General, Portal-Admin)
exports.deleteInvestor = async (req, res) => {
  try {
    const { id } = req.params;
    const investor = mongoose.isValidObjectId(id) && await Investor.findById(id).lean();
    if (!investor) {
      return res.status(404).json({ message: 'Investor not found.' });
    }

    const { reason } = req.body || {};
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ message: 'A reason is required to delete an investor.' });
    }

    const projects = await InvestmentProject.find({ investor: id }).lean();
    const projectIds = projects.map((p) => p._id);
    const logs = await InteractionLog.find({
      $or: [{ investor: id }, { project: { $in: projectIds } }],
    }).lean();

    // The investor's issues (story 11.7) go too.
    const issues = await InvestorIssue.find({ investor: id }).lean();
    // And the announcements of its projects (story 11.8).
    const announcements = projectIds.length ? await InvestmentAnnouncement.find({ project: { $in: projectIds } }).lean() : [];

    // Evidence library links to the investor, its interactions or its issues
    // are removed (audited, same batch); the files stay in the library.
    const links = await findLinksTo({
      investorIds: [investor._id],
      interactionIds: logs.map((l) => l._id),
      issueIds: issues.map((i) => i._id),
      announcementIds: announcements.map((a) => a._id),
    });

    try {
      // Delete and unlink rows in one insert: all are written or none.
      await recordActionGroups(req, [
        ['delete', 'Investor', [investor]],
        ['delete', 'InvestmentProject', projects],
        ['delete', 'InteractionLog', logs],
        ['delete', 'InvestorIssue', issues],
        ['delete', 'InvestmentAnnouncement', announcements],
        ['unlink', 'EvidenceFile', unlinkSnapshots(links)],
      ], { reason: trimmed });
    } catch (auditError) {
      console.error('ChangeLog write failed; investor delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }

    // Delete exactly the documents (and links) that were audited.
    await pullLinks(links);
    await InvestorIssue.deleteMany({ _id: { $in: issues.map((i) => i._id) } });
    await InvestmentAnnouncement.deleteMany({ _id: { $in: announcements.map((a) => a._id) } });
    // Deleted interactions leave the supporting lists of any other announcement.
    if (logs.length > 0) {
      await InvestmentAnnouncement.updateMany(
        { supportingInteractions: { $in: logs.map((l) => l._id) } },
        { $pull: { supportingInteractions: { $in: logs.map((l) => l._id) } } },
      );
    }
    await InteractionLog.deleteMany({ _id: { $in: logs.map((l) => l._id) } });
    await InvestmentProject.deleteMany({ _id: { $in: projectIds } });
    await Investor.deleteOne({ _id: id });

    return res.status(200).json({
      deleted: {
        investors: 1,
        projects: projects.length,
        interactions: logs.length,
        ...(issues.length > 0 && { issues: issues.length }),
        ...(announcements.length > 0 && { announcements: announcements.length }),
        ...(links.length > 0 && { evidenceLinks: links.length }),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
