// "Needs attention" rules (story 11.14 metrics.mine, extracted in 11.15).
// One definition of "no contact", "incomplete record", "stale issue" and
// "no SABER code", used by the Staff "My work" counts (services/metrics.js)
// and by the list filters (services/listQueries.js), so a card's count and the
// list it opens cannot drift apart.
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const { LEAD_SOURCES, UNKNOWN_LEAD_SOURCE } = require('../constants/investorFields');
const { NOT_RECORDED, resolveSector } = require('../constants/sectors');
const { countryLabel } = require('../constants/countries');
const { todayLagos } = require('../utils/happenedDate');

const SYSTEM_CATEGORY = 'System Update';
const OPEN_ISSUE_STATUSES = ['Open', 'In progress'];
const NO_CONTACT_DAYS = 60;
const STALE_ISSUE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Happened date of an interaction (else its recorded time), for aggregations.
const happenedExpr = { $ifNull: ['$interactionDate', '$createdAt'] };
// Officer logs: every interaction except the automatic System Update rows.
const OFFICER_LOG = { category: { $ne: SYSTEM_CATEGORY } };
// No SABER code on the log.
const NO_CODE = { $or: [{ serviceCodes: { $exists: false } }, { serviceCodes: { $size: 0 } }] };
// Officer logs without a SABER code ("Without a SABER code"), within `scope`
// (any condition, e.g. interactionScopeFor(ids)).
const untaggedLogFilter = (scope = {}) => ({
  $and: [OFFICER_LOG, NO_CODE, ...(Object.keys(scope).length ? [scope] : [])],
});

// Interactions of these investors: the log's investor, or (for a log of a
// project) the project's investor. Used by "My work" and `officer=` on the
// interactions list.
const interactionScopeFor = async (investorIds) => {
  const projectIds = investorIds.length ? await InvestmentProject.find({ investor: { $in: investorIds } }).distinct('_id') : [];
  return { $or: [{ investor: { $in: investorIds } }, ...(projectIds.length ? [{ project: { $in: projectIds } }] : [])] };
};

const hasValue = (p) => typeof p.estimatedValue === 'number' && p.estimatedValue > 0;

// Whole days from `date` to the start of `today` (YYYY-MM-DD, Lagos).
const daysAgo = (date, today) => Math.floor((Date.parse(`${today}T00:00:00Z`) - new Date(date).getTime()) / DAY_MS);

// Investor id → time of its latest officer log (happened date, else recorded).
// A log counts for its stored investor, or — a project-only log with no
// investor stored — for its project's investor. `investorIds` limits the
// result (null: every investor). The ONE last-contact rule for the "No
// contact" card and the `noContactDays` list filter, in every scope.
const lastContactByInvestor = async (investorIds = null) => {
  const [byInvestor, byProject] = await Promise.all([
    InteractionLog.aggregate([
      { $match: { ...OFFICER_LOG, investor: investorIds ? { $in: investorIds } : { $ne: null } } },
      { $group: { _id: '$investor', last: { $max: happenedExpr } } },
    ]),
    InteractionLog.aggregate([
      { $match: { ...OFFICER_LOG, investor: null, project: { $ne: null } } },
      { $group: { _id: '$project', last: { $max: happenedExpr } } },
    ]),
  ]);
  const map = new Map();
  const keep = investorIds ? new Set(investorIds.map(String)) : null;
  const put = (investor, last) => {
    if (!investor) return;
    const k = String(investor);
    if (keep && !keep.has(k)) return;
    const t = new Date(last).getTime();
    if (!map.has(k) || map.get(k) < t) map.set(k, t);
  };
  byInvestor.forEach((r) => put(r._id, r.last));
  if (byProject.length) {
    const projects = await InvestmentProject.find({ _id: { $in: byProject.map((r) => r._id) } }).select('investor').lean();
    const investorOf = new Map(projects.map((p) => [String(p._id), p.investor]));
    byProject.forEach((r) => put(investorOf.get(String(r._id)), r.last));
  }
  return map;
};

// Never contacted, or the last officer log is `days` or more days old.
const isNoContact = (last, today, days = NO_CONTACT_DAYS) => last === undefined || daysAgo(last, today) >= days;

