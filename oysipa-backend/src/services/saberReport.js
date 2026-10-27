// SABER report / verifier export (story 11.9, Y4-6). One builder for the
// screen summary (GET /api/saber-report) and the evidence files
// (GET /api/saber-report/download): five CSVs, a PDF, or all six in a ZIP.
//
// Every figure comes from the shared metrics service (services/metrics.js,
// services/attention.js, issuesMetric, announcementsMetric), so the report
// matches the DG dashboard for the same year:
// - services tagged and credit linkage = servicesByCode over the officer logs
//   with a happened date (interactionDate) in the year (as overview);
// - announcements counted = announcementsMetric (DLR 4.4);
// - issues and % resolved = issuesMetric (DLR 4.5).
// Years use happened dates only (firstContactDate, interactionDate,
// announcementDate, dateReported), never createdAt. year null = every year.
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const {
  servicesByCode, isCreditLinkage, isInvestorType, inYear, LOG_FIELDS, loadStatuses, servicesLink, creditLinkageLink,
} = require('./metrics');
const { OFFICER_LOG, recordGaps, hasValue } = require('./attention');
const { issuesMetric, yearRange } = require('./issueRegister');
const { announcementsMetric, countedAnnouncementCondition, yearRange: announcementYearRange } = require('./announcementRegister');
const { SERVICE_CODES, SERVICE_CODE_GROUPS } = require('../constants/serviceCodes');
const { DEFAULT_ORGANISATION_TYPE } = require('../constants/investorFields');
const { ISSUE_STATUSES, WITHDRAWN, RESOLVED } = require('../constants/issueFields');
const { NOT_RECORDED, resolveSector } = require('../constants/sectors');
const { mdaByCode } = require('../constants/mdas');
const {
  toCsv, isoDay, isoTime, lagosIsoDay,
} = require('./csv');
const { TIME_ZONE } = require('../utils/happenedDate');

const CONFIDENTIAL = 'Confidential: OYSIPA internal (contains personal data)';
const OK = '✓';
const MISSING = 'MISSING';
const NONE = 'none';
const NOT_RECORDED_TEXT = 'not recorded';
const EXAMPLES_PER_CODE = 3;

// The app the evidence links open (the frontend). FRONTEND_URL is the
// deployment's own setting; it may list several origins (the first is used).
const APP_URL = () => String(process.env.FRONTEND_URL || 'https://app.oysipa.site').split(',')[0].trim().replace(/\/+$/, '')
  || 'https://app.oysipa.site';

// The five CSV parts, in order, then the PDF.
const CSV_PARTS = ['completeness', 'services', 'credit', 'announcements', 'issues'];
const PARTS = [...CSV_PARTS, 'pdf', 'all'];
const PART_TITLES = {
  completeness: 'T1–T11 completeness (projects of investors)',
  services: 'Services by SABER code',
  credit: 'Credit-linkage interactions',
  announcements: 'Announcements (DLR 4.4)',
  issues: 'Investor issues (DLR 4.5)',
};

// T1–T11 fields checked per project, in column order.
const FIELDS = [
  ['T1', 'T1 Investing company'],
  ['T2', 'T2 Project description'],
  ['T3', 'T3 Project sector'],
  ['T4', 'T4 Country'],
  ['T5', 'T5 Estimated value (> 0)'],
  ['T6', 'T6 Location'],
  ['T7', 'T7 Estimated jobs (> 0)'],
  ['T8a', 'T8a Contact name'],
  ['T8b', 'T8b Phone'],
  ['T8c', 'T8c Email'],
  ['T9', 'T9 Lifecycle status'],
  ['T10', 'T10 Service with a SABER code'],
  ['T11', 'T11 Lead source and first contact'],
];
const RULES_NOTE = 'T5 = estimated value > 0 (a project with no currency counts as NGN, as the dashboard). T7 = estimated jobs > 0 (0 is the default of an empty field, so it counts as MISSING). T10 = a dated officer interaction with a SABER code on or before 31 Dec of the year, on the project or at investor level. T11 = a lead source other than "Unknown (pre-T11)" and a first-contact date.';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (v) => text(v) !== '';
const idOf = (ref) => (ref && typeof ref === 'object' && ref._id ? String(ref._id) : (ref ? String(ref) : ''));
const time = (d) => (d ? new Date(d).getTime() : 0);
const pct = (share) => (share === null || share === undefined ? '' : `${Math.round(share * 100)}%`);
const yesNo = (b) => (b ? 'Y' : 'N');
const yearLabel = (year) => (year === null ? 'all' : String(year));
const yearText = (year) => (year === null ? 'All years' : String(year));
const byText = (a, b) => String(a || '').localeCompare(String(b || ''));
const isCoded = (l) => (l.serviceCodes || []).some((c) => SERVICE_CODES.includes(c));
// Shown organisation type: the isInvestorType rule (none set → Investor).
const typeLabel = (inv) => {
  if (!inv) return '';
  if (isInvestorType(inv)) return DEFAULT_ORGANISATION_TYPE;
  return inv.organisationType || NOT_RECORDED_TEXT;
};

