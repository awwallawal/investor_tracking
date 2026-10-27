// CSV export of a list view (story 11.15). GET /api/export/:list?<the list's
// own filters>. The rows come from the same builder as the list
// (services/listQueries.js), so the file holds exactly the rows on screen.
//
// - Every role exports what it can list (contact details included, owner
//   decision); the change log is DG / Portal-Admin only.
// - Row 1 names the filters, row 2 the columns. Dates are ISO; values carry a
//   currency column.
// - More than limits.maxRows rows → 400 "narrow the filters", nothing written.
// - Each export writes a ChangeLog `export` row FIRST (entity = the list's
//   entity, snapshot { list, filters, rowCount }); if that fails → 500, no file.
const mongoose = require('mongoose');
const ChangeLog = require('../models/ChangeLog');
const { RUNNERS, BUILDERS, MODELS } = require('../services/listQueries');
const { changeLogFilter, publicRow } = require('./changeLogController');
const { recordChanges } = require('../utils/recordDeletion');
const { isAdminRole } = require('../middleware/accessHelpers');
const {
  toCsv, isoDay, isoTime, lagosIsoDay,
} = require('../services/csv');
const { todayLagos } = require('../utils/happenedDate');
const { DEFAULT_ORGANISATION_TYPE, DEFAULT_CURRENCY } = require('../constants/investorFields');

// Mutable so tests can lower the cap instead of inserting 5,001 records.
const limits = { maxRows: 5000 };

// ChangeLog entityId of every export row of a list: a fixed sentinel per list
// (an export is not one record), so the viewer can filter "exports of the
// investor list" by record id. Never the id of a real document.
const EXPORT_ENTITY_IDS = {
  investors: '0000000000000000000e0001',
  projects: '0000000000000000000e0002',
  interactions: '0000000000000000000e0003',
  issues: '0000000000000000000e0004',
  announcements: '0000000000000000000e0005',
  evidence: '0000000000000000000e0006',
  changelog: '0000000000000000000e0007',
};

const ENTITY = {
  investors: 'Investor',
  projects: 'InvestmentProject',
  interactions: 'InteractionLog',
  issues: 'InvestorIssue',
  announcements: 'InvestmentAnnouncement',
  evidence: 'EvidenceFile',
  changelog: 'ChangeLog',
};

const name = (ref, field) => (ref && typeof ref === 'object' ? ref[field] || '' : '');
const joined = (list) => (Array.isArray(list) ? list.filter(Boolean).join('; ') : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : '');

// [header, value(row)] per list.
const COLUMNS = {
  investors: [
    ['Name', (r) => r.investorName],
    ['Organisation type', (r) => r.organisationType || DEFAULT_ORGANISATION_TYPE],
    ['Sector', (r) => r.sector],
    ['Sector detail', (r) => r.sectorDetail],
    ['Country', (r) => r.countryOfOrigin],
    ['Country detail', (r) => r.countryDetail],
    ['Lead source', (r) => r.leadSource],
    ['Lead source detail', (r) => r.leadSourceDetail],
    ['First contact date', (r) => isoDay(r.firstContactDate)],
    ['Assigned officer', (r) => name(r.assignedTo, 'name')],
    ['Key contact person', (r) => r.keyContactPerson],
    ['Email', (r) => r.email],
    ['Phone', (r) => r.phoneNumber],
    ['Website', (r) => r.website],
    ['Head office', (r) => r.headOffice],
    ['Company registration', (r) => r.companyRegistrationInfo],
    ['Recorded', (r) => isoTime(r.createdAt)],
    ['Record id', (r) => String(r._id)],
  ],
  projects: [
    ['Title', (r) => r.projectTitle],
    ['Investor', (r) => name(r.investor, 'investorName')],
    ['Sector', (r) => r.sector],
    ['Lifecycle status', (r) => name(r.lifecycleStatus, 'name')],
    ['Currency', (r) => r.currency || DEFAULT_CURRENCY],
    ['Estimated value', (r) => num(r.estimatedValue)],
    ['Estimated jobs', (r) => num(r.estimatedNumberOfJobs)],
    ['Location', (r) => r.location],
    ['Date registered', (r) => isoDay(r.dateRegistered)],
    ['Recorded', (r) => isoTime(r.createdAt)],
    ['Record id', (r) => String(r._id)],
  ],
  interactions: [
    // Happened date; an old log without one shows its recorded Lagos day.
    ['Date', (r) => (r.interactionDate ? isoDay(r.interactionDate) : lagosIsoDay(r.createdAt))],
    ['Recorded', (r) => isoTime(r.createdAt)],
    ['Investor', (r) => name(r.investor, 'investorName')],
    ['Project', (r) => name(r.project, 'projectTitle')],
    ['Category', (r) => r.category],
    ['SABER codes', (r) => joined(r.serviceCodes)],
    ['Credit linkage', (r) => (r.creditLinkage ? 'yes' : 'no')],
    ['Description', (r) => r.description],
    ['Logged by', (r) => name(r.loggedBy, 'name')],
    ['Record id', (r) => String(r._id)],
  ],
  issues: [
    ['Reference', (r) => r.reference || r.importRef],
    ['Date reported', (r) => isoDay(r.dateReported)],
    ['Investor', (r) => name(r.investor, 'investorName')],
    ['Project', (r) => name(r.project, 'projectTitle') || r.projectText],
    ['Category', (r) => r.category],
    ['MDA responsible', (r) => joined(r.mdaResponsible)],
    ['Reported via', (r) => r.reportedVia],
    ['Status', (r) => r.status],
    ['Description', (r) => r.description],
    ['Resolution', (r) => r.resolution],
    ['Resolved date', (r) => isoDay(r.resolvedDate)],
    ['Date registered', (r) => isoTime(r.dateRegistered)],
    ['Record id', (r) => String(r._id)],
  ],
  announcements: [
    ['Date', (r) => isoDay(r.announcementDate)],
    ['Outlet', (r) => r.outlet],
    ['Project', (r) => name(r.project, 'projectTitle')],
    ['Investor', (r) => (r.project && r.project.investor ? name(r.project.investor, 'investorName') : '')],
    ['OYSIPA named', (r) => (r.oysipaNamed ? 'yes' : 'no')],
    ['OYSIPA role', (r) => r.oysipaRoleText],
    ['Link', (r) => r.url],
    ['Archived copy', (r) => r.archivedCopyUrl],
    ['Recorded', (r) => isoTime(r.createdAt)],
    ['Record id', (r) => String(r._id)],
  ],
  evidence: [
    ['File name', (r) => r.fileName],
    ['Folder', (r) => name(r.folder, 'name')],
    ['Document date', (r) => isoDay(r.documentDate)],
    ['Uploaded', (r) => isoTime(r.uploadedAt)],
    ['Type', (r) => r.mimeType],
    ['Size (bytes)', (r) => num(r.size)],
    ['What', (r) => r.what],
    ['Tagged to', (r) => joined((r.links || []).map((l) => name(l.investor, 'investorName')))],
    ['Untagged', (r) => ((r.links || []).length ? 'no' : 'yes')],
    ['Record id', (r) => String(r._id)],
  ],
  changelog: [
    ['Time', (r) => isoTime(r.createdAt)],
    ['By', (r) => r.byName],
    ['Role', (r) => r.role],
    ['Entity', (r) => r.entity],
    ['Record id', (r) => String(r.entityId)],
    ['Action', (r) => r.action],
    ['Reason', (r) => r.reason],
    ['Changed fields', (r) => joined((r.changes || []).map((c) => c.field))],
    ['Batch id', (r) => r.batchId],
  ],
};

