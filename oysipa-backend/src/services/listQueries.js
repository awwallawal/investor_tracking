// Shared list filters and sorts (story 11.15). One builder per list, used by
// the list endpoints, the CSV export (/api/export/:list) and the global search
// (/api/search), so an export holds exactly the rows the list shows.
//
// Query rules (spec 11.15):
// - multi-values: a repeated parameter (`?country=A&country=B`, each value
//   taken whole) or one comma-separated value (split on commas unless the whole
//   value is itself a known value, e.g. "Korea, Republic of"); at most 50 values;
// - a value not on the list, or malformed (bad year, id, date...), is ignored;
//   when every value of a parameter is ignored the parameter is ignored;
// - flags are `1` or `true`; `from` / `to` are inclusive YYYY-MM-DD days;
// - `sort=<key>` ascending, `sort=-<key>` descending; an unknown key is ignored;
// - `q` uses the investor search normalisation (services/investorSearch.js);
//   the first value only, cut to 200 characters;
// - happened dates are the Lagos day at 00:00Z; a recorded-time fallback
//   (createdAt, uploadedAt) is matched on the Lagos calendar day.
//
// build*(query, ctx) → { filter, empty, applied, sort }: `applied` holds the
// values actually used (export header and audit row); `empty` means "matches
// nothing" (e.g. a q with nothing searchable left).
const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const EvidenceFolder = require('../models/EvidenceFolder');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const { searchPattern, investorSearchFilter } = require('./investorSearch');
const { sectorCondition, countryCondition, canonicalSector } = require('./recordFilters');
const { yearRange } = require('./issueRegister');
const { withEvidenceFiles } = require('./evidenceLibrary');
const attention = require('./attention');
const {
  LEAD_SOURCES, UNKNOWN_LEAD_SOURCE, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE, CURRENCIES, DEFAULT_CURRENCY,
} = require('../constants/investorFields');
const { SERVICE_CODES } = require('../constants/serviceCodes');
const { ISSUE_STATUSES, ISSUE_CATEGORIES } = require('../constants/issueFields');
const { MDA_CODES } = require('../constants/mdas');
const { todayLagos } = require('../utils/happenedDate');
const { SECTOR_VALUES, NOT_RECORDED } = require('../constants/sectors');
const { countedAnnouncementCondition } = require('./announcementRegister');

const SECTOR_LIST = [...SECTOR_VALUES, NOT_RECORDED];

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VALUE = 200;
const MAX_NO_CONTACT_DAYS = 3650;

// ---------- parameter parsing ----------

const MAX_VALUES = 50;
const MAX_Q = 200;
const keyOf = (v) => String(v).replace(/\s+/g, ' ').trim().toLowerCase();

// Values of a multi-value parameter. Repeated → each value whole; a single
// value → split on commas unless the whole value is in `known`. Trimmed, empty
// and over-long ones dropped, de-duplicated, at most MAX_VALUES.
const listParam = (raw, known = []) => {
  const values = (Array.isArray(raw) ? raw : [raw]).filter((v) => typeof v === 'string');
  let parts;
  if (values.length > 1) {
    parts = values;
  } else if (values.length === 1) {
    const knownKeys = new Set(known.map(keyOf));
    parts = knownKeys.has(keyOf(values[0])) ? values : values[0].split(',');
  } else {
    parts = [];
  }
  const out = [...new Set(parts.map((v) => v.trim()).filter((v) => v && v.length <= MAX_VALUE))];
  return out.slice(0, MAX_VALUES);
};
// A single value with a comma needs the known values to decide how to split it.
const hasComma = (raw) => typeof raw === 'string' && raw.includes(',');
const knownWhenNeeded = async (raw, load) => (hasComma(raw) ? load() : []);