// Happened day of a log; an old log without one shows its recorded Lagos day, marked.
const logDay = (l) => (l.interactionDate ? isoDay(l.interactionDate) : `${lagosIsoDay(l.createdAt)} (recorded)`);
// Newest first by happened date, then recorded time.
const newestFirst = (a, b) => (time(b.interactionDate || b.createdAt) - time(a.interactionDate || a.createdAt))
  || (time(b.createdAt) - time(a.createdAt));

const lagosStamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const generatedText = (report) => `Generated ${lagosStamp.format(report.generatedAt)} (Lagos time) by ${report.generatedBy}`;

const codeGroup = (code) => (Object.entries(SERVICE_CODE_GROUPS).find(([, codes]) => codes.includes(code)) || [''])[0];

// ---------- the completeness scope (shared with the projects list filter saberYear) ----------

// Projects of Investor-type investors checked for year `year` (null = every
// such project): the investor's first contact is in the year, or an officer
// log happened in the year on the project, or at investor level (no project)
// on its investor. A project log touches that project only.
const completenessScope = ({
  records, projects, logs, year,
}) => {
  const investorById = new Map(records.map((r) => [String(r._id), r]));
  const touchedProjects = new Set();
  const touchedInvestors = new Set();
  logs.filter((l) => inYear(l.interactionDate, year)).forEach((l) => {
    if (l.project) touchedProjects.add(idOf(l.project));
    else if (l.investor) touchedInvestors.add(idOf(l.investor));
  });
  return projects.filter((p) => {
    const inv = investorById.get(idOf(p.investor));
    if (!inv || !isInvestorType(inv)) return false;
    if (year === null) return true;
    return inYear(inv.firstContactDate, year) || touchedProjects.has(String(p._id)) || touchedInvestors.has(String(inv._id));
  });
};

// Ids of the projects in the completeness scope of `year` (the saberYear list filter).
const saberScopeProjectIds = async (year) => {
  const [records, projects, logs] = await Promise.all([
    Investor.find({}).select('organisationType firstContactDate').lean(),
    InvestmentProject.find({}).select('investor').lean(),
    InteractionLog.find(OFFICER_LOG).select('investor project interactionDate').lean(),
  ]);
  return completenessScope({
    records, projects, logs, year,
  }).map((p) => p._id);
};

// T1–T11 cells of one project ({ T1: true|false, ... }).
const projectChecks = (p, inv, statusIds, t10Latest) => {
  const gaps = recordGaps(inv || {});
  return {
    T1: !!(inv && has(inv.investorName)),
    T2: has(p.description),
    T3: resolveSector(p.sector).sector !== NOT_RECORDED,
    T4: !!inv && !gaps.country,
    // Same rule as the dashboard: a value > 0; no currency counts as NGN.
    T5: hasValue(p),
    // Same rule as the dashboard's hasJobs: > 0 (0 is the schema default).
    T7: typeof p.estimatedNumberOfJobs === 'number' && p.estimatedNumberOfJobs > 0,
    T6: has(p.location),
    T8a: !!(inv && has(inv.keyContactPerson)),
    T8b: !!(inv && has(inv.phoneNumber)),
    T8c: !!(inv && has(inv.email)),
    T9: !!(p.lifecycleStatus && statusIds.has(String(p.lifecycleStatus))),
    T10: !!t10Latest,
    T11: !!inv && !gaps.leadSource && !gaps.firstContactDate,
  };
};

