// Shared metrics service (story 11.14). Feeds the DG dashboard
// (GET /api/analytics/overview), the Staff "My work" page
// (GET /api/analytics/mine) and the 11.9 verifier export, so their numbers
// cannot drift apart.
//
// Rules:
// - Year on year uses happened dates only (announcementDate, firstContactDate,
//   interactionDate, dateReported). Never project dateRegistered or createdAt.
//   Records with no happened date are counted as "undated", never guessed.
// - Values are per currency; never added across currencies. The ₦ equivalent
//   converts at the latest Admin rate per currency and is null when a needed
//   rate is missing.
// - Missing data is shown as "Not recorded" (sector, country) or "Unknown"
//   (lead source), never invented. Every figure carries coverage {with, total}.
// - Investor counts use organisation type Investor (or none set); breakdown
//   links add organisationType=Investor so the list matches the count.
//
// The pure helpers (valueStats, ngnEquivalent, yearSeries, change, ...) take
// plain arrays, so they are tested without a database.
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const {
  LEAD_SOURCES, UNKNOWN_LEAD_SOURCE, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE, CURRENCIES, DEFAULT_CURRENCY, INVESTOR_COUNT_FILTER,
} = require('../constants/investorFields');
const { SERVICE_CODES } = require('../constants/serviceCodes');
const { EXCLUDED_ORGANISATION_TYPES } = require('../constants/announcementFields');
const { SECTORS, NOT_RECORDED, resolveSector } = require('../constants/sectors');
const { countryLabel } = require('../constants/countries');
const { issuesMetric } = require('./issueRegister');
const { announcementsMetric } = require('./announcementRegister');
const { getFxRates } = require('./fxRates');
const { todayLagos, TIME_ZONE } = require('../utils/happenedDate');

const SYSTEM_CATEGORY = 'System Update';
const OPEN_ISSUE_STATUSES = ['Open', 'In progress'];
const NO_CONTACT_DAYS = 60;
const STALE_ISSUE_DAYS = 14;
const TOP_COUNTRIES = 8;
const FIRST_CHART_YEAR = 2023;
const DAY_MS = 24 * 60 * 60 * 1000;

// Stage groups for the headline (status names compared in lower case).
const STAGE_GROUPS = [
  ['Early pipeline', ['initial lead', 'initial interest', 'lead']],
  ['Commitment or execution', ['commitment', 'execution']],
  ['Operating', ['existing investor', 'exisiting investor', 'exisiting', 'expansion']],
  ['Exited', ['exit']],
];
const OTHER_STAGE_GROUP = 'Other stages';
const stageGroup = (name) => {
  const key = String(name || '').trim().toLowerCase();
  const found = STAGE_GROUPS.find(([, names]) => names.includes(key));
  return found ? found[0] : OTHER_STAGE_GROUP;
};

// ---------- pure helpers ----------

// Same rule as INVESTOR_COUNT_FILTER: type Investor, or none set (missing / null).
const isInvestorType = (inv) => inv.organisationType === undefined || inv.organisationType === null
  || inv.organisationType === DEFAULT_ORGANISATION_TYPE;
const hasValue = (p) => typeof p.estimatedValue === 'number' && p.estimatedValue > 0;
const hasJobs = (p) => typeof p.estimatedNumberOfJobs === 'number' && p.estimatedNumberOfJobs > 0;
const currencyOf = (p) => (CURRENCIES.includes(p.currency) ? p.currency : DEFAULT_CURRENCY);
const yearOf = (d) => (d ? new Date(d).getUTCFullYear() : null);
const coverage = (withCount, total) => ({ with: withCount, total });

const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const stats = (nums) => {
  if (!nums.length) return { sum: 0, count: 0, average: null, median: null };
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    sum, count: nums.length, average: sum / nums.length, median: median(nums),
  };
};