const firstParam = (raw) => (Array.isArray(raw) ? raw[0] : raw);
const flag = (raw) => {
  const v = firstParam(raw);
  return v === '1' || v === 'true';
};
// Case-insensitive pick from a fixed list (returns the list's spelling).
const pick = (raw, values) => listParam(raw, values)
  .map((v) => values.find((x) => keyOf(x) === keyOf(v)))
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i);
const ids = (raw) => listParam(raw).filter((v) => mongoose.isValidObjectId(v) && /^[0-9a-fA-F]{24}$/.test(v));
const yearsOf = (raw) => listParam(raw).filter((v) => /^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= 2100).map(Number);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (raw) => {
  const v = firstParam(raw);
  if (typeof v !== 'string' || !DAY_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};
const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
// Start of a Lagos calendar day (UTC+1, no daylight saving), as for the change log.
const lagosStart = (day) => new Date(`${day}T00:00:00.000+01:00`);
// Inclusive days from / to → { utc, lagos, label }: `utc` for happened dates
// (stored as the day at 00:00Z), `lagos` for recorded-time fallbacks. null
// when neither day is valid, or from is after to (ignored).
const dayRange = (fromRaw, toRaw) => {
  const from = validDay(fromRaw);
  const to = validDay(toRaw);
  if (!from && !to) return null;
  if (from && to && from > to) return null;
  const utc = {};
  const lagos = {};
  if (from) { utc.$gte = new Date(`${from}T00:00:00.000Z`); lagos.$gte = lagosStart(from); }
  if (to) { utc.$lt = new Date(`${nextDay(to)}T00:00:00.000Z`); lagos.$lt = lagosStart(nextDay(to)); }
  return { utc, lagos, label: `${from || ''}..${to || ''}` };
};
const yearRanges = (y) => ({ utc: yearRange(y), lagos: { $gte: lagosStart(`${y}-01-01`), $lt: lagosStart(`${y + 1}-01-01`) } });
const sortOf = (raw, keys) => {
  const v = firstParam(raw);
  if (typeof v !== 'string' || !v) return null;
  const desc = v.startsWith('-');
  const key = desc ? v.slice(1) : v;
  return keys.includes(key) ? { key, direction: desc ? 'desc' : 'asc' } : null;
};
const sortLabel = (s) => (s ? `${s.direction === 'desc' ? '-' : ''}${s.key}` : null);

const regexFor = (q) => {
  const source = searchPattern(q);
  return source ? new RegExp(source, 'i') : null;
};
const qText = (raw) => {
  const v = firstParam(raw);
  return typeof v === 'string' ? v.trim().slice(0, MAX_Q).trim() : '';
};

// Investor ids for officer = me / unassigned / user ids.
const officerCondition = (raw, user) => {
  const values = listParam(raw);
  const userIds = [];
  let unassigned = false;
  const applied = [];
  values.forEach((v) => {
    if (v === 'me') {
      if (user && user._id) { userIds.push(user._id); applied.push('me'); }
    } else if (v === 'unassigned') {
      unassigned = true; applied.push('unassigned');
    } else if (mongoose.isValidObjectId(v) && /^[0-9a-fA-F]{24}$/.test(v)) {
      userIds.push(new mongoose.Types.ObjectId(v)); applied.push(v);
    }
  });
  if (!applied.length) return null;
  const or = [];
  if (userIds.length) or.push({ assignedTo: { $in: userIds } });
  if (unassigned) or.push({ assignedTo: null });
  return { condition: or.length === 1 ? or[0] : { $or: or }, applied };
};

const userIdsOf = (raw, user) => {
  const out = [];
  const applied = [];
  listParam(raw).forEach((v) => {
    if (v === 'me' && user && user._id) { out.push(user._id); applied.push('me'); } else if (/^[0-9a-fA-F]{24}$/.test(v)) { out.push(new mongoose.Types.ObjectId(v)); applied.push(v); }
  });
  return { ids: out, applied };
};

// Lifecycle statuses by name (case-insensitive) → { ids, names }.
// `asked`: the values given; when some are given but none is a status the
// filter matches nothing (as before 11.15).
const statusesNamed = async (raw) => {
  const statuses = await LifecycleStatus.find({}).select('name').lean();
  const asked = listParam(raw, statuses.map((st) => st.name));
  const wanted = asked.map(keyOf);
  const found = statuses.filter((st) => wanted.includes(keyOf(st.name)));
  return { ids: found.map((st) => st._id), names: found.map((st) => st.name), asked };
};

const organisationTypeCondition = (types) => ({
  organisationType: { $in: types.includes(DEFAULT_ORGANISATION_TYPE) ? [...types, null] : types },
});

// Happened date (field, else the recorded `fallback` on the Lagos day) in one
// of the ranges ({ utc, lagos }).
const happenedIn = (field, fallback, ranges) => ({
  $or: ranges.flatMap((r) => [{ [field]: r.utc }, { [field]: null, [fallback]: r.lagos }]),
});

const combine = (conditions) => {
  const list = conditions.filter(Boolean);
  if (!list.length) return {};
  return list.length === 1 ? list[0] : { $and: list };
};

// Builder helper: collects conditions and applied values.
const builder = () => {
  const conditions = [];
  const applied = {};
  return {
    conditions,
    applied,
    add(name, values, condition) {
      if (condition === null || condition === undefined) return;
      conditions.push(condition);
      applied[name] = Array.isArray(values) ? values.join(',') : String(values);
    },
  };
};

const ctxUser = (ctx) => (ctx && ctx.user) || null;
const ctxToday = (ctx) => (ctx && ctx.today) || todayLagos();

// ---------- investors ----------

const INVESTOR_SORTS = {
  name: 'investorName', sector: 'sector', country: 'countryOfOrigin', firstContact: 'firstContactDate',
};

const buildInvestors = async (query = {}, ctx = {}) => {
  const b = builder();
  let empty = false;

  const leadSources = pick(query.leadSource, LEAD_SOURCES);
  if (leadSources.length) {
    // "Unknown (pre-T11)" = anything that is not another known source (none
    // set, or a value off the list): the analytics grouping.
    const known = leadSources.filter((v) => v !== UNKNOWN_LEAD_SOURCE);
    const or = [];
    if (known.length) or.push({ leadSource: { $in: known } });
    if (leadSources.includes(UNKNOWN_LEAD_SOURCE)) or.push({ leadSource: { $nin: LEAD_SOURCES.filter((v) => v !== UNKNOWN_LEAD_SOURCE) } });
    b.add('leadSource', leadSources, or.length === 1 ? or[0] : { $or: or });
  }
  const types = pick(query.organisationType, ORGANISATION_TYPES);
  if (types.length) b.add('organisationType', types, organisationTypeCondition(types));

  const sectors = listParam(query.sector, SECTOR_LIST).map(canonicalSector).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (sectors.length) {
    const conds = await Promise.all(sectors.map((s) => sectorCondition(Investor, s)));
    b.add('sector', sectors, conds.length === 1 ? conds[0] : { $or: conds });
  }
  const storedCountries = await knownWhenNeeded(query.country, async () => (await Investor.distinct('countryOfOrigin')).filter((v) => typeof v === 'string'));
  const countries = listParam(query.country, storedCountries).filter((c) => c.length <= 100);
  if (countries.length) {
    const conds = await Promise.all(countries.map((c) => countryCondition(Investor, c)));
    b.add('country', countries, conds.length === 1 ? conds[0] : { $or: conds });
  }
  if (query.stage !== undefined) {
    const { ids: statusIds, names, asked } = await statusesNamed(query.stage);
    if (names.length) {
      const investorIds = await InvestmentProject.find({ lifecycleStatus: { $in: statusIds } }).distinct('investor');
      b.add('stage', names, { _id: { $in: investorIds } });
    } else if (asked.length) {
      empty = true; b.applied.stage = asked.join(',');
    }
  }
  const officer = officerCondition(query.officer, ctxUser(ctx));
  if (officer) b.add('officer', officer.applied, officer.condition);

  if (query.firstContactYear !== undefined) {
    const raw = listParam(query.firstContactYear);
    const years = yearsOf(raw);
    const none = raw.some((v) => v.toLowerCase() === 'none');
    if (years.length || none) {
      const or = years.map((y) => ({ firstContactDate: yearRange(y) }));
      if (none) or.push({ firstContactDate: null });
      b.add('firstContactYear', [...years.map(String), ...(none ? ['none'] : [])], or.length === 1 ? or[0] : { $or: or });
    }
  }
  if (flag(query.hasValue)) {
    const investorIds = await InvestmentProject.find({ estimatedValue: { $gt: 0 } }).distinct('investor');
    b.add('hasValue', '1', { _id: { $in: investorIds } });
  }
  const daysRaw = firstParam(query.noContactDays);
  if (typeof daysRaw === 'string' && /^\d{1,4}$/.test(daysRaw) && Number(daysRaw) >= 1 && Number(daysRaw) <= MAX_NO_CONTACT_DAYS) {
    const days = Number(daysRaw);
    const idsNoContact = await attention.noContactInvestorIds({ days, today: ctxToday(ctx) });
    b.add('noContactDays', String(days), { _id: { $in: idsNoContact } });
  }
  if (flag(query.incomplete)) {
    b.add('incomplete', '1', { _id: { $in: await attention.incompleteInvestorIds() } });
  }
  const q = qText(query.q);
  if (q) {
    const search = await investorSearchFilter(q);
    if (search) b.add('q', q, search);
    else { empty = true; b.applied.q = q; }
  }
  const sort = sortOf(query.sort, Object.keys(INVESTOR_SORTS));
  if (sort) b.applied.sort = sortLabel(sort);
  return {
    filter: combine(b.conditions), empty, applied: b.applied, sort,
  };
};

const runInvestors = async (query, ctx, opts = {}) => {
  const { populate = false } = opts;
  const built = (opts && opts.built) || await buildInvestors(query, ctx);
  if (built.empty) return { ...built, docs: [] };
  let finder = Investor.find(built.filter);
  if (built.sort) {
    const dir = built.sort.direction === 'desc' ? -1 : 1;
    finder = finder.sort({ [INVESTOR_SORTS[built.sort.key]]: dir, _id: 1 }).collation({ locale: 'en', strength: 2 });
  }
  if (populate) finder = finder.populate('assignedTo', 'name');
  return { ...built, docs: await finder };
};

// ---------- projects ----------

const PROJECT_SORTS = ['title', 'value', 'jobs', 'stage'];

const investorIdsWhere = (condition) => Investor.find(condition).distinct('_id');

const buildProjects = async (query = {}, ctx = {}) => {
  const b = builder();
  let empty = false;
  const sectors = listParam(query.sector, SECTOR_LIST).map(canonicalSector).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (sectors.length) {
    const conds = await Promise.all(sectors.map((s) => sectorCondition(InvestmentProject, s)));
    b.add('sector', sectors, conds.length === 1 ? conds[0] : { $or: conds });
  }
  if (query.lifecycleStatus !== undefined) {
    const { ids: statusIds, names, asked } = await statusesNamed(query.lifecycleStatus);
    if (names.length) b.add('lifecycleStatus', names, { lifecycleStatus: { $in: statusIds } });
    else if (asked.length) { empty = true; b.applied.lifecycleStatus = asked.join(','); }
  }
  const currencies = pick(query.currency, CURRENCIES);
  if (currencies.length) {
    b.add('currency', currencies, { currency: { $in: currencies.includes(DEFAULT_CURRENCY) ? [...currencies, null] : currencies } });
  }
  if (flag(query.hasValue)) b.add('hasValue', '1', { estimatedValue: { $gt: 0 } });
  if (flag(query.hasJobs)) b.add('hasJobs', '1', { estimatedNumberOfJobs: { $gt: 0 } });
  const investors = ids(query.investor);
  if (investors.length) b.add('investor', investors, { investor: { $in: investors } });
  const officer = officerCondition(query.officer, ctxUser(ctx));
  if (officer) b.add('officer', officer.applied, { investor: { $in: await investorIdsWhere(officer.condition) } });
  const types = pick(query.organisationType, ORGANISATION_TYPES);
  if (types.length) b.add('organisationType', types, { investor: { $in: await investorIdsWhere(organisationTypeCondition(types)) } });
  // saberYear=Y: the projects the 11.9 SABER report checks for T1–T11 in year Y
  // (the report's own scope function, so the card count and the list agree).
  const saberYears = yearsOf(query.saberYear);
  if (saberYears.length) {
    // Required here (not at the top): saberReport loads the metrics modules.
    const { saberScopeProjectIds } = require('./saberReport');
    b.add('saberYear', String(saberYears[0]), { _id: { $in: await saberScopeProjectIds(saberYears[0]) } });
  }
  const q = qText(query.q);
  if (q) {
    const regex = regexFor(q);
    if (regex) {
      const byName = await investorIdsWhere({ investorName: regex });
      b.add('q', q, { $or: [{ projectTitle: regex }, { location: regex }, ...(byName.length ? [{ investor: { $in: byName } }] : [])] });
    } else { empty = true; b.applied.q = q; }
  }
  const sort = sortOf(query.sort, PROJECT_SORTS);
  if (sort) b.applied.sort = sortLabel(sort);
  return {
    filter: combine(b.conditions), empty, applied: b.applied, sort,
  };
};

const PROJECT_DB_SORTS = { title: 'projectTitle', value: 'estimatedValue', jobs: 'estimatedNumberOfJobs' };

const runProjects = async (query, ctx, opts = {}) => {
  const built = (opts && opts.built) || await buildProjects(query, ctx);
  if (built.empty) return { ...built, docs: [] };
  let finder = InvestmentProject.find(built.filter)
    .populate('investor', 'investorName')
    .populate('lifecycleStatus');
  const { sort } = built;
  const dir = sort && sort.direction === 'desc' ? -1 : 1;
  if (sort && PROJECT_DB_SORTS[sort.key]) {
    finder = finder.sort({ [PROJECT_DB_SORTS[sort.key]]: dir, _id: 1 }).collation({ locale: 'en', strength: 2 });
  }
  let docs = await finder;
  if (sort && sort.key === 'stage') {
    // Status order; projects without a status last.
    const order = (p) => (p.lifecycleStatus && Number.isFinite(p.lifecycleStatus.order) ? p.lifecycleStatus.order : null);
    docs = docs.map((p, i) => ({ p, i })).sort((a, b) => {
      const oa = order(a.p);
      const ob = order(b.p);
      if (oa === null || ob === null) return (oa === null) - (ob === null) || a.i - b.i;
      return (oa - ob) * dir || a.i - b.i;
    }).map(({ p }) => p);
  }
  return { ...built, docs };
};

// ---------- interactions ----------

const happenedTime = (log) => new Date(log.interactionDate || log.createdAt).getTime();
// Newest first by happened date (else createdAt); `asc` reverses it.
const sortByHappened = (logs, direction = 'desc') => {
  const dir = direction === 'asc' ? -1 : 1;
  return logs.sort((a, b) => ((happenedTime(b) - happenedTime(a))
    || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) * dir);
};

const buildInteractions = async (query = {}, ctx = {}) => {
  const b = builder();
  let empty = false;
  const storedCategories = await knownWhenNeeded(query.category, async () => (await InteractionLog.distinct('category')).filter((v) => typeof v === 'string'));
  const categories = listParam(query.category, storedCategories).filter((c) => c.length <= 100);
  if (categories.length) b.add('category', categories, { category: { $in: categories } });
  // officerLogs=1: officer logs only (no System Update rows), the analytics scope.
  if (flag(query.officerLogs)) b.add('officerLogs', '1', attention.OFFICER_LOG);
  const codes = pick(query.serviceCode, SERVICE_CODES);
  if (codes.length) b.add('serviceCode', codes, { serviceCodes: { $in: codes } });
  if (flag(query.noCode)) b.add('noCode', '1', attention.untaggedLogFilter());
  // creditLinkage=1: logs marked credit linkage (the 11.9 SABER report card).
  if (flag(query.creditLinkage)) b.add('creditLinkage', '1', { creditLinkage: true });
  // dated=1: logs with a happened date only (the year filter then has no
  // recorded-time fallback), as the dashboard's and the SABER report's counts.
  if (flag(query.dated)) b.add('dated', '1', { interactionDate: { $ne: null } });
  const investors = ids(query.investor);
  if (investors.length) {
    const projectIds = await InvestmentProject.find({ investor: { $in: investors } }).distinct('_id');
    b.add('investor', investors, { $or: [{ investor: { $in: investors } }, ...(projectIds.length ? [{ project: { $in: projectIds } }] : [])] });
  }
  const loggedBy = userIdsOf(query.loggedBy, ctxUser(ctx));
  if (loggedBy.ids.length) b.add('loggedBy', loggedBy.applied, { loggedBy: { $in: loggedBy.ids } });
  // officer: logs of investors assigned to them (the log's investor, or its project's).
  const officer = officerCondition(query.officer, ctxUser(ctx));
  if (officer) b.add('officer', officer.applied, await attention.interactionScopeFor(await investorIdsWhere(officer.condition)));
  const range = dayRange(query.from, query.to);
  if (range) b.add('from-to', range.label, happenedIn('interactionDate', 'createdAt', [range]));
  const years = yearsOf(query.year);
  if (years.length) b.add('year', years, happenedIn('interactionDate', 'createdAt', years.map(yearRanges)));
  const q = qText(query.q);
  if (q) {
    const regex = regexFor(q);
    if (regex) b.add('q', q, { description: regex });
    else { empty = true; b.applied.q = q; }
  }
  const sort = sortOf(query.sort, ['date']);
  if (sort) b.applied.sort = sortLabel(sort);
  return {
    filter: combine(b.conditions), empty, applied: b.applied, sort,
  };
};

const runInteractions = async (query, ctx, opts = {}) => {
  const { evidence = true } = opts;
  const built = (opts && opts.built) || await buildInteractions(query, ctx);
  if (built.empty) return { ...built, docs: [] };
  const logs = await InteractionLog.find(built.filter)
    .populate('loggedBy', 'name email')
    .populate('project', 'projectTitle')
    .populate('investor', 'investorName');
  const sorted = sortByHappened(logs, built.sort ? built.sort.direction : 'desc');
  return { ...built, docs: evidence ? await withEvidenceFiles(sorted) : sorted };
};

// ---------- issues ----------

const buildIssues = async (query = {}, ctx = {}) => {
  const b = builder();
  let empty = false;
  const statuses = pick(query.status, ISSUE_STATUSES);
  if (statuses.length) b.add('status', statuses, { status: { $in: statuses } });
  const categories = pick(query.category, ISSUE_CATEGORIES);
  if (categories.length) b.add('category', categories, { category: { $in: categories } });
  const mdas = pick(query.mda, MDA_CODES);
  if (mdas.length) b.add('mda', mdas, { mdaResponsible: { $in: mdas } });
  const years = yearsOf(query.year);
  if (years.length) b.add('year', years, years.length === 1 ? { dateReported: yearRange(years[0]) } : { $or: years.map((y) => ({ dateReported: yearRange(y) })) });
  if (flag(query.stale)) b.add('stale', '1', { _id: { $in: await attention.staleIssueIds({ today: ctxToday(ctx) }) } });
  const investors = ids(query.investor);
  if (investors.length) b.add('investor', investors, { investor: { $in: investors } });
  const officer = officerCondition(query.officer, ctxUser(ctx));
  if (officer) b.add('officer', officer.applied, { investor: { $in: await investorIdsWhere(officer.condition) } });
  const q = qText(query.q);
  if (q) {
    const regex = regexFor(q);
    if (regex) b.add('q', q, { $or: [{ reference: regex }, { importRef: regex }, { description: regex }] });
    else { empty = true; b.applied.q = q; }
  }
  const sort = sortOf(query.sort, ['date']);
  if (sort) b.applied.sort = sortLabel(sort);
  return {
    filter: combine(b.conditions), empty, applied: b.applied, sort,
  };
};

const runIssues = async (query, ctx, opts = {}) => {
  const built = (opts && opts.built) || await buildIssues(query, ctx);
  if (built.empty) return { ...built, docs: [] };
  const dir = built.sort && built.sort.direction === 'asc' ? 1 : -1;
  const docs = await InvestorIssue.find(built.filter)
    .populate('investor', 'investorName')
    .populate('project', 'projectTitle')
    .sort({ dateReported: dir, createdAt: dir });
  return { ...built, docs };
};

// ---------- announcements ----------

const buildAnnouncements = async (query = {}) => {
  const b = builder();
  let empty = false;
  const years = yearsOf(query.year);
  if (years.length) b.add('year', years, years.length === 1 ? { announcementDate: yearRange(years[0]) } : { $or: years.map((y) => ({ announcementDate: yearRange(y) })) });
  const named = listParam(query.oysipaNamed).map((v) => ({ 1: 'true', 0: 'false' }[v] || v)).filter((v) => v === 'true' || v === 'false');
  if (named.length === 1) b.add('oysipaNamed', named[0], { oysipaNamed: named[0] === 'true' });
  // counted=1: the DLR 4.4 scope (projects of Intermediaries / Promotion agents left out).
  if (flag(query.counted)) b.add('counted', '1', await countedAnnouncementCondition());
  const projects = ids(query.project);
  if (projects.length) b.add('project', projects, { project: { $in: projects } });
  const range = dayRange(query.from, query.to);
  if (range) b.add('from-to', range.label, { announcementDate: range.utc });
  const q = qText(query.q);
  if (q) {
    const regex = regexFor(q);
    if (regex) {
      const byName = await investorIdsWhere({ investorName: regex });
      const projectIds = await InvestmentProject.find({ $or: [{ projectTitle: regex }, ...(byName.length ? [{ investor: { $in: byName } }] : [])] }).distinct('_id');
      b.add('q', q, { $or: [{ outlet: regex }, ...(projectIds.length ? [{ project: { $in: projectIds } }] : [])] });
    } else { empty = true; b.applied.q = q; }
  }
  const sort = sortOf(query.sort, ['date']);
  if (sort) b.applied.sort = sortLabel(sort);
  return {
    filter: combine(b.conditions), empty, applied: b.applied, sort,
  };
};

const runAnnouncements = async (query, ctx, opts = {}) => {
  const built = (opts && opts.built) || await buildAnnouncements(query, ctx);
  if (built.empty) return { ...built, docs: [] };
  const dir = built.sort && built.sort.direction === 'asc' ? 1 : -1;
  const docs = await InvestmentAnnouncement.find(built.filter)
    .populate({
      path: 'project',
      select: 'projectTitle investor',
      populate: { path: 'investor', select: 'investorName' },
    })
    .sort({ announcementDate: dir, createdAt: dir });
  return { ...built, docs };
};

// ---------- evidence files ----------

const FILE_TYPES = {
  pdf: [/^application\/pdf$/i],
  image: [/^image\//i],
  document: [/msword/i, /wordprocessingml/i, /opendocument\.text/i, /^text\/plain$/i, /rtf/i],
  spreadsheet: [/ms-excel/i, /spreadsheetml/i, /^text\/csv$/i, /opendocument\.spreadsheet/i],
};

// `query.folder` (evidence export only) limits to one folder; `base` is set by
// the folder route.
const buildEvidence = async (query = {}, ctx = {}) => {
  const b = builder();
  let empty = false;
  const base = (ctx && ctx.folder) ? { folder: ctx.folder } : {};
  if (!ctx.folder) {
    const folder = ids(query.folder)[0];
    if (folder) { base.folder = new mongoose.Types.ObjectId(folder); b.applied.folder = folder; }
  }
  if (flag(query.untagged)) b.add('untagged', '1', EvidenceFile.UNTAGGED);
  const types = pick(query.type, Object.keys(FILE_TYPES));
  if (types.length) b.add('type', types, { mimeType: { $in: types.flatMap((t) => FILE_TYPES[t]) } });
  const range = dayRange(query.from, query.to);
  if (range) b.add('from-to', range.label, happenedIn('documentDate', 'uploadedAt', [range]));
  const q = qText(query.q);
  if (q) {
    const regex = regexFor(q);
    if (regex) b.add('q', q, { $or: [{ fileName: regex }, { what: regex }] });
    else { empty = true; b.applied.q = q; }
  }
  const sort = sortOf(query.sort, ['date', 'name']);
  if (sort) b.applied.sort = sortLabel(sort);
  return {
    filter: combine([Object.keys(base).length ? base : null, ...b.conditions]), base, empty, applied: b.applied, sort,
  };
};

const populateFile = (query) => query
  .populate('links.investor', 'investorName')
  .populate('links.interaction', 'description category interactionDate createdAt')
  .populate('links.issue', 'importRef category status')
  .populate('links.announcement', 'announcementDate outlet')
  .populate('links.linkedBy', 'name')
  .populate('uploadedBy', 'name');

const fileTime = (f) => new Date(f.documentDate || f.uploadedAt).getTime();
const byName = (a, b) => String(a.fileName).localeCompare(String(b.fileName), undefined, { sensitivity: 'base', numeric: true });
const sortFiles = (files, sort) => {
  const dir = sort && sort.direction === 'desc' ? -1 : 1;
  if (sort && sort.key === 'name') return files.sort((a, b) => byName(a, b) * dir || (fileTime(a) - fileTime(b)));
  return files.sort((a, b) => ((fileTime(a) - fileTime(b)) * dir) || byName(a, b));
};

// Files as JSON (storage internals stripped by EvidenceFile toJSON).
const runEvidence = async (query, ctx = {}, opts = {}) => {
  const { withFolder = false } = opts;
  const built = (opts && opts.built) || await buildEvidence(query, ctx);
  if (built.empty) return { ...built, docs: [] };
  let finder = populateFile(EvidenceFile.find(built.filter));
  if (withFolder) finder = finder.populate('folder', 'name');
  const files = (await finder).map((f) => f.toJSON());
  return { ...built, docs: sortFiles(files, built.sort) };
};

// ---------- totals (X-Total-Count: unfiltered) ----------

const MODELS = {
  investors: Investor,
  projects: InvestmentProject,
  interactions: InteractionLog,
  issues: InvestorIssue,
  announcements: InvestmentAnnouncement,
  evidence: EvidenceFile,
};

const unfilteredTotal = (list, base = {}) => MODELS[list].countDocuments(base);

const RUNNERS = {
  investors: runInvestors,
  projects: runProjects,
  interactions: runInteractions,
  issues: runIssues,
  announcements: runAnnouncements,
  evidence: runEvidence,
};
const BUILDERS = {
  investors: buildInvestors,
  projects: buildProjects,
  interactions: buildInteractions,
  issues: buildIssues,
  announcements: buildAnnouncements,
  evidence: buildEvidence,
};

// Folder for the folder route, for convenience (404 handled by the caller).
const loadFolder = (id) => (mongoose.isValidObjectId(id) ? EvidenceFolder.findById(id).populate('parent', 'name key').lean() : null);

module.exports = {
  listParam,
  firstParam,
  qText,
  flag,
  dayRange,
  sortOf,
  regexFor,
  sortByHappened,
  buildInvestors,
  buildProjects,
  buildInteractions,
  buildIssues,
  buildAnnouncements,
  buildEvidence,
  runInvestors,
  runProjects,
  runInteractions,
  runIssues,
  runAnnouncements,
  runEvidence,
  unfilteredTotal,
  RUNNERS,
  BUILDERS,
  MODELS,
  FILE_TYPES,
  loadFolder,
};
