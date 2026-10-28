// Fill the gaps (story 11.17): the T1–T11 worklist. The incomplete projects in
// the SABER report's completeness scope, grouped by investor: the investor's
// fields (T8a/T8b/T8c/T11) and its investor-level untagged logs appear once,
// with its project cards (T5/T6/T7, project-level logs) under it. The scope and
// the T-checks are the report's own (saberReport.completenessFor); nothing is
// computed here a second way. Saving never goes through this module: the page
// uses the existing audited routes (PUT /api/projects/:id, PUT /api/investors/:id,
// PATCH /api/interactions/:id).
const mongoose = require('mongoose');
const User = require('../models/User');
const {
  completenessFor, FIELDS, isCoded, yearEndOf, newestFirst,
} = require('./saberReport');
const {
  officerCondition, listParam, qText, regexFor, firstParam,
} = require('./listQueries');
const { recordGaps } = require('./attention');
const { isAdminRole } = require('../middleware/accessHelpers');
const { isoDay, lagosIsoDay } = require('./csv');

// The fields a row can fix in place (the missing-field filter).
const FIXABLE = ['T5', 'T6', 'T7', 'T8a', 'T8b', 'T8c', 'T10', 'T11'];
// Fields of the investor record (shown once per investor).
const INVESTOR_KEYS = ['T1', 'T4', 'T8a', 'T8b', 'T8c', 'T11'];
const UNTAGGED_PER_ROW = 5;
const NOTHING = { _id: { $in: [] } };

const idOf = (ref) => (ref && typeof ref === 'object' && ref._id ? String(ref._id) : (ref ? String(ref) : ''));
const time = (d) => (d ? new Date(d).getTime() : 0);

// `officer`: "all" (or nothing) = every investor; otherwise the list filter's
// rule (me / unassigned / user ids). Values given but none usable (a bad id)
// → nothing, never a wider scope. → { investorFilter, officer }
const officerScope = (raw, user) => {
  const values = listParam(raw);
  if (!values.length || values.includes('all')) return { investorFilter: null, officer: 'all' };
  const parsed = officerCondition(values, user);
  if (!parsed) return { investorFilter: NOTHING, officer: 'none' };
  return { investorFilter: parsed.condition, officer: parsed.applied.join(',') };
};

// `investor=<id>` (story 11.16, the investor page's completeness panel): one
// investor's projects only, inside the officer scope. A bad id → nothing.
// → { investorFilter, investor }
const investorScope = (raw, investorFilter) => {
  const value = firstParam(raw);
  if (value === undefined || value === null || value === '') return { investorFilter, investor: null };
  if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) {
    return { investorFilter: NOTHING, investor: null };
  }
  const own = { _id: new mongoose.Types.ObjectId(value) };
  return { investorFilter: investorFilter ? { $and: [investorFilter, own] } : own, investor: value };
};

// Summary of the scope: the SABER report's completeness figures.
const summaryOf = (c) => ({
  checked: c.checked,
  complete: c.complete,
  completeShare: c.checked ? c.complete / c.checked : null,
  fieldsFilledShare: c.cells ? c.filled / c.cells : null,
  missing: c.totals,
});

// Untagged officer logs that would close T10 once tagged: dated on or before
// the end of the year. Project logs by project; investor-level logs (no
// project) by investor. Newest first, at most 5 each.
const untaggedLogs = (logs, year) => {
  const yearEnd = yearEndOf(year);
  const byProject = new Map();
  const byInvestor = new Map();
  const push = (m, k, l) => { if (!m.has(k)) m.set(k, []); m.get(k).push(l); };
  logs.forEach((l) => {
    if (isCoded(l) || !l.interactionDate) return;
    if (yearEnd !== null && time(l.interactionDate) >= yearEnd) return;
    if (l.project) push(byProject, idOf(l.project), l);
    else if (l.investor) push(byInvestor, idOf(l.investor), l);
  });
  const shape = (list) => (list || []).sort(newestFirst).slice(0, UNTAGGED_PER_ROW).map((l) => ({
    id: String(l._id),
    date: isoDay(l.interactionDate),
    recorded: lagosIsoDay(l.createdAt),
    category: l.category || '',
    description: l.description || '',
    // Codes already on the log (none is a SABER code): kept when tagging.
    serviceCodes: l.serviceCodes || [],
  }));
  return { ofProject: (id) => shape(byProject.get(id)), ofInvestor: (id) => shape(byInvestor.get(id)) };
};

// What the user may change on this investor's records: the write routes' rules
// (projectWriteAccess / investorWriteAccess, the lead-source lock).
const accessFor = (inv, user) => {
  const admin = isAdminRole(user && user.role);
  const me = user && user._id ? String(user._id) : '';
  return { canEdit: admin || (!!me && idOf(inv.assignedTo) === me), canEditLeadSource: admin };
};

// T11 parts missing on the investor (the recordGaps rule the check uses).
const t11Of = (inv) => {
  const gaps = recordGaps(inv);
  return { leadSource: gaps.leadSource, firstContact: gaps.firstContactDate };
};

