// Helpers of the investor page (story 11.16): the activity timeline, the
// record completeness panel and the Files tab.
import { issueReference } from '../constants/issueFields';
import { dateLine } from './dates';

const SYSTEM_CATEGORY = 'System Update';

const timeOf = (record, field) => {
  const t = new Date(record?.[field] || record?.createdAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// The investor's activity, newest first: interactions, lifecycle status
// changes (the System Update logs), issues and announcements.
export const buildActivity = ({ logs = [], issues = [], announcements = [] }) => [
  ...logs.map((l) => {
    const system = l.category === SYSTEM_CATEGORY;
    const files = (l.documents || []).length + (l.evidenceFiles || []).length;
    return {
      key: `log-${l._id}`,
      kind: system ? 'status' : 'interaction',
      title: system ? 'Stage changed' : (l.category || 'Interaction'),
      when: dateLine(l, 'interactionDate'),
      by: l.loggedBy?.name || '',
      text: l.description,
      tags: [
        ...(l.project?.projectTitle ? [{ label: l.project.projectTitle }] : []),
        ...[...new Set(l.serviceCodes || [])].map((c) => ({ label: c, kind: 'code' })),
        ...(l.creditLinkage ? [{ label: 'Credit linkage' }] : []),
        ...(files ? [{ label: files === 1 ? '1 file' : `${files} files` }] : []),
      ],
      time: timeOf(l, 'interactionDate'),
    };
  }),
  ...issues.map((i) => ({
    key: `issue-${i._id}`,
    kind: 'issue',
    title: `Issue registered: ${issueReference(i) || i.category || 'issue'}`,
    to: `/issues/${i._id}`,
    when: dateLine(i, 'dateReported'),
    by: '',
    text: i.description,
    tags: [...(i.category ? [{ label: i.category }] : []), { label: i.status, status: true }],
    time: timeOf(i, 'dateReported'),
  })),
  ...announcements.map((a) => ({
    key: `announcement-${a._id}`,
    kind: 'announcement',
    title: 'Public announcement',
    to: `/announcements/${a._id}`,
    when: dateLine(a, 'announcementDate'),
    by: a.outlet || '',
    text: a.oysipaRoleText || a.project?.projectTitle || '',
    tags: a.oysipaNamed ? [{ label: 'OYSIPA named', status: true }] : [],
    time: timeOf(a, 'announcementDate'),
  })),
].sort((a, b) => b.time - a.time);

// T1–T11 of SABER, T8 counted once (contact name, phone and email).
export const COMPLETENESS_FIELDS = [
  ['T1', 'investing company'],
  ['T2', 'project description'],
  ['T3', 'project sector'],
  ['T4', 'country'],
  ['T5', 'estimated value'],
  ['T6', 'location'],
  ['T7', 'estimated jobs'],
  ['T8', 'contact name, phone and email'],
  ['T9', 'lifecycle status'],
  ['T10', 'service with a SABER code'],
  ['T11', 'lead source and first contact'],
];
const T8_PARTS = { T8a: 'contact name', T8b: 'phone', T8c: 'email' };

// From the fill-gaps answer for one investor (GET /api/fill-gaps?year=all&investor=id):
// → { checked, missing: [{ key, label }], complete } or null when unknown.
export const investorCompleteness = (data) => {
  if (!data || !data.summary || typeof data.summary.checked !== 'number') return null;
  const keys = new Set();
  (data.groups || []).forEach((g) => {
    (g.missing || []).forEach((k) => keys.add(k));
    (g.projects || []).forEach((p) => (p.missing || []).forEach((k) => keys.add(k)));
  });
  const t8 = Object.keys(T8_PARTS).filter((k) => keys.has(k));
  const missing = COMPLETENESS_FIELDS.filter(([k]) => (k === 'T8' ? t8.length > 0 : keys.has(k))).map(([k, label]) => ({
    key: k,
    label: k === 'T8' && t8.length < 3 ? `${k} ${t8.map((p) => T8_PARTS[p]).join(', ')}` : `${k} ${label}`,
  }));
  return { checked: data.summary.checked, missing, complete: COMPLETENESS_FIELDS.length - missing.length };
};

const idOf = (ref) => (ref && typeof ref === 'object' ? String(ref._id || '') : String(ref || ''));
const fileTime = (f) => new Date(f.documentDate || f.uploadedAt || 0).getTime() || 0;

// Documents attached to the investor's interactions (from the logs the page
// already has), newest first. The legacy public documentUrl is listed too.
export const interactionDocuments = (logs = []) => logs.flatMap((log) => [
  ...(log.documentUrl ? [{
    key: `url-${log._id}`, fileName: 'Linked document', url: log.documentUrl, log, date: log.interactionDate || log.createdAt,
  }] : []),
  ...(log.documents || []).map((d) => ({
    key: `doc-${d._id}`, fileName: d.fileName, doc: d, log, date: d.documentDate || d.uploadedAt,
  })),
]).sort((a, b) => (new Date(b.date || 0).getTime() || 0) - (new Date(a.date || 0).getTime() || 0));

// Library files tagged to the investor (any link to it), plus library files
// linked to its interactions; each file once, newest first.
export const libraryFilesOf = (files = [], investorId, logs = []) => {
  const byId = new Map();
  files.filter((f) => (f.links || []).some((l) => idOf(l.investor) === String(investorId))).forEach((f) => byId.set(String(f._id), f));
  logs.forEach((l) => (l.evidenceFiles || []).forEach((f) => { if (!byId.has(String(f._id))) byId.set(String(f._id), f); }));
  return [...byId.values()].sort((a, b) => fileTime(b) - fileTime(a));
};