// ---------- builder ----------

// { year, generatedAt, generatedBy, summary, links, completeness, services,
//   credit, announcements, issues }. `user`: who asked (named in every file).
const buildSaberReport = async ({ year = null, user = null, generatedAt = new Date() } = {}) => {
  // Each section uses the year range of the metric it matches.
  const annFilter = year === null ? {} : { announcementDate: announcementYearRange(year) };
  const issueFilter = year === null ? {} : { dateReported: yearRange(year) };
  const [records, projects, logs, statuses, issuesSummary, annSummary, countedCondition] = await Promise.all([
    Investor.find({}).select('investorName organisationType sector countryOfOrigin leadSource firstContactDate keyContactPerson phoneNumber email createdAt updatedAt').lean(),
    InvestmentProject.find({}).select('projectTitle description investor lifecycleStatus estimatedValue currency estimatedNumberOfJobs sector location createdAt updatedAt').lean(),
    InteractionLog.find(OFFICER_LOG).select(`${LOG_FIELDS} description documents documentUrl updatedAt`).lean(),
    loadStatuses(),
    issuesMetric(year),
    announcementsMetric(year),
    countedAnnouncementCondition(),
  ]);
  const investorById = new Map(records.map((r) => [String(r._id), r]));
  const projectById = new Map(projects.map((p) => [String(p._id), p]));
  const statusIds = new Set(statuses.map((s) => String(s._id)));
  // The log's investor, or (a project-only log) its project's investor.
  const investorOfLog = (l) => {
    const direct = investorById.get(idOf(l.investor));
    if (direct) return direct;
    const project = l.project ? projectById.get(idOf(l.project)) : null;
    return project ? investorById.get(idOf(project.investor)) : undefined;
  };

  // Officer logs with a happened date in the year: the dashboard's services scope.
  const logsInYear = logs.filter((l) => inYear(l.interactionDate, year));
  const services = servicesByCode(logsInYear);

  // Evidence: the first file on the interaction (its own documents, else a
  // library file linked to it, else its legacy document link).
  const libraryFiles = logsInYear.length ? await EvidenceFile.find({ 'links.interaction': { $in: logsInYear.map((l) => l._id) } })
    .select('folder fileName uploadedAt links.interaction').sort({ uploadedAt: 1, _id: 1 }).lean() : [];
  const libraryByLog = new Map();
  libraryFiles.forEach((f) => (f.links || []).forEach((link) => {
    const k = idOf(link.interaction);
    if (k && !libraryByLog.has(k)) libraryByLog.set(k, f);
  }));
  const evidenceOf = (l) => {
    const docs = [...(l.documents || [])].sort((a, b) => time(a.uploadedAt) - time(b.uploadedAt));
    if (docs.length) {
      const inv = investorOfLog(l);
      // An orphan log (no investor found) has no page to open.
      return { file: docs[0].fileName || '', link: inv ? `${APP_URL()}/investors/${inv._id}#interaction-${l._id}-document-${docs[0]._id}` : NONE };
    }
    const f = libraryByLog.get(String(l._id));
    if (f) return { file: f.fileName || '', link: `${APP_URL()}/evidence/${f.folder}#file-${f._id}` };
    if (has(l.documentUrl)) return { file: 'Document link', link: text(l.documentUrl) };
    return { file: '', link: NONE };
  };
  const logRow = (l) => {
    const inv = investorOfLog(l);
    const ev = evidenceOf(l);
    const project = l.project ? projectById.get(idOf(l.project)) : null;
    return {
      id: String(l._id),
      date: logDay(l),
      name: inv ? inv.investorName || '' : '',
      organisationType: typeLabel(inv),
      project: project ? project.projectTitle || '' : '',
      codes: [...new Set((l.serviceCodes || []).filter((c) => SERVICE_CODES.includes(c)))],
      creditLinkage: isCreditLinkage(l),
      description: l.description || '',
      evidenceFile: ev.file,
      evidenceLink: ev.link,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  };

  // 2. Services by code: the dashboard count, and up to 3 examples (newest first).
  const sortedInYear = [...logsInYear].sort(newestFirst);
  const serviceCodes = services.codes.map(({ code, count }) => ({
    code,
    group: codeGroup(code),
    count,
    examples: sortedInYear.filter((l) => (l.serviceCodes || []).includes(code)).slice(0, EXAMPLES_PER_CODE).map(logRow),
  }));

  // 3. Credit linkage: the same predicate as the count.
  const creditRows = sortedInYear.filter(isCreditLinkage).map(logRow);

  // 1. Completeness.
  // T10: the latest coded officer log dated on or before the end of the year:
  // a project log for its project, an investor-level log for all its projects.
  const yearEnd = year === null ? null : new Date(`${year + 1}-01-01T00:00:00.000Z`).getTime();
  const t10ByProject = new Map();
  const t10ByInvestor = new Map();
  const later = (m, k, d) => { if (k && (!m.has(k) || time(m.get(k)) < time(d))) m.set(k, d); };
  logs.forEach((l) => {
    if (!l.interactionDate || !isCoded(l)) return;
    if (yearEnd !== null && time(l.interactionDate) >= yearEnd) return;
    if (l.project) later(t10ByProject, idOf(l.project), l.interactionDate);
    else if (l.investor) later(t10ByInvestor, idOf(l.investor), l.interactionDate);
  });
  const completenessRows = completenessScope({
    records, projects, logs, year,
  })
    .map((p) => {
      const inv = investorById.get(idOf(p.investor));
      const t10Latest = [t10ByProject.get(String(p._id)), t10ByInvestor.get(String(inv._id))]
        .filter(Boolean).sort((x, y) => time(y) - time(x))[0] || null;
      const checks = projectChecks(p, inv, statusIds, t10Latest);
      return {
        id: String(p._id),
        project: p.projectTitle || '',
        investor: inv.investorName || '',
        firstContactDate: inv.firstContactDate || null,
        checks,
        t10Latest,
        missing: FIELDS.filter(([k]) => !checks[k]).map(([k]) => k),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    })
    .sort((x, y) => byText(x.investor, y.investor) || byText(x.project, y.project));
  const fieldTotals = Object.fromEntries(FIELDS.map(([k]) => [k, completenessRows.filter((r) => !r.checks[k]).length]));
  const complete = completenessRows.filter((r) => r.missing.length === 0).length;
  const cells = completenessRows.length * FIELDS.length;
  const filled = cells - Object.values(fieldTotals).reduce((n, v) => n + v, 0);

  // 4. Announcements in the year; "counts" = the DLR 4.4 rule (announcementsMetric).
  const [announcements, countedIds] = await Promise.all([
    InvestmentAnnouncement.find(annFilter)
      .populate({ path: 'project', select: 'projectTitle investor', populate: { path: 'investor', select: 'investorName organisationType' } })
      .populate({ path: 'supportingInteractions', select: 'interactionDate createdAt description', options: { retainNullValues: true } })
      .sort({ announcementDate: -1, _id: -1 }).lean(),
    InvestmentAnnouncement.find({ ...annFilter, oysipaNamed: true, ...countedCondition }).distinct('_id'),
  ]);
  const counted = new Set(countedIds.map(String));
  const announcementRows = announcements.map((a) => {
    const linked = a.supportingInteractions || [];
    return {
      id: String(a._id),
      date: isoDay(a.announcementDate),
      outlet: a.outlet || '',
      url: a.url || '',
      archivedCopyUrl: a.archivedCopyUrl || '',
      oysipaNamed: !!a.oysipaNamed,
      oysipaRoleText: a.oysipaRoleText || '',
      project: a.project ? a.project.projectTitle || '' : '',
      investor: a.project && a.project.investor ? a.project.investor.investorName || '' : '',
      supporting: linked.filter(Boolean).sort(newestFirst).map((l) => ({ date: logDay(l), description: l.description || '' })),
      // Linked interactions that no longer exist (deleted).
      supportingMissing: linked.filter((l) => !l).length,
      counts: counted.has(String(a._id)),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });

  // 5. Issues reported in the year; % resolved = issuesMetric (DLR 4.5).
  const issues = await InvestorIssue.find(issueFilter)
    .populate({ path: 'investor', select: 'investorName' })
    .populate({ path: 'project', select: 'projectTitle' })
    .sort({ dateReported: -1, _id: -1 }).lean();
  const issueRows = issues.map((i) => {
    const actionDates = (i.actions || []).map((x) => x.date).filter(Boolean).sort((x, y) => time(y) - time(x));
    let resolvedDate = isoDay(i.resolvedDate);
    if (!resolvedDate && i.status === RESOLVED) resolvedDate = NOT_RECORDED_TEXT;
    return {
      id: String(i._id),
      reference: i.reference || i.importRef || '',
      dateReported: isoDay(i.dateReported),
      investor: i.investor ? i.investor.investorName || '' : '',
      project: (i.project && i.project.projectTitle) || i.projectText || '',
      category: i.category || '',
      mdas: (i.mdaResponsible || []).map((c) => (mdaByCode(c) ? mdaByCode(c).name : c)),
      status: i.status || '',
      resolvedDate,
      latestActionDate: actionDates.length ? isoDay(actionDates[0]) : '',
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  });

  const generatedBy = user ? `${user.name || user.email || 'unknown user'}${user.role ? ` (${user.role})` : ''}` : 'system';
  const shareStatuses = ISSUE_STATUSES.filter((st) => st !== WITHDRAWN);
  const yearQs = year === null ? [] : [['year', String(year)]];
  const qs = (pairs) => new URLSearchParams(pairs).toString();
  return {
    year,
    generatedAt,
    generatedBy,
    summary: {
      projectsChecked: completenessRows.length,
      projectsComplete: complete,
      completeShare: completenessRows.length ? complete / completenessRows.length : null,
      fieldsFilledShare: cells ? filled / cells : null,
      interactions: services.interactions,
      servicesTagged: services.tagged,
      creditLinkage: services.creditLinkage,
      announcements: announcementRows.length,
      announcementsCounted: annSummary.counted,
      // Bands are for one year (DLR targets); none for all years.
      announcementBand: year === null ? null : annSummary.band,
      issues: issuesSummary.total,
      issuesReported: issueRows.length,
      issuesResolved: issuesSummary.resolved,
      issuesWithdrawn: issuesSummary.withdrawn,
      issuesResolvedShare: issuesSummary.share,
      issuesBand: year === null ? null : issuesSummary.band,
    },
    // List links (11.15 filters) behind each summary card: same rows as the counts.
    links: {
      completeness: year === null ? '/projects?organisationType=Investor' : `/projects?saberYear=${year}`,
      services: servicesLink(year),
      credit: creditLinkageLink(year),
      announcements: `/announcements?${qs([...yearQs, ['oysipaNamed', 'true'], ['counted', '1']])}`,
      issues: `/issues?${qs([...yearQs, ...shareStatuses.map((st) => ['status', st])])}`,
    },
    completeness: {
      rows: completenessRows, totals: fieldTotals, checked: completenessRows.length, complete,
    },
    services: {
      codes: serviceCodes, interactions: services.interactions, tagged: services.tagged, creditLinkage: services.creditLinkage,
    },
    credit: { rows: creditRows },
    announcements: { rows: announcementRows, counted: annSummary.counted, band: annSummary.band },
    issues: { rows: issueRows, metric: issuesSummary },
  };
};

// ---------- CSV parts ----------

const joined = (list) => (Array.isArray(list) ? list.filter(Boolean).join('; ') : '');
const supportingText = (r) => [
  ...r.supporting.map((s) => `${s.date}: ${s.description}`),
  ...(r.supportingMissing ? [`${r.supportingMissing} linked interaction${r.supportingMissing === 1 ? '' : 's'} missing (deleted)`] : []),
].join(' | ');

// The lines on top of every file.
const preamble = (report, part) => [
  [CONFIDENTIAL],
  [`SABER report (DLI 4): ${PART_TITLES[part]}`],
  [`Year: ${yearText(report.year)} (by happened date)`],
  [generatedText(report)],
  [],
];

const LOG_COLUMNS = [
  ['Happened date', (r) => r.date],
  ['Investor or intermediary', (r) => r.name],
  ['Organisation type', (r) => r.organisationType],
  ['Project', (r) => r.project],
  ['SABER codes', (r) => joined(r.codes)],
  ['Credit linkage', (r) => yesNo(r.creditLinkage)],
  ['Description', (r) => r.description],
  ['Evidence file', (r) => r.evidenceFile],
  ['Evidence link', (r) => r.evidenceLink],
  ['Recorded (createdAt)', (r) => isoTime(r.createdAt)],
  ['Updated (updatedAt)', (r) => isoTime(r.updatedAt)],
  ['Record id', (r) => r.id],
];

const ANNOUNCEMENT_COLUMNS = [
  ['Announcement date', (r) => r.date],
  ['Outlet', (r) => r.outlet],
  ['Link', (r) => r.url],
  ['Archived copy', (r) => r.archivedCopyUrl],
  ['OYSIPA named', (r) => yesNo(r.oysipaNamed)],
  ['OYSIPA role', (r) => r.oysipaRoleText],
  ['Project', (r) => r.project],
  ['Investor', (r) => r.investor],
  ['Supporting interactions', supportingText],
  ['Counts for DLR 4.4', (r) => yesNo(r.counts)],
  ['Recorded (createdAt)', (r) => isoTime(r.createdAt)],
  ['Updated (updatedAt)', (r) => isoTime(r.updatedAt)],
  ['Record id', (r) => r.id],
];

const ISSUE_COLUMNS = [
  ['Reference', (r) => r.reference],
  ['Date reported', (r) => r.dateReported],
  ['Investor', (r) => r.investor],
  ['Project', (r) => r.project],
  ['Category', (r) => r.category],
  ['MDA(s)', (r) => joined(r.mdas)],
  ['Status', (r) => r.status],
  ['Resolved date', (r) => r.resolvedDate],
  ['Latest action date', (r) => r.latestActionDate],
  ['Recorded (createdAt)', (r) => isoTime(r.createdAt)],
  ['Updated (updatedAt)', (r) => isoTime(r.updatedAt)],
  ['Record id', (r) => r.id],
];

const COMPLETENESS_HEADER = ['Investor', 'Project', ...FIELDS.map(([, label]) => label), 'T10 latest date', 'Missing fields', 'First contact date (happened)', 'Recorded (createdAt)', 'Updated (updatedAt)', 'Record id'];
const SERVICES_HEADER = ['Code', 'Group', 'Interactions in year', 'Example', ...LOG_COLUMNS.map(([h]) => h)];
// Column header row of each CSV part.
const CSV_HEADERS = {
  completeness: COMPLETENESS_HEADER,
  services: SERVICES_HEADER,
  credit: LOG_COLUMNS.map(([h]) => h),
  announcements: ANNOUNCEMENT_COLUMNS.map(([h]) => h),
  issues: ISSUE_COLUMNS.map(([h]) => h),
};

const table = (columns, rows) => [columns.map(([h]) => h), ...rows.map((r) => columns.map(([, v]) => v(r)))];

// Data rows per part (the audit row counts): the services part counts its example rows.
const rowCounts = (report) => ({
  completeness: report.completeness.rows.length,
  services: report.services.codes.reduce((n, c) => n + c.examples.length, 0),
  credit: report.credit.rows.length,
  announcements: report.announcements.rows.length,
  issues: report.issues.rows.length,
});

// { csv, rowCount } of one CSV part.
const csvPart = (report, part) => {
  const head = preamble(report, part);
  const s = report.summary;
  const rowCount = rowCounts(report)[part];
  if (part === 'completeness') {
    const { rows, totals } = report.completeness;
    const body = rows.map((r) => [
      r.investor, r.project, ...FIELDS.map(([k]) => (r.checks[k] ? OK : MISSING)),
      isoDay(r.t10Latest), r.missing.length, isoDay(r.firstContactDate), isoTime(r.createdAt), isoTime(r.updatedAt), r.id,
    ]);
    return {
      rowCount,
      csv: toCsv([
        ...head,
        ['Scope: projects of investors (organisation type Investor) first contacted in the year, or with an officer interaction in the year on the project or at investor level. Intermediaries and Promotion agents are left out.'],
        [RULES_NOTE],
        COMPLETENESS_HEADER,
        ...body,
        [],
        ['Total MISSING', `${rows.length} projects`, ...FIELDS.map(([k]) => totals[k]), '', rows.reduce((n, r) => n + r.missing.length, 0)],
        ['Projects complete', `${s.projectsComplete} of ${s.projectsChecked}`, pct(s.completeShare)],
        ['Fields filled', pct(s.fieldsFilledShare)],
      ]),
    };
  }
  if (part === 'services') {
    const body = [];
    report.services.codes.forEach((c) => {
      if (!c.examples.length) body.push([c.code, c.group, c.count, '', ...LOG_COLUMNS.map(() => '')]);
      c.examples.forEach((e, i) => body.push([c.code, c.group, c.count, i + 1, ...LOG_COLUMNS.map(([, v]) => v(e))]));
    });
    return {
      rowCount,
      csv: toCsv([
        ...head,
        ['Count = officer interactions with a happened date in the year carrying the code (as the dashboard). Up to 3 examples per code, newest first.'],
        SERVICES_HEADER,
        ...body,
        [],
        ['Interactions in year', report.services.interactions],
        ['Tagged with a SABER code', report.services.tagged],
        ['Credit linkage', report.services.creditLinkage],
      ]),
    };
  }
  if (part === 'credit') {
    const { rows } = report.credit;
    return {
      rowCount,
      csv: toCsv([...head, ...table(LOG_COLUMNS, rows), [], ['Credit-linkage interactions', rows.length]]),
    };
  }
  if (part === 'announcements') {
    const { rows } = report.announcements;
    return {
      rowCount,
      csv: toCsv([
        ...head,
        ...table(ANNOUNCEMENT_COLUMNS, rows),
        [],
        ['Announcements in year', rows.length],
        ['Counted for DLR 4.4 (OYSIPA named; Intermediary / Promotion agent projects left out)', s.announcementsCounted],
      ]),
    };
  }
  if (part === 'issues') {
    const { rows } = report.issues;
    return {
      rowCount,
      csv: toCsv([
        ...head,
        ...table(ISSUE_COLUMNS, rows),
        [],
        ['Issues reported in year', rows.length],
        ['Counted for DLR 4.5 (Withdrawn left out)', s.issues],
        ['Resolved', s.issuesResolved],
        ['% resolved', pct(s.issuesResolvedShare)],
      ]),
    };
  }
  throw new Error(`Unknown CSV part: ${part}`);
};

const fileName = (year, part) => `saber-report-${yearLabel(year)}-${part}.${part === 'pdf' ? 'pdf' : (part === 'all' ? 'zip' : 'csv')}`;

module.exports = {
  CONFIDENTIAL,
  OK,
  MISSING,
  NONE,
  FIELDS,
  RULES_NOTE,
  CSV_PARTS,
  CSV_HEADERS,
  PARTS,
  PART_TITLES,
  LOG_COLUMNS,
  ANNOUNCEMENT_COLUMNS,
  ISSUE_COLUMNS,
  completenessScope,
  saberScopeProjectIds,
  buildSaberReport,
  csvPart,
  rowCounts,
  fileName,
  generatedText,
  yearText,
  supportingText,
  pct,
  yesNo,
  isoDay,
  isoTime,
};