// The missing keys of a project the user can close here. T11 counts only when
// every missing part of it is theirs to set (Staff cannot set the lead source).
const fixableKeys = (missing, inv, access) => {
  if (!access.canEdit) return [];
  return missing.filter((k) => {
    if (k === 'T11') return !t11Of(inv).leadSource || access.canEditLeadSource;
    return FIXABLE.includes(k);
  });
};

// query: { officer, investor, missing, q, count }; year resolved (number | null).
// → { year, officer, investor, missing, q, summary, total, groups } or, with count,
//   { year, officer, count } (projects with something the user can fix).
const buildFillGaps = async ({ year, query = {}, user }) => {
  const officerPart = officerScope(query.officer, user);
  const { investorFilter, investor } = investorScope(query.investor, officerPart.investorFilter);
  const { officer } = officerPart;
  const missing = [...new Set(listParam(query.missing, FIXABLE)
    .map((v) => FIXABLE.find((k) => k.toLowerCase() === v.toLowerCase()))
    .filter(Boolean))];
  const q = qText(query.q);
  const regex = q ? regexFor(q) : null;
  const countOnly = ['1', 'true'].includes(String(firstParam(query.count) || ''));

  const c = await completenessFor({
    year,
    investorFilter,
    investorFields: 'assignedTo',
    logFields: countOnly ? '' : 'description category createdAt',
  });
  const investorById = new Map(c.records.map((r) => [String(r._id), r]));
  const projectById = new Map(c.projects.map((p) => [String(p._id), p]));
  const investorOf = (r) => investorById.get(idOf(projectById.get(r.id).investor));

  let rows = c.rows.filter((r) => r.missing.length > 0);
  if (missing.length) rows = rows.filter((r) => missing.some((k) => r.missing.includes(k)));
  if (q) {
    rows = regex ? rows.filter((r) => {
      const p = projectById.get(r.id);
      const inv = investorOf(r);
      return [p.projectTitle, inv.investorName, p.location, inv.keyContactPerson].some((v) => typeof v === 'string' && regex.test(v));
    }) : [];
  }
  if (countOnly) {
    return { year, officer, count: rows.filter((r) => fixableKeys(r.missing, investorOf(r), accessFor(investorOf(r), user)).length > 0).length };
  }

  const officerIds = [...new Set(rows.map((r) => idOf(investorOf(r).assignedTo)).filter(Boolean))];
  const officers = officerIds.length ? await User.find({ _id: { $in: officerIds } }).select('name').lean() : [];
  const officerName = new Map(officers.map((u) => [String(u._id), u.name || '']));
  const untagged = untaggedLogs(c.logs, year);

  // Rows are sorted by investor then project: consecutive rows share a group.
  const groups = [];
  const groupOf = new Map();
  rows.forEach((r) => {
    const inv = investorOf(r);
    const invId = String(inv._id);
    const access = accessFor(inv, user);
    let g = groupOf.get(invId);
    if (!g) {
      const officerId = idOf(inv.assignedTo);
      g = {
        investor: {
          id: invId,
          name: inv.investorName || '',
          keyContactPerson: inv.keyContactPerson || '',
          phoneNumber: inv.phoneNumber || '',
          email: inv.email || '',
          leadSource: inv.leadSource || '',
          firstContactDate: isoDay(inv.firstContactDate) || '',
          t11: t11Of(inv),
        },
        officer: officerId ? { id: officerId, name: officerName.get(officerId) || '' } : null,
        ...access,
        // Investor fields are the same on every project of the investor.
        missing: INVESTOR_KEYS.filter((k) => r.missing.includes(k)),
        untagged: [],
        projects: [],
      };
      groupOf.set(invId, g);
      groups.push(g);
    }
    const p = projectById.get(r.id);
    const fixable = fixableKeys(r.missing, inv, access);
    if (r.missing.includes('T10') && !g.untaggedShown) {
      g.untagged = untagged.ofInvestor(invId);
      g.untaggedShown = true;
    }
    g.projects.push({
      id: r.id,
      title: p.projectTitle || '',
      estimatedValue: typeof p.estimatedValue === 'number' ? p.estimatedValue : null,
      currency: p.currency || null,
      location: p.location || '',
      estimatedNumberOfJobs: typeof p.estimatedNumberOfJobs === 'number' ? p.estimatedNumberOfJobs : null,
      missing: r.missing,
      // The user can close at least one of its gaps here (Save shown, badge counted).
      fixable: fixable.length > 0,
      untagged: r.missing.includes('T10') ? untagged.ofProject(r.id) : [],
    });
  });
  groups.forEach((g) => {
    delete g.untaggedShown;
    // The investor block has its own Save when one of its fields is theirs to fix.
    g.fixable = g.canEdit && g.missing.some((k) => (k === 'T11'
      ? !g.investor.t11.leadSource || g.canEditLeadSource
      : ['T8a', 'T8b', 'T8c'].includes(k))) || (g.canEdit && g.untagged.length > 0);
  });

  return {
    year,
    officer,
    investor,
    missing,
    q,
    summary: summaryOf(c),
    total: rows.length,
    groups,
  };
};

module.exports = {
  buildFillGaps, officerScope, investorScope, FIXABLE, INVESTOR_KEYS, UNTAGGED_PER_ROW, FIELDS,
};