// Per currency {sum, count, average, median} over projects with a value > 0.
const valueStats = (projects) => {
  const by = {};
  projects.filter(hasValue).forEach((p) => {
    const c = currencyOf(p);
    (by[c] = by[c] || []).push(p.estimatedValue);
  });
  const byCurrency = {};
  CURRENCIES.forEach((c) => { if (by[c]) byCurrency[c] = stats(by[c]); });
  const withValue = projects.filter(hasValue).length;
  return { byCurrency, coverage: coverage(withValue, projects.length) };
};

// Currencies no rate can exist for: left out of the ₦ total, listed in `excluded`.
const UNCONVERTIBLE = ['Other'];

// NGN plus every other currency at its latest rate; null when a rate is missing.
// Currency "Other" is never converted: it is listed in `excluded` (its values
// stay in byCurrency), so it cannot make the total null forever.
const ngnEquivalent = (byCurrency, fx) => {
  const latest = (fx && fx.latest) || {};
  const ratesUsed = [];
  const missing = [];
  const excluded = [];
  let total = byCurrency.NGN ? byCurrency.NGN.sum : 0;
  Object.entries(byCurrency).forEach(([currency, s]) => {
    if (currency === 'NGN' || !s.count) return;
    if (UNCONVERTIBLE.includes(currency)) {
      excluded.push(currency);
      return;
    }
    const r = latest[currency];
    if (!r) {
      missing.push(currency);
      return;
    }
    ratesUsed.push({
      currency, rate: r.rate, asOf: r.asOf, source: r.source, stale: !!r.stale,
    });
    total += s.sum * r.rate;
  });
  return {
    value: missing.length ? null : total,
    ratesUsed,
    missing,
    excluded,
    stale: ratesUsed.some((r) => r.stale),
  };
};

const jobStats = (projects) => {
  const withJobs = projects.filter(hasJobs);
  return {
    sum: withJobs.reduce((a, p) => a + p.estimatedNumberOfJobs, 0),
    count: withJobs.length,
    coverage: coverage(withJobs.length, projects.length),
  };
};

// Change of `current` against `previous`: previous 0 and current > 0 → "new".
const change = (current, previous) => {
  if (previous === null || previous === undefined) return null;
  const delta = current - previous;
  if (previous === 0) return { current, previous, delta, pct: null, isNew: current > 0 };
  return {
    current, previous, delta, pct: delta / previous, isNew: false,
  };
};

const MAX_SERIES_YEARS = 16;

// Contiguous years from the earliest data year (or FIRST_CHART_YEAR) to `toYear`,
// at most MAX_SERIES_YEARS (older years go into the series' `earlier` count).
const yearRangeFor = (years, toYear) => {
  const known = years.filter((y) => Number.isInteger(y) && y <= toYear);
  const from = Math.min(FIRST_CHART_YEAR, ...known);
  const out = [];
  for (let y = Math.max(from, toYear - MAX_SERIES_YEARS + 1); y <= toYear; y += 1) out.push(y);
  return out;
};

// Counts by happened year: { series: [{ year, count }], earlier (before the
// first series year), later (after toYear), undated, total }.
const yearSeries = (dates, toYear) => {
  const counts = new Map();
  let undated = 0;
  dates.forEach((d) => {
    const y = yearOf(d);
    if (y === null) undated += 1;
    else counts.set(y, (counts.get(y) || 0) + 1);
  });
  const later = [...counts.keys()].filter((y) => y > toYear).reduce((n, y) => n + counts.get(y), 0);
  const years = yearRangeFor([...counts.keys()], toYear);
  const earlier = [...counts.keys()].filter((y) => y < years[0]).reduce((n, y) => n + counts.get(y), 0);
  return {
    series: years.map((year) => ({ year, count: counts.get(year) || 0 })),
    earlier,
    undated,
    later,
    total: dates.length,
  };
};

