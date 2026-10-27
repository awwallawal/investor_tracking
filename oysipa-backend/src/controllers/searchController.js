// Global search (story 11.15): GET /api/search?q= → the top 5 matches and the
// total count per record type, with a link to each record and a "See all" link
// to the list filtered by the same q. Matching uses the list builders
// (services/listQueries.js), so "See all" lists exactly `count` rows.
// Every role may list these records; the change log is never searched.
const InvestmentProject = require('../models/InvestmentProject');
const Investor = require('../models/InvestorModel');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const { normaliseSearch } = require('../services/investorSearch');
const {
  qText,
  buildInvestors, buildProjects, buildIssues, buildAnnouncements, buildInteractions, buildEvidence,
} = require('../services/listQueries');
const { isoDay } = require('../services/csv');

const TOP = 5;
const MIN_LENGTH = 2;
const MAX_TEXT = 100;
const INTERACTION_Q = 40;

const short = (s, n = MAX_TEXT) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const qs = (q) => new URLSearchParams({ q }).toString();
const join = (...parts) => parts.filter(Boolean).join(' · ');

// One group: count + top items via the list's builder.
const group = async ({
  type, label, build, model, list, query, sort, populate, item, ctx,
}) => {
  const built = await build({ q: query }, ctx);
  if (built.empty) {
    return {
      type, label, count: 0, items: [], seeAll: `/${list}?${qs(query)}`,
    };
  }
  let finder = model.find(built.filter).sort(sort).limit(TOP);
  (populate || []).forEach((p) => { finder = finder.populate(p); });
  const [count, docs] = await Promise.all([model.countDocuments(built.filter), finder.lean()]);
  return {
    type, label, count, items: docs.map(item), seeAll: `/${list}?${qs(query)}`,
  };
};

exports.search = async (req, res) => {
  try {
    // First value only, cut to 200 characters (as the lists).
    const q = qText(req.query && req.query.q);
    if (normaliseSearch(q).replace(/\s/g, '').length < MIN_LENGTH) {
      return res.status(400).json({ message: `Type at least ${MIN_LENGTH} characters to search.` });
    }
    const ctx = { user: req.user };
    const groups = await Promise.all([
      group({
        type: 'investors',
        label: 'Investors',
        list: 'investors',
        build: buildInvestors,
        model: Investor,
        query: q,
        sort: { investorName: 1 },
        item: (d) => ({
          _id: d._id, title: d.investorName, subtitle: join(d.sector, d.countryOfOrigin), to: `/investors/${d._id}`,
        }),
        ctx,
      }),
      group({
        type: 'projects',
        label: 'Projects',
        list: 'projects',
        build: buildProjects,
        model: InvestmentProject,
        query: q,
        sort: { projectTitle: 1 },
        populate: [{ path: 'investor', select: 'investorName' }],
        item: (d) => ({
          _id: d._id, title: d.projectTitle, subtitle: join(d.investor && d.investor.investorName, d.location), to: `/projects/${d._id}`,
        }),
        ctx,
      }),
      group({
        type: 'issues',
        label: 'Issues',
        list: 'issues',
        build: buildIssues,
        model: InvestorIssue,
        query: q,
        sort: { dateReported: -1, createdAt: -1 },
        populate: [{ path: 'investor', select: 'investorName' }],
        item: (d) => ({
          _id: d._id,
          title: join(d.reference || d.importRef, d.investor && d.investor.investorName) || 'Issue',
          subtitle: join(d.status, short(d.description)),
          to: `/issues/${d._id}`,
        }),
        ctx,
      }),
      group({
        type: 'announcements',
        label: 'Announcements',
        list: 'announcements',
        build: buildAnnouncements,
        model: InvestmentAnnouncement,
        query: q,
        sort: { announcementDate: -1, createdAt: -1 },
        populate: [{ path: 'project', select: 'projectTitle investor', populate: { path: 'investor', select: 'investorName' } }],
        item: (d) => ({
          _id: d._id,
          title: d.outlet,
          subtitle: join(d.project && d.project.projectTitle, d.project && d.project.investor && d.project.investor.investorName, isoDay(d.announcementDate)),
          to: `/announcements/${d._id}`,
        }),
        ctx,
      }),
      group({
        type: 'interactions',
        label: 'Interactions',
        list: 'interactions',
        build: buildInteractions,
        model: InteractionLog,
        query: q,
        sort: { interactionDate: -1, createdAt: -1 },
        populate: [{ path: 'investor', select: 'investorName' }, { path: 'project', select: 'projectTitle investor' }],
        // Opens the interactions list on this log: its description (first 40
        // characters) and its investor (the log's, else its project's).
        item: (d) => {
          const investorId = (d.investor && d.investor._id) || (d.project && d.project.investor) || null;
          const params = [['q', String(d.description || '').slice(0, INTERACTION_Q).trim()]];
          if (investorId) params.push(['investor', String(investorId)]);
          const to = `/interactions?${new URLSearchParams(params).toString()}`;
          return {
            _id: d._id,
            title: short(d.description),
            subtitle: join(d.investor && d.investor.investorName, d.project && d.project.projectTitle, isoDay(d.interactionDate || d.createdAt)),
            to,
          };
        },
        ctx,
      }),
      group({
        type: 'files',
        label: 'Evidence files',
        list: 'evidence',
        build: buildEvidence,
        model: EvidenceFile,
        query: q,
        sort: { fileName: 1 },
        populate: [{ path: 'folder', select: 'name' }],
        item: (d) => ({
          _id: d._id,
          title: d.fileName,
          subtitle: join(d.folder && d.folder.name, d.what),
          to: d.folder && d.folder._id ? `/evidence/${d.folder._id}?${qs(d.fileName)}` : `/evidence?${qs(d.fileName)}`,
        }),
        ctx,
      }),
    ]);
    return res.status(200).json({ q, groups });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