const filtersLine = (applied) => {
  const parts = Object.entries(applied).map(([k, v]) => `${k}=${v}`);
  return `Filters: ${parts.length ? parts.join('; ') : 'none'}`;
};

const tooMany = (n) => `This view has ${n.toLocaleString('en-GB')} rows; exports are limited to ${limits.maxRows.toLocaleString('en-GB')}. Narrow the filters.`;

const CHANGE_LOG_PARAMS = ['entity', 'action', 'entityId', 'by', 'batchId', 'from', 'to'];

// The change log view: its own filters (400 on a bad one, as the viewer), newest first.
const changeLogRows = async (query) => {
  const built = changeLogFilter(query);
  if (built.error) return { error: built.error };
  const applied = {};
  CHANGE_LOG_PARAMS.forEach((k) => {
    if (typeof query[k] === 'string' && query[k]) applied[k] = query[k];
  });
  const count = await ChangeLog.countDocuments(built.filter);
  if (count > limits.maxRows) return { count, applied };
  const rows = await ChangeLog.find(built.filter).select('-snapshot').sort({ createdAt: -1, _id: -1 }).lean();
  return { docs: rows.map(publicRow), applied };
};

exports.exportList = async (req, res) => {
  try {
    const { list } = req.params;
    if (!Object.prototype.hasOwnProperty.call(COLUMNS, list)) return res.status(404).json({ message: 'Unknown list.' });
    if (list === 'changelog' && !isAdminRole(req.user.role)) {
      return res.status(403).json({ msg: 'Forbidden: You do not have access to this resource' });
    }
    const query = req.query || {};
    let result;
    if (list === 'changelog') {
      result = await changeLogRows(query);
      if (result.error) return res.status(400).json({ message: result.error });
      if (result.count !== undefined) return res.status(400).json({ message: tooMany(result.count), rowCount: result.count });
    } else {
      const ctx = { user: req.user };
      // Count first: nothing is loaded for a view over the cap.
      const built = await BUILDERS[list](query, ctx);
      const count = built.empty ? 0 : await MODELS[list].countDocuments(built.filter);
      if (count > limits.maxRows) return res.status(400).json({ message: tooMany(count), rowCount: count });
      const options = { built };
      if (list === 'investors') options.populate = true;
      if (list === 'interactions') options.evidence = false;
      if (list === 'evidence') options.withFolder = true;
      result = await RUNNERS[list](query, ctx, options);
    }
    const docs = result.docs.map((d) => (d && typeof d.toJSON === 'function' ? d.toJSON() : d));
    if (docs.length > limits.maxRows) return res.status(400).json({ message: tooMany(docs.length), rowCount: docs.length });

    const filters = { ...result.applied };
    try {
      await recordChanges(req, 'export', [[ENTITY[list], [{
        _id: new mongoose.Types.ObjectId(EXPORT_ENTITY_IDS[list]), list, filters, rowCount: docs.length,
      }]]]);
    } catch (auditError) {
      console.error('ChangeLog write failed; export refused:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was exported.' });
    }

    const columns = COLUMNS[list];
    const csv = toCsv([
      [filtersLine(filters)],
      columns.map(([header]) => header),
      ...docs.map((d) => columns.map(([, value]) => value(d))),
    ]);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="oysipa-${list}-${todayLagos()}.csv"`);
    res.set('X-Row-Count', String(docs.length));
    return res.status(200).send(csv);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

exports.limits = limits;
exports.COLUMNS = COLUMNS;
exports.ENTITY = ENTITY;
exports.EXPORT_ENTITY_IDS = EXPORT_ENTITY_IDS;