const noContactRecords = (records, lastContact, today, days = NO_CONTACT_DAYS) => records
  .filter((r) => isNoContact(lastContact.get(String(r._id)), today, days));

const MISSING_REASONS = ['sector', 'country', 'leadSource', 'firstContactDate', 'projectValue'];

// Which T1–T11 gaps a record has. `projectsWithoutValue`: how many of its
// projects have no value.
const recordGaps = (r, projectsWithoutValue = 0) => ({
  sector: resolveSector(r.sector).sector === NOT_RECORDED,
  country: countryLabel(r.countryOfOrigin) === NOT_RECORDED,
  leadSource: !LEAD_SOURCES.includes(r.leadSource) || r.leadSource === UNKNOWN_LEAD_SOURCE,
  firstContactDate: !r.firstContactDate,
  projectValue: projectsWithoutValue > 0,
});

// Records missing T1–T11 data, with the count per reason.
const missingFieldRecords = (records, projects) => {
  const withoutValue = new Map();
  projects.filter((p) => !hasValue(p)).forEach((p) => {
    const k = String(p.investor);
    withoutValue.set(k, (withoutValue.get(k) || 0) + 1);
  });
  const reasons = Object.fromEntries(MISSING_REASONS.map((k) => [k, 0]));
  const list = records.filter((r) => {
    const gaps = recordGaps(r, withoutValue.get(String(r._id)) || 0);
    Object.entries(gaps).forEach(([k, v]) => { if (v) reasons[k] += 1; });
    return Object.values(gaps).some(Boolean);
  });
  return { records: list, reasons };
};

// An open issue whose last action (else date reported, else registered) is
// more than 14 days old. An unreadable date counts as stale (it needs a look).
const isStaleIssue = (issue, today) => {
  if (!OPEN_ISSUE_STATUSES.includes(issue.status)) return false;
  const dates = (issue.actions || []).map((a) => a.date).filter(Boolean).map((d) => new Date(d).getTime());
  const last = dates.length ? Math.max(...dates) : new Date(issue.dateReported || issue.dateRegistered).getTime();
  const age = daysAgo(last, today);
  return !Number.isFinite(age) || age > STALE_ISSUE_DAYS;
};

const ISSUE_FIELDS = 'investor status dateReported dateRegistered actions.date';
const RECORD_FIELDS = 'sector countryOfOrigin leadSource firstContactDate';

// ---------- list filters (ids matching a rule) ----------

// Investors (within `candidateFilter`) with no officer log in `days` days.
const noContactInvestorIds = async ({ candidateFilter = {}, days = NO_CONTACT_DAYS, today = todayLagos() } = {}) => {
  const records = await Investor.find(candidateFilter).select('_id').lean();
  const lastContact = await lastContactByInvestor(records.map((r) => r._id));
  return noContactRecords(records, lastContact, today, days).map((r) => r._id);
};

// Investors (within `candidateFilter`) missing T1–T11 data.
const incompleteInvestorIds = async ({ candidateFilter = {} } = {}) => {
  const records = await Investor.find(candidateFilter).select(RECORD_FIELDS).lean();
  const projects = await InvestmentProject.find({ investor: { $in: records.map((r) => r._id) } })
    .select('investor estimatedValue').lean();
  return missingFieldRecords(records, projects).records.map((r) => r._id);
};

// Stale open issues (within `candidateFilter`).
const staleIssueIds = async ({ candidateFilter = {}, today = todayLagos() } = {}) => {
  const issues = await InvestorIssue.find({ ...candidateFilter, status: { $in: OPEN_ISSUE_STATUSES } })
    .select(ISSUE_FIELDS).lean();
  return issues.filter((i) => isStaleIssue(i, today)).map((i) => i._id);
};

module.exports = {
  SYSTEM_CATEGORY,
  OPEN_ISSUE_STATUSES,
  NO_CONTACT_DAYS,
  STALE_ISSUE_DAYS,
  happenedExpr,
  OFFICER_LOG,
  NO_CODE,
  untaggedLogFilter,
  interactionScopeFor,
  hasValue,
  daysAgo,
  lastContactByInvestor,
  isNoContact,
  noContactRecords,
  recordGaps,
  missingFieldRecords,
  isStaleIssue,
  ISSUE_FIELDS,
  noContactInvestorIds,
  incompleteInvestorIds,
  staleIssueIds,
};