const countBy = (items, keyFn) => {
  const m = new Map();
  items.forEach((i) => {
    const k = keyFn(i);
    m.set(k, (m.get(k) || 0) + 1);
  });
  return m;
};

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};
const investorLink = (params) => `/investors${qs({ ...params, organisationType: DEFAULT_ORGANISATION_TYPE })}`;

// Projects by lifecycle status, in status order (statuses with no project kept).
const stageBreakdown = (projects, statuses) => {
  const counts = countBy(projects, (p) => (p.lifecycleStatus ? String(p.lifecycleStatus) : ''));
  const items = statuses.map((s) => ({
    label: s.name,
    count: counts.get(String(s._id)) || 0,
    group: stageGroup(s.name),
    to: `/projects${qs({ lifecycleStatus: s.name })}`,
  }));
  const known = new Set(statuses.map((s) => String(s._id)));
  const unknown = projects.filter((p) => !p.lifecycleStatus || !known.has(String(p.lifecycleStatus))).length;
  if (unknown) items.push({ label: NOT_RECORDED, count: unknown, group: OTHER_STAGE_GROUP, to: null });
  return { items, coverage: coverage(projects.length - unknown, projects.length) };
};

const stageGroups = (stageItems) => {
  const out = {};
  [...STAGE_GROUPS.map(([g]) => g), OTHER_STAGE_GROUP].forEach((g) => { out[g] = 0; });
  stageItems.forEach((i) => { out[i.group] += i.count; });
  return out;
};

const sectorBreakdown = (investors) => {
  const counts = countBy(investors, (i) => resolveSector(i.sector).sector);
  const items = SECTORS.map((s) => ({
    label: s.name, priority: s.priority, count: counts.get(s.name) || 0, to: investorLink({ sector: s.name }),
  }));
  const notRecorded = counts.get(NOT_RECORDED) || 0;
  items.push({
    label: NOT_RECORDED, priority: false, notRecorded: true, count: notRecorded, to: investorLink({ sector: NOT_RECORDED }),
  });
  return { items, coverage: coverage(investors.length - notRecorded, investors.length) };
};

const countryBreakdown = (investors) => {
  // Group case-insensitively; the label is the most common spelling.
  const groups = new Map();
  investors.forEach((i) => {
    const label = countryLabel(i.countryOfOrigin);
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { count: 0, spellings: new Map() });
    const g = groups.get(key);
    g.count += 1;
    g.spellings.set(label, (g.spellings.get(label) || 0) + 1);
  });
  const notKey = NOT_RECORDED.toLowerCase();
  const notRecorded = groups.has(notKey) ? groups.get(notKey).count : 0;
  const ranked = [...groups.entries()]
    .filter(([k]) => k !== notKey)
    .map(([, g]) => ({ label: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], count: g.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const items = ranked.slice(0, TOP_COUNTRIES).map((c) => ({ ...c, to: investorLink({ country: c.label }) }));
  const others = ranked.slice(TOP_COUNTRIES);
  if (others.length) {
    items.push({
      label: 'Others', count: others.reduce((n, c) => n + c.count, 0), countries: others.length, to: null,
    });
  }
  items.push({
    label: NOT_RECORDED, notRecorded: true, count: notRecorded, to: investorLink({ country: NOT_RECORDED }),
  });
  return { items, coverage: coverage(investors.length - notRecorded, investors.length) };
};

const leadSourceBreakdown = (investors) => {
  const counts = countBy(investors, (i) => (LEAD_SOURCES.includes(i.leadSource) ? i.leadSource : UNKNOWN_LEAD_SOURCE));
  const items = LEAD_SOURCES.map((s) => ({
    label: s, count: counts.get(s) || 0, unknown: s === UNKNOWN_LEAD_SOURCE, to: investorLink({ leadSource: s }),
  }));
  const unknown = counts.get(UNKNOWN_LEAD_SOURCE) || 0;
  return { items, coverage: coverage(investors.length - unknown, investors.length) };
};

// Every record (all organisation types).
const organisationTypeBreakdown = (records) => {
  const counts = countBy(records, (i) => (ORGANISATION_TYPES.includes(i.organisationType) ? i.organisationType : DEFAULT_ORGANISATION_TYPE));
  const items = ORGANISATION_TYPES.map((t) => ({ label: t, count: counts.get(t) || 0, to: `/investors${qs({ organisationType: t })}` }));
  return { items, coverage: coverage(records.length, records.length) };
};

// Interaction counts per SABER code (each code on an interaction counts once).
const servicesByCode = (logs) => {
  const counts = new Map(SERVICE_CODES.map((c) => [c, 0]));
  let tagged = 0;
  let creditLinkage = 0;
  logs.forEach((l) => {
    const codes = [...new Set((l.serviceCodes || []).filter((c) => counts.has(c)))];
    if (codes.length) tagged += 1;
    if (l.creditLinkage) creditLinkage += 1;
    codes.forEach((c) => counts.set(c, counts.get(c) + 1));
  });
  return {
    codes: SERVICE_CODES.map((code) => ({ code, count: counts.get(code) })),
    interactions: logs.length,
    tagged,
    creditLinkage,
    coverage: coverage(tagged, logs.length),
  };
};

const daysAgo = (date, today) => Math.floor((Date.parse(`${today}T00:00:00Z`) - new Date(date).getTime()) / DAY_MS);

// ---------- database loads ----------

const INVESTOR_FIELDS = 'investorName sector countryOfOrigin leadSource organisationType firstContactDate assignedTo';
const PROJECT_FIELDS = 'projectTitle investor lifecycleStatus estimatedValue currency estimatedNumberOfJobs sector';
const LOG_FIELDS = 'investor project category serviceCodes creditLinkage interactionDate createdAt loggedBy';

const loadStatuses = () => LifecycleStatus.find({}).sort({ order: 1, name: 1 }).select('name order').lean();

const MIN_YEAR = 2000;

// Valid ?year=: a 4-digit year from MIN_YEAR to the current year. "all" → null (all years).
const resolveYear = (raw, today = todayLagos()) => {
  const current = Number(today.slice(0, 4));
  if (raw === undefined || raw === '' || raw === null) return { year: current, current };
  if (raw === 'all') return { year: null, current };
  if (typeof raw !== 'string' || !/^\d{4}$/.test(raw)) return { error: 'Invalid year.' };
  const y = Number(raw);
  if (y < MIN_YEAR || y > current) return { error: `Year must be from ${MIN_YEAR} to ${current}.` };
  return { year: y, current };
};

// ---------- overview (DG / Portal-Admin) ----------

const overview = async ({ year = null, today = todayLagos() } = {}) => {
  const currentYear = Number(today.slice(0, 4));
  const chartTo = currentYear;
  const [records, projects, logs, statuses, announcements, fx, files, untaggedFiles] = await Promise.all([
    Investor.find({}).select(INVESTOR_FIELDS).lean(),
    InvestmentProject.find({}).select(PROJECT_FIELDS).lean(),
    InteractionLog.find({ category: { $ne: SYSTEM_CATEGORY } }).select(LOG_FIELDS).lean(),
    loadStatuses(),
    InvestmentAnnouncement.find({}).select('project announcementDate oysipaNamed').lean(),
    getFxRates(today),
    EvidenceFile.countDocuments({}),
    EvidenceFile.countDocuments(EvidenceFile.UNTAGGED),
  ]);
  const investors = records.filter(isInvestorType);
  // Headline projects, values, jobs and stages: projects of organisation type
  // Investor only, the same scope as the investor count and the breakdowns.
  const investorIds = new Set(investors.map((i) => String(i._id)));
  const investorProjects = projects.filter((p) => investorIds.has(String(p.investor)));
  const PROJECT_SCOPE = 'projects of investors (organisation type Investor)';

  // Headline
  const typeItems = organisationTypeBreakdown(records);
  const stages = { ...stageBreakdown(investorProjects, statuses), scope: PROJECT_SCOPE };
  const values = { ...valueStats(investorProjects), scope: PROJECT_SCOPE };
  const headline = {
    investors: {
      total: investors.length,
      records: records.length,
      byType: Object.fromEntries(typeItems.items.map((i) => [i.label, i.count])),
      coverage: coverage(records.filter((r) => r.organisationType).length, records.length),
    },
    projects: {
      total: investorProjects.length,
      all: projects.length,
      byStageGroup: stageGroups(stages.items),
      coverage: stages.coverage,
      scope: PROJECT_SCOPE,
    },
    values: { ...values, ngnEquivalent: ngnEquivalent(values.byCurrency, fx) },
    jobs: { ...jobStats(investorProjects), scope: PROJECT_SCOPE },
  };

  // Year on year (happened dates only)
  const excludedInvestorIds = new Set(records.filter((r) => EXCLUDED_ORGANISATION_TYPES.includes(r.organisationType)).map((r) => String(r._id)));
  const excludedProjectIds = new Set(projects.filter((p) => excludedInvestorIds.has(String(p.investor))).map((p) => String(p._id)));
  const annAll = yearSeries(announcements.map((a) => a.announcementDate), chartTo);
  const namedDates = announcements
    .filter((a) => a.oysipaNamed && !excludedProjectIds.has(String(a.project)))
    .map((a) => a.announcementDate);
  const annNamed = yearSeries(namedDates, chartTo);
  const namedByYear = new Map(annNamed.series.map((s) => [s.year, s.count]));
  const newInvestors = yearSeries(investors.map((i) => i.firstContactDate), chartTo);
  const interactions = yearSeries(logs.map((l) => l.interactionDate), chartTo);
  const logsInYear = year === null ? logs : logs.filter((l) => yearOf(l.interactionDate) === year);
  const prevLogs = year === null ? null : logs.filter((l) => yearOf(l.interactionDate) === year - 1);
  const countIn = (series, y) => {
    const row = series.series.find((s) => s.year === y);
    return row ? row.count : 0;
  };
  const services = servicesByCode(logsInYear);
  const yearOnYear = {
    announcements: {
      series: annAll.series.map((s) => ({ year: s.year, count: s.count, oysipaNamed: namedByYear.get(s.year) || 0 })),
      undated: annAll.undated,
      to: '/announcements',
    },
    newInvestors: { ...newInvestors, coverage: coverage(newInvestors.total - newInvestors.undated, newInvestors.total), to: '/investors?organisationType=Investor' },
    interactions: { ...interactions, coverage: coverage(interactions.total - interactions.undated, interactions.total), to: '/interactions' },
    services: { year, ...services },
    change: year === null ? null : {
      year,
      previousYear: year - 1,
      announcements: change(countIn(annAll, year), countIn(annAll, year - 1)),
      oysipaNamed: change(countIn(annNamed, year), countIn(annNamed, year - 1)),
      newInvestors: change(countIn(newInvestors, year), countIn(newInvestors, year - 1)),
      interactions: change(countIn(interactions, year), countIn(interactions, year - 1)),
      services: change(services.tagged, servicesByCode(prevLogs).tagged),
    },
  };

  // SABER (the selected year; the current year for "All years")
  const saberYear = year || currentYear;
  const [issues, named] = await Promise.all([issuesMetric(saberYear), announcementsMetric(saberYear)]);
  const saber = {
    year: saberYear,
    issues,
    announcements: named,
    evidence: { files, untagged: untaggedFiles, to: '/evidence' },
  };

  return {
    year,
    currentYear,
    generatedAt: new Date().toISOString(),
    headline,
    yearOnYear,
    breakdowns: {
      stage: stages,
      sector: sectorBreakdown(investors),
      country: countryBreakdown(investors),
      leadSource: leadSourceBreakdown(investors),
      organisationType: typeItems,
    },
    saber,
    fx: {
      latest: fx.latest, missing: fx.missing, stale: fx.stale, staleDays: fx.staleDays,
    },
  };
};

// ---------- mine (any signed-in user) ----------

// Lagos calendar month (YYYY-MM) of `today` shifted by `delta` months.
const monthKey = (today, delta = 0) => {
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
const happenedExpr = { $ifNull: ['$interactionDate', '$createdAt'] };
const OFFICER_LOG = { category: { $ne: SYSTEM_CATEGORY } };

// Staff: investors assigned to them. DG / Portal-Admin: every investor.
// Counts come from aggregations; only the 5 most recent officer logs are loaded.
const mine = async ({ user, today = todayLagos() }) => {
  const scope = user && user.role === 'Staff' ? 'assigned' : 'all';
  const investorFilter = scope === 'assigned' ? { assignedTo: user._id } : {};
  const records = await Investor.find(investorFilter).select(INVESTOR_FIELDS).lean();
  const ids = records.map((r) => r._id);
  const logScope = { ...OFFICER_LOG, ...(scope === 'assigned' ? { investor: { $in: ids } } : { investor: { $ne: null } }) };
  const [projects, lastContacts, untaggedLogs, recentLogs, issues, statuses, fx, untaggedFiles, myMonths] = await Promise.all([
    InvestmentProject.find({ investor: { $in: ids } }).select(PROJECT_FIELDS).lean(),
    InteractionLog.aggregate([
      { $match: logScope },
      { $group: { _id: '$investor', last: { $max: happenedExpr } } },
    ]),
    InteractionLog.countDocuments({ ...logScope, $or: [{ serviceCodes: { $exists: false } }, { serviceCodes: { $size: 0 } }] }),
    InteractionLog.aggregate([
      { $match: logScope },
      { $addFields: { sortDate: happenedExpr } },
      { $sort: { sortDate: -1, _id: -1 } },
      { $limit: 5 },
      { $project: { description: 1, category: 1, interactionDate: 1, createdAt: 1, serviceCodes: 1, investor: 1, project: 1, loggedBy: 1 } },
    ]),
    InvestorIssue.find({ investor: { $in: ids }, status: { $in: OPEN_ISSUE_STATUSES } }).select('investor status dateReported dateRegistered actions.date').lean(),
    loadStatuses(),
    getFxRates(today),
    EvidenceFile.countDocuments(EvidenceFile.UNTAGGED),
    // Logged this month / last month: by happened date (else recorded), Lagos calendar month.
    user ? InteractionLog.aggregate([
      { $match: { loggedBy: user._id, ...OFFICER_LOG } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: happenedExpr, timezone: TIME_ZONE } }, count: { $sum: 1 } } },
    ]) : [],
  ]);
  await InteractionLog.populate(recentLogs, [
    { path: 'investor', select: 'investorName' },
    { path: 'project', select: 'projectTitle' },
    { path: 'loggedBy', select: 'name' },
  ]);

  const values = valueStats(projects);
  const months = new Map(myMonths.map((r) => [r._id, r.count]));
  const thisMonth = months.get(monthKey(today)) || 0;
  const lastMonth = months.get(monthKey(today, -1)) || 0;

  // Needs attention
  const lastContact = new Map(lastContacts.map((r) => [String(r._id), new Date(r.last).getTime()]));
  const noContact = records.filter((r) => {
    const last = lastContact.get(String(r._id));
    return last === undefined || daysAgo(last, today) >= NO_CONTACT_DAYS;
  });
  const projectsByInvestor = countBy(projects.filter((p) => !hasValue(p)), (p) => String(p.investor));
  const missingReasons = {
    sector: 0, country: 0, leadSource: 0, firstContactDate: 0, projectValue: 0,
  };
  const missingFields = records.filter((r) => {
    const gaps = {
      sector: resolveSector(r.sector).sector === NOT_RECORDED,
      country: countryLabel(r.countryOfOrigin) === NOT_RECORDED,
      leadSource: !LEAD_SOURCES.includes(r.leadSource) || r.leadSource === UNKNOWN_LEAD_SOURCE,
      firstContactDate: !r.firstContactDate,
      projectValue: (projectsByInvestor.get(String(r._id)) || 0) > 0,
    };
    Object.entries(gaps).forEach(([k, v]) => { if (v) missingReasons[k] += 1; });
    return Object.values(gaps).some(Boolean);
  });
  // An issue whose last action date cannot be read counts as stale (it needs a look).
  const staleIssues = issues.filter((i) => {
    const dates = (i.actions || []).map((a) => a.date).filter(Boolean).map((d) => new Date(d).getTime());
    const last = dates.length ? Math.max(...dates) : new Date(i.dateReported || i.dateRegistered).getTime();
    const age = daysAgo(last, today);
    return !Number.isFinite(age) || age > STALE_ISSUE_DAYS;
  });

  const recent = recentLogs.map((l) => ({
    _id: l._id,
    description: l.description,
    category: l.category,
    interactionDate: l.interactionDate || null,
    createdAt: l.createdAt,
    serviceCodes: l.serviceCodes || [],
    investor: l.investor ? { _id: l.investor._id, investorName: l.investor.investorName } : null,
    project: l.project ? { _id: l.project._id, projectTitle: l.project.projectTitle } : null,
    loggedBy: l.loggedBy ? { _id: l.loggedBy._id, name: l.loggedBy.name } : null,
    mine: !!(user && l.loggedBy && String(l.loggedBy._id) === String(user._id)),
  }));

  // Oyo State at a glance: the DG headline scope (organisation type Investor).
  const glanceInvestorIds = await Investor.find(INVESTOR_COUNT_FILTER).distinct('_id');
  const allProjects = await InvestmentProject.find({ investor: { $in: glanceInvestorIds } }).select('estimatedValue currency estimatedNumberOfJobs').lean();
  const allValues = valueStats(allProjects);

  return {
    scope,
    today,
    investors: { total: records.length, investors: records.filter(isInvestorType).length },
    projects: { total: projects.length },
    values: { ...values, ngnEquivalent: ngnEquivalent(values.byCurrency, fx) },
    interactionsLogged: { thisMonth, lastMonth },
    openIssues: issues.length,
    attention: {
      noContact: { count: noContact.length, days: NO_CONTACT_DAYS, to: '/investors' },
      missingFields: { count: missingFields.length, reasons: missingReasons, to: '/investors' },
      staleIssues: { count: staleIssues.length, days: STALE_ISSUE_DAYS, to: '/issues' },
      untaggedInteractions: { count: untaggedLogs, to: '/interactions' },
      // Untagged files belong to no investor yet: this count is library-wide.
      untaggedFiles: { count: untaggedFiles, scope: 'library', to: '/evidence' },
    },
    stages: stageBreakdown(projects, statuses),
    recent,
    glance: {
      investors: glanceInvestorIds.length,
      projects: allProjects.length,
      values: { ...allValues, ngnEquivalent: ngnEquivalent(allValues.byCurrency, fx) },
      jobs: jobStats(allProjects),
    },
    fx: { stale: fx.stale, missing: fx.missing },
  };
};

module.exports = {
  // pure helpers (shared with the 11.9 export)
  median,
  stats,
  valueStats,
  ngnEquivalent,
  jobStats,
  change,
  yearSeries,
  stageGroup,
  stageBreakdown,
  sectorBreakdown,
  countryBreakdown,
  leadSourceBreakdown,
  organisationTypeBreakdown,
  servicesByCode,
  resolveYear,
  // database
  overview,
  mine,
  SYSTEM_CATEGORY,
  NO_CONTACT_DAYS,
  STALE_ISSUE_DAYS,
};
