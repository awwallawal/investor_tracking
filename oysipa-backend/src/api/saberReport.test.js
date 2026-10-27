// Story 11.9: SABER report / verifier export (synthetic data only).
const zlib = require('zlib');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const fontkit = require('fontkit');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const EvidenceFolder = require('../models/EvidenceFolder');
const ChangeLog = require('../models/ChangeLog');
const { overview } = require('../services/metrics');
const {
  buildSaberReport, csvPart, CONFIDENTIAL, CSV_PARTS, CSV_HEADERS, FIELDS,
} = require('../services/saberReport');
const {
  buildPdf, pdfText, fontFiles, FONT_FILES,
} = require('../services/saberReportPdf');
const { EXPORT_ENTITY_IDS } = require('../controllers/exportController');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const lines = (text) => text.replace(/^\uFEFF/, '').split('\r\n');
const ALL_FIELDS = FIELDS.map(([k]) => k);

let f;

beforeEach(async () => {
  await Promise.all([
    InvestorIssue.collection.deleteMany({}), InvestmentAnnouncement.collection.deleteMany({}),
    EvidenceFile.collection.deleteMany({}), EvidenceFolder.collection.deleteMany({}),
    Investor.deleteMany({}), InvestmentProject.deleteMany({}), InteractionLog.deleteMany({}),
  ]);
  const staff = await User.create({ name: 'Report Staff', email: 'report.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });

  const inv = (fields) => Investor.create({ sector: 'Manufacturing', countryOfOrigin: 'Nigeria', ...fields });
  const alpha = await inv({
    investorName: 'Synthetic Alpha Foods', sector: 'Agribusiness', leadSource: 'Other', firstContactDate: day('2025-02-01'),
    keyContactPerson: 'Contact One', phoneNumber: '+2340000001', email: 'alpha@example.com',
  });
  const beta = await inv({
    investorName: 'Synthetic Beta Works', countryOfOrigin: 'Ghana', leadSource: 'Other', firstContactDate: day('2023-04-01'), keyContactPerson: 'Contact Two', phoneNumber: '+2340000002',
  });
  const gamma = await inv({ investorName: 'Synthetic Gamma Chamber', sector: 'Financial services', organisationType: 'Intermediary', firstContactDate: day('2025-03-01') });
  const delta = await inv({ investorName: 'Synthetic Delta Energy', countryOfOrigin: 'Kenya', firstContactDate: day('2022-01-01') });
  const idle = await inv({ investorName: 'Synthetic Idle Holdings', firstContactDate: day('2021-01-01') });
  const epsilon = await inv({ investorName: 'Synthetic Epsilon Mills', firstContactDate: day('2024-03-03') });
  const eta = await inv({ investorName: 'Synthetic Eta Farms', firstContactDate: day('2020-01-01') });
  const zeta = await inv({ investorName: 'Synthetic Zeta Steel', firstContactDate: day('2020-01-01') });

  const full = {
    description: 'Synthetic processing plant', sector: 'Agribusiness', estimatedValue: 1000, currency: 'NGN', estimatedNumberOfJobs: 10, location: 'Ibadan', lifecycleStatus: idea._id,
  };
  const proj = (title, investor, extra = {}) => InvestmentProject.create({
    projectTitle: title, investor: investor._id, ...full, ...extra,
  });
  const a1 = await proj('Alpha Plant', alpha);
  // Jobs 0 is the schema default: T7 MISSING.
  const a2 = await proj('Alpha Depot', alpha, { description: '', estimatedNumberOfJobs: 0 });
  const b1 = await proj('Beta Line', beta);
  const c1 = await proj('Gamma Fund', gamma);
  const d1 = await proj('Delta Solar', delta);
  await proj('Idle Clinic', idle);
  const e1 = await proj('Epsilon Mill', epsilon);
  const h1 = await proj('Eta Farm East', eta);
  const h2 = await proj('Eta Farm West', eta);
  const z1 = await proj('Zeta Works One', zeta);
  const z2 = await proj('Zeta Works Two', zeta);

  const doc = {
    fileName: 'minutes.pdf', mimeType: 'application/pdf', size: 4, uploadedBy: staff._id, uploadedAt: new Date(), provider: 'fake', key: 'k-minutes', resourceType: 'raw',
  };
  const log = (fields) => InteractionLog.create({
    loggedBy: staff._id, category: 'Meeting', description: 'Synthetic meeting', ...fields,
  });
  const logs = {
    m1a: await log({
      project: a1._id, interactionDate: day('2025-03-10'), serviceCodes: ['M1', 'I1'], creditLinkage: true, description: 'Credit meeting with a bank', documents: [doc],
    }),
    m1b: await log({ investor: alpha._id, interactionDate: day('2025-05-10'), serviceCodes: ['M1'] }),
    m1c: await log({ project: a1._id, interactionDate: day('2025-06-10'), serviceCodes: ['M1'] }),
    m1d: await log({
      project: b1._id, interactionDate: day('2025-07-10'), serviceCodes: ['M1'], description: 'Newest M1',
    }),
    m4: await log({
      investor: gamma._id, interactionDate: day('2025-04-15'), serviceCodes: ['M4'], description: 'Chamber roadshow',
    }),
    untagged: await log({ project: b1._id, interactionDate: day('2025-08-01') }),
    // Credit linkage without a SABER code: counted as credit linkage, not tagged.
    creditUntagged: await log({
      project: b1._id, interactionDate: day('2025-08-05'), creditLinkage: true, description: '=HYPERLINK("http://bad")',
    }),
    system: await log({
      project: a1._id, category: 'System Update', interactionDate: day('2025-08-02'), serviceCodes: ['A1'],
    }),
    undated: await log({ project: a1._id, serviceCodes: ['A2'] }),
    // Happened 2024, recorded 2026 (createdAt set below, independent of the clock).
    old: await log({
      project: d1._id, interactionDate: day('2024-09-09'), serviceCodes: ['A3'], creditLinkage: true,
    }),
    // A project log touches that project only (z2 stays out).
    zeta: await log({ project: z1._id, interactionDate: day('2025-02-02'), serviceCodes: ['A4'] }),
    // An investor-level log touches all its projects; its legacy document link is the evidence.
    eta: await log({
      investor: eta._id, interactionDate: day('2025-03-03'), serviceCodes: ['A5'], documentUrl: 'https://example.com/scan.pdf',
    }),
    // T10 negatives for 2024: a coded log dated later (2025) and an uncoded one in 2024.
    epsLater: await log({ project: e1._id, interactionDate: day('2025-09-09'), serviceCodes: ['A6'] }),
    epsUncoded: await log({ project: e1._id, interactionDate: day('2024-04-04') }),
  };
  await InteractionLog.collection.updateOne({ _id: logs.old._id }, { $set: { createdAt: day('2026-02-01'), updatedAt: day('2026-02-01') } });
  const folder = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes' });
  const libFile = await EvidenceFile.create({
    folder: folder._id,
    fileName: 'roadshow.jpg',
    mimeType: 'image/jpeg',
    size: 4,
    sha256: 'report-sha',
    provider: 'fake',
    key: 'k-roadshow',
    resourceType: 'image',
    uploadedBy: staff._id,
    uploadedAt: new Date(),
    links: [{
      investor: gamma._id, interaction: logs.m4._id, linkedBy: staff._id, linkedAt: new Date(),
    }],
  });

  const ann = (fields) => InvestmentAnnouncement.create({ outlet: 'Synthetic Daily', ...fields });
  const deletedLogId = new mongoose.Types.ObjectId();
  await ann({
    project: a1._id, announcementDate: day('2025-05-01'), oysipaNamed: true, oysipaRoleText: 'Facilitated land', url: 'https://example.com/a', supportingInteractions: [logs.m1a._id, deletedLogId],
  });
  await ann({
    project: c1._id, announcementDate: day('2025-06-01'), oysipaNamed: true, oysipaRoleText: 'Named',
  });
  await ann({ project: b1._id, announcementDate: day('2025-07-01'), oysipaNamed: false });
  await ann({
    project: d1._id, announcementDate: day('2024-07-01'), oysipaNamed: true, oysipaRoleText: 'Named',
  });

  const issue = (fields) => InvestorIssue.create({
    investor: alpha._id, dateRegistered: new Date(), category: 'other', description: 'Synthetic issue', ...fields,
  });
  await issue({
    dateReported: day('2025-02-02'), status: 'Resolved', resolution: 'Done', resolvedDate: day('2025-03-03'), reference: 'ISS-0001',
  });
  await issue({
    dateReported: day('2025-04-04'),
    status: 'Open',
    reference: 'ISS-0002',
    project: a1._id,
    mdaResponsible: ['OYSADA'],
    actions: [{
      date: day('2025-05-05'), note: 'Called the MDA', recordedBy: staff._id, recordedAt: new Date(),
    }, {
      date: day('2025-06-06'), note: 'Follow-up', recordedBy: staff._id, recordedAt: new Date(),
    }],
  });
  await issue({
    dateReported: day('2025-05-05'), status: 'Withdrawn', resolution: 'Withdrawn', reference: 'ISS-0003',
  });
  await issue({
    dateReported: day('2024-05-05'), status: 'Resolved', resolution: 'Done', reference: 'ISS-0004',
  });

  await ChangeLog.collection.deleteMany({});
  f = {
    staff, staffToken: sign(staff), alpha, beta, gamma, delta, eta, a1, a2, b1, c1, d1, e1, h1, h2, z1, z2, logs, libFile, folder,
  };
});
afterEach(() => jest.restoreAllMocks());

const DG_USER = { name: 'Synthetic DG', role: 'Director-General' };
const SCOPE_2025 = ['Alpha Depot', 'Alpha Plant', 'Beta Line', 'Epsilon Mill', 'Eta Farm East', 'Eta Farm West', 'Zeta Works One'];

describe('buildSaberReport', () => {
  it.each([2024, 2025, 2026, null])('counts equal the dashboard overview for year %p', async (year) => {
    const [report, dash] = await Promise.all([buildSaberReport({ year, user: DG_USER }), overview({ year })]);
    expect(report.summary.servicesTagged).toBe(dash.yearOnYear.services.tagged);
    expect(report.summary.creditLinkage).toBe(dash.yearOnYear.services.creditLinkage);
    expect(report.services.codes.map((c) => [c.code, c.count])).toEqual(dash.yearOnYear.services.codes.map((c) => [c.code, c.count]));
    expect(report.links.services).toBe(dash.yearOnYear.services.to);
    if (year !== null) {
      expect(report.summary.announcementsCounted).toBe(dash.saber.announcements.counted);
      expect(report.summary.issues).toBe(dash.saber.issues.total);
      expect(report.summary.issuesResolved).toBe(dash.saber.issues.resolved);
      expect(report.summary.issuesResolvedShare).toBe(dash.saber.issues.share);
    }
    // The section rows agree with the summary.
    expect(report.credit.rows).toHaveLength(report.summary.creditLinkage);
    expect(report.announcements.rows.filter((r) => r.counts)).toHaveLength(report.summary.announcementsCounted);
    expect(report.issues.rows.filter((r) => r.status !== 'Withdrawn')).toHaveLength(report.summary.issues);
  });

  it('all years: the sums of the years plus the undated logs', async () => {
    const years = await Promise.all([2024, 2025, 2026].map((year) => buildSaberReport({ year })));
    const all = await buildSaberReport({ year: null });
    const sum = (k) => years.reduce((n, r) => n + r.summary[k], 0);
    // The one undated coded log (A2) only counts in "all".
    expect(all.summary.servicesTagged).toBe(sum('servicesTagged') + 1);
    expect(all.summary.creditLinkage).toBe(sum('creditLinkage'));
    expect(all.summary.announcementsCounted).toBe(sum('announcementsCounted'));
    expect(all.summary.issues).toBe(sum('issues'));
    expect(all.summary.issuesResolved).toBe(sum('issuesResolved'));
    expect(all.summary).toMatchObject({ announcementBand: null, issuesBand: null });
    // All years: every project of an Investor-type investor (Gamma, an Intermediary, left out).
    expect(all.completeness.rows).toHaveLength(10);
    // The undated log shows its recorded day, marked.
    expect(all.services.codes.find((c) => c.code === 'A2').examples[0].date).toMatch(/^\d{4}-\d{2}-\d{2} \(recorded\)$/);
  });

  it('2025: sections, scope, examples, evidence and missing fields', async () => {
    const r = await buildSaberReport({ year: 2025, user: DG_USER });
    expect(r.summary).toMatchObject({
      servicesTagged: 8, creditLinkage: 2, interactions: 10, announcements: 3, announcementsCounted: 1, issues: 2, issuesResolved: 1, issuesResolvedShare: 0.5, announcementBand: 'basic',
    });

    // Scope: Alpha (first contact 2025) both projects; Beta, Epsilon, Zeta One
    // by a project log (Zeta Two stays out); both Eta projects by an
    // investor-level log; Gamma (Intermediary), Delta (2024) and Idle out.
    expect(r.completeness.rows.map((x) => x.project)).toEqual(SCOPE_2025);
    const row = (p) => r.completeness.rows.find((x) => x.project === p);
    expect(row('Alpha Depot').missing).toEqual(['T2', 'T7']);
    expect(row('Alpha Plant').missing).toEqual([]);
    expect(row('Alpha Plant').t10Latest.toISOString().slice(0, 10)).toBe('2025-06-10');
    // Depot has no log of its own; Alpha's investor-level log counts for T10.
    expect(row('Alpha Depot').t10Latest.toISOString().slice(0, 10)).toBe('2025-05-10');
    expect(row('Eta Farm West').t10Latest.toISOString().slice(0, 10)).toBe('2025-03-03');
    expect(row('Beta Line').checks.T8c).toBe(false);
    expect(r.completeness.totals).toMatchObject({ T2: 1, T7: 1, T1: 0 });
    expect(r.summary).toMatchObject({ projectsChecked: 7, projectsComplete: 1 });

    // Services: M1 has 4 logs → count 4, 3 examples, newest first.
    const m1 = r.services.codes.find((c) => c.code === 'M1');
    expect(m1.count).toBe(4);
    expect(m1.examples.map((e) => e.date)).toEqual(['2025-07-10', '2025-06-10', '2025-05-10']);
    expect(m1.examples[0].evidenceLink).toBe('none');
    // M4: the intermediary's name, with its library file as evidence.
    const m4 = r.services.codes.find((c) => c.code === 'M4');
    expect(m4.examples).toHaveLength(1);
    expect(m4.examples[0]).toMatchObject({ name: 'Synthetic Gamma Chamber', organisationType: 'Intermediary', evidenceFile: 'roadshow.jpg' });
    expect(m4.examples[0].evidenceLink).toMatch(new RegExp(`/evidence/${f.folder._id}#file-${f.libFile._id}$`));
    // Legacy documentUrl evidence.
    expect(r.services.codes.find((c) => c.code === 'A5').examples[0].evidenceLink).toBe('https://example.com/scan.pdf');
    // System Update and undated logs are not counted.
    expect(r.services.codes.find((c) => c.code === 'A1').count).toBe(0);
    expect(r.services.codes.find((c) => c.code === 'A2').count).toBe(0);

    // Credit linkage: the tagged one (its own document as evidence) and the untagged one.
    expect(r.credit.rows.map((x) => x.id)).toEqual([String(f.logs.creditUntagged._id), String(f.logs.m1a._id)]);
    const tagged = r.credit.rows[1];
    expect(tagged).toMatchObject({
      date: '2025-03-10', name: 'Synthetic Alpha Foods', project: 'Alpha Plant', evidenceFile: 'minutes.pdf',
    });
    expect(tagged.codes).toEqual(['M1', 'I1']);
    expect(tagged.evidenceLink).toMatch(new RegExp(`/investors/${f.alpha._id}#interaction-${f.logs.m1a._id}`));

    // Announcements: the intermediary's project does not count; a deleted supporting log is noted.
    expect(r.announcements.rows.filter((x) => x.counts).map((x) => x.project)).toEqual(['Alpha Plant']);
    const plantAnn = r.announcements.rows.find((x) => x.project === 'Alpha Plant');
    expect(plantAnn).toMatchObject({ investor: 'Synthetic Alpha Foods', oysipaRoleText: 'Facilitated land', supportingMissing: 1 });
    expect(plantAnn.supporting).toEqual([{ date: '2025-03-10', description: 'Credit meeting with a bank' }]);
    expect(lines(csvPart(r, 'announcements').csv).join('\n')).toMatch(/2025-03-10: Credit meeting with a bank \| 1 linked interaction missing \(deleted\)/);

    // Issues: latest action date, MDA names.
    const open = r.issues.rows.find((x) => x.reference === 'ISS-0002');
    expect(open).toMatchObject({
      latestActionDate: '2025-06-06', project: 'Alpha Plant', investor: 'Synthetic Alpha Foods', mdas: ['Oyo State Agricultural Development Agency'],
    });
    expect(r.issues.rows).toHaveLength(3);
  });

  it('every T-rule can be MISSING (counted in the totals)', async () => {
    const blank = await Investor.collection.insertOne({
      investorName: '', sector: 'Not recorded', countryOfOrigin: 'Not recorded', leadSource: 'Unknown (pre-T11)', firstContactDate: day('2025-01-05'), createdAt: new Date(), updatedAt: new Date(),
    });
    await InvestmentProject.collection.insertOne({
      projectTitle: 'Blank Project', investor: blank.insertedId, description: '', estimatedValue: 0, estimatedNumberOfJobs: 0, lifecycleStatus: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(),
    });
    const r = await buildSaberReport({ year: 2025 });
    const row = r.completeness.rows.find((x) => x.project === 'Blank Project');
    expect(row.missing).toEqual(ALL_FIELDS);
    expect(row.t10Latest).toBeNull();
    ALL_FIELDS.forEach((k) => expect(r.completeness.totals[k]).toBeGreaterThanOrEqual(1));
  });

  it('T10 for a past year: later logs and uncoded logs do not count', async () => {
    const r = await buildSaberReport({ year: 2024 });
    const eps = r.completeness.rows.find((x) => x.project === 'Epsilon Mill');
    expect(eps.checks.T10).toBe(false);
    expect(eps.t10Latest).toBeNull();
    const r25 = await buildSaberReport({ year: 2025 });
    expect(r25.completeness.rows.find((x) => x.project === 'Epsilon Mill').t10Latest.toISOString().slice(0, 10)).toBe('2025-09-09');
  });

  it('happened vs recorded: a log that happened in 2024 and was recorded in 2026 is in 2024 only', async () => {
    const [y24, y26] = await Promise.all([buildSaberReport({ year: 2024 }), buildSaberReport({ year: 2026 })]);
    expect(y24.services.codes.find((c) => c.code === 'A3').count).toBe(1);
    expect(y24.credit.rows.map((x) => x.id)).toEqual([String(f.logs.old._id)]);
    expect(y24.completeness.rows.map((x) => x.project)).toEqual(['Delta Solar', 'Epsilon Mill']);
    expect(y26.services.codes.find((c) => c.code === 'A3').count).toBe(0);
    expect(y26.credit.rows).toHaveLength(0);
    expect(y26.completeness.rows.map((x) => x.project)).not.toContain('Delta Solar');
  });

  it('empty year: every CSV has its header row and zero totals', async () => {
    const r = await buildSaberReport({ year: 2010, user: DG_USER });
    expect(r.summary).toMatchObject({
      projectsChecked: 0, servicesTagged: 0, creditLinkage: 0, announcementsCounted: 0, issues: 0,
    });
    CSV_PARTS.forEach((part) => {
      const out = lines(csvPart(r, part).csv);
      expect(out[0]).toBe(CONFIDENTIAL);
      expect(out[2]).toBe('Year: 2010 (by happened date)');
      expect(out).toContain(CSV_HEADERS[part].join(','));
    });
    const comp = lines(csvPart(r, 'completeness').csv);
    expect(comp.find((l) => l.startsWith('Total MISSING'))).toBe(`Total MISSING,0 projects,${FIELDS.map(() => '0').join(',')},,0`);
    expect(lines(csvPart(r, 'issues').csv)).toContain('Issues reported in year,0');
  });

  it('CSV cells: ✓ / MISSING, rules line, happened date and createdAt / updatedAt, formula guard', async () => {
    const r = await buildSaberReport({ year: 2025, user: DG_USER });
    const out = lines(csvPart(r, 'completeness').csv);
    expect(out[3]).toMatch(/^"Generated \d{2} [A-Z][a-z]{2} \d{4}, ([01]\d|2[0-3]):\d{2} \(Lagos time\) by Synthetic DG \(Director-General\)"$/);
    expect(out[6]).toMatch(/T7 = estimated jobs > 0/);
    expect(out[7]).toBe(CSV_HEADERS.completeness.join(','));
    const depot = out.find((l) => l.startsWith('Synthetic Alpha Foods,Alpha Depot,'));
    const cells = depot.split(',');
    expect(cells[2]).toBe('✓');
    expect(cells[3]).toBe('MISSING'); // T2
    expect(cells[8]).toBe('MISSING'); // T7
    expect(depot).toMatch(/,2025-02-01,\d{4}-\d{2}-\d{2}T[\d:.]+Z,\d{4}-\d{2}-\d{2}T[\d:.]+Z,/);
    expect(lines(csvPart(r, 'services').csv).find((l) => l.startsWith('M4,'))).toMatch(/Synthetic Gamma Chamber,Intermediary/);
    // A description that looks like a formula is guarded.
    expect(csvPart(r, 'credit').csv).toContain('"\'=HYPERLINK(""http://bad"")"');
  });

  it('a Resolved issue without a resolved date says "not recorded"', async () => {
    await InvestorIssue.collection.updateOne({ reference: 'ISS-0001' }, { $unset: { resolvedDate: '' } });
    const r = await buildSaberReport({ year: 2025 });
    expect(r.issues.rows.find((x) => x.reference === 'ISS-0001').resolvedDate).toBe('not recorded');
  });
});

describe('PDF', () => {
  // Strings drawn with doc.text (the real PDF is still built).
  const drawnText = async (report) => {
    const spy = jest.spyOn(PDFDocument.prototype, 'text');
    const buf = await buildPdf(report, { compress: false });
    const strings = spy.mock.calls.map((c) => c[0]).filter((s) => typeof s === 'string');
    spy.mockRestore();
    return { buf, strings };
  };
  const pageCount = (buf) => (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

  it('starts with %PDF, embeds the Unicode font, says confidential on every page header and footer, numbers the pages', async () => {
    const r = await buildSaberReport({ year: 2025, user: DG_USER });
    const { buf, strings } = await drawnText(r);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1')).toMatch(/\/BaseFont \/[A-Z]{6}\+DejaVuSansCondensed\b/);
    const pages = pageCount(buf);
    expect(pages).toBeGreaterThanOrEqual(6);
    expect(strings.filter((s) => s === `${CONFIDENTIAL} · SABER report 2025`)).toHaveLength(pages);
    const footers = strings.filter((s) => s.startsWith(`${CONFIDENTIAL} · Generated`) && s.includes('by Synthetic DG'));
    expect(footers).toHaveLength(pages);
    expect(strings).toContain(`Page ${pages} of ${pages}`);
    expect(strings).toEqual(expect.arrayContaining(['SABER report (DLI 4)', 'Synthetic Gamma Chamber', 'MISSING', '✓']));
    expect(strings.some((s) => s.includes('Long text is cut to fit'))).toBe(true);
  });

  it('prints ✓, ₦ and Yoruba letters with the embedded font', async () => {
    const font = fontkit.openSync(FONT_FILES.regular);
    ['✓', '₦', 'ẹ', 'ọ', 'ṣ', 'Ọ', '\u0300', '\u0301'].forEach((ch) => expect(font.hasGlyphForCodePoint(ch.codePointAt(0))).toBe(true));
    await Investor.updateOne({ _id: f.gamma._id }, { $set: { investorName: 'Ẹgbẹ́ Ọ̀yọ́ ₦ Chamber' } });
    const { strings } = await drawnText(await buildSaberReport({ year: 2025 }));
    expect(strings.some((s) => s.startsWith('Ẹgbẹ́ Ọ̀yọ́ ₦'.normalize('NFC')))).toBe(true);
  });

  it('cuts long text to fit', async () => {
    await InteractionLog.updateOne({ _id: f.logs.m1d._id }, { $set: { description: 'Very long description '.repeat(40) } });
    const { strings } = await drawnText(await buildSaberReport({ year: 2025 }));
    const cut = strings.find((s) => s.startsWith('Very long description'));
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(200);
  });

  it('falls back to Helvetica (ASCII) when the font cannot be loaded', async () => {
    expect(pdfText('Ọ̀yọ́ ₦ ✓ “ok”\nnext')).toBe('Oyo NGN  OK “ok” next');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fontFiles.regular = 'Z:/no/such/font.ttf';
    try {
      const { buf, strings } = await drawnText(await buildSaberReport({ year: 2025 }));
      expect(buf.slice(0, 4).toString()).toBe('%PDF');
      expect(buf.toString('latin1')).toMatch(/\/BaseFont \/Helvetica/);
      expect(strings).toContain('OK');
      expect(strings).not.toContain('✓');
    } finally {
      fontFiles.regular = FONT_FILES.regular;
    }
  });

  it('an empty year builds, with a full-width "No records" line', async () => {
    const { buf, strings } = await drawnText(await buildSaberReport({ year: 2010 }));
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    expect(strings.filter((s) => s === 'No records for 2010.').length).toBeGreaterThanOrEqual(4);
  });
});

describe('API /api/saber-report', () => {
  const get = (path, token = global.dgToken) => request(app).get(path).set('Authorization', bearer(token));
  const binary = (req) => req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  // Entries of a ZIP from its central directory: [{ name, data }].
  const unzip = (buf) => {
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const method = buf.readUInt16LE(p + 10);
      const size = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.slice(start, start + size);
      out.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : raw });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  };

  it('DG summary for 2025 matches the dashboard and holds no personal data', async () => {
    const [res, dash] = await Promise.all([get('/api/saber-report?year=2025').expect(200), get('/api/analytics/overview?year=2025').expect(200)]);
    expect(res.body.year).toBe(2025);
    expect(res.body.summary.servicesTagged).toBe(dash.body.yearOnYear.services.tagged);
    expect(res.body.summary.creditLinkage).toBe(dash.body.yearOnYear.services.creditLinkage);
    expect(res.body.summary.announcementsCounted).toBe(dash.body.saber.announcements.counted);
    expect(res.body.summary.issues).toBe(dash.body.saber.issues.total);
    expect(res.body.summary.issuesResolvedShare).toBe(dash.body.saber.issues.share);
    expect(res.body.parts.map((p) => p.part)).toEqual(['completeness', 'services', 'credit', 'announcements', 'issues', 'pdf', 'all']);
    expect(res.body.links.credit).toBe('/interactions?officerLogs=1&creditLinkage=1&dated=1&year=2025');
    expect(res.body.links.completeness).toBe('/projects?saberYear=2025');
    expect(JSON.stringify(res.body)).not.toMatch(/alpha@example\.com|\+2340000001/);
  });

  it('every summary card count equals the length of the list it links to (2025)', async () => {
    // A 2025-recorded undated log must not reach the dated lists.
    await InteractionLog.collection.updateOne({ _id: f.logs.undated._id }, { $set: { createdAt: day('2025-10-10') } });
    const { body } = await get('/api/saber-report?year=2025').expect(200);
    const list = async (to) => (await get(`/api${to}`).expect(200)).body;
    expect(await list(body.links.completeness)).toHaveLength(body.summary.projectsChecked);
    expect((await list(body.links.completeness)).map((p) => p.projectTitle).sort()).toEqual(SCOPE_2025);
    expect(await list(body.links.services)).toHaveLength(body.summary.servicesTagged);
    expect((await list(body.links.credit)).map((l) => String(l._id)).sort()).toEqual([String(f.logs.m1a._id), String(f.logs.creditUntagged._id)].sort());
    expect(await list(body.links.announcements)).toHaveLength(body.summary.announcementsCounted);
    expect(await list(body.links.issues)).toHaveLength(body.summary.issues);
  });

  it('Portal-Admin allowed; Staff 403; no token 401', async () => {
    await get('/api/saber-report?year=2025', global.portalAdminToken).expect(200);
    await get('/api/saber-report?year=2025', f.staffToken).expect(403);
    await get('/api/saber-report/download?year=2025&part=all', f.staffToken).expect(403);
    await request(app).get('/api/saber-report?year=2025').expect(401);
    await request(app).get('/api/saber-report/download?year=2025&part=pdf').expect(401);
    expect(await ChangeLog.countDocuments({ action: 'export' })).toBe(0);
  });

  it.each(['1999', 'abc', '2999', '20255'])('bad year %s → 400', async (y) => {
    await get(`/api/saber-report?year=${y}`).expect(400);
    await get(`/api/saber-report/download?year=${y}&part=pdf`).expect(400);
  });

  it('bad part → 400, no audit row', async () => {
    await get('/api/saber-report/download?year=2025&part=everything').expect(400);
    await get('/api/saber-report/download?year=2025').expect(400);
    expect(await ChangeLog.countDocuments({ action: 'export' })).toBe(0);
  });

  it.each([
    ['completeness', 7], ['services', 8], ['credit', 2], ['announcements', 3], ['issues', 3],
  ])('CSV part %s: named saber-report-2025-<part>.csv, confidential first line, Generated by the signed-in user, one audit row (%i rows)', async (part, rows) => {
    const res = await get(`/api/saber-report/download?year=2025&part=${part}`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="saber-report-2025-${part}.csv"`);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const out = lines(res.text);
    expect(out[0]).toBe(CONFIDENTIAL);
    expect(out[3]).toMatch(/ by DG User \(Director-General\)"$/);
    expect(out).toContain(CSV_HEADERS[part].join(','));
    const audit = await ChangeLog.find({ action: 'export' }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: 'SaberReport', byName: 'DG User', role: 'Director-General' });
    expect(String(audit[0].entityId)).toBe(EXPORT_ENTITY_IDS.saberReport);
    expect(audit[0].snapshot).toMatchObject({
      list: 'saber-report', year: 2025, part, rowCounts: { [part]: rows }, rowCount: rows, files: [`saber-report-2025-${part}.csv`],
    });
  });

  it('PDF part: audited', async () => {
    const res = await binary(get('/api/saber-report/download?year=all&part=pdf')).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="saber-report-all-pdf.pdf"');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    const audit = await ChangeLog.find({ action: 'export' }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0].snapshot).toMatchObject({ year: 'all', part: 'pdf', files: ['saber-report-all-pdf.pdf'] });
  });

  it('ZIP: 5 CSVs + PDF named saber-report-<year>-<part>, each confidential, one audit row with every row count', async () => {
    const res = await binary(get('/api/saber-report/download?year=2025&part=all', global.portalAdminToken)).expect(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="saber-report-2025-all.zip"');
    const entries = unzip(res.body);
    expect(entries.map((e) => e.name)).toEqual([
      'saber-report-2025-completeness.csv', 'saber-report-2025-services.csv', 'saber-report-2025-credit.csv',
      'saber-report-2025-announcements.csv', 'saber-report-2025-issues.csv', 'saber-report-2025-pdf.pdf',
    ]);
    entries.slice(0, 5).forEach((e, i) => {
      const out = lines(e.data.toString('utf8'));
      expect(out[0]).toBe(CONFIDENTIAL);
      expect(out[3]).toMatch(/ by Portal Admin User \(Portal-Admin\)"$/);
      expect(out).toContain(CSV_HEADERS[CSV_PARTS[i]].join(','));
    });
    expect(entries[5].data.slice(0, 4).toString()).toBe('%PDF');
    const audit = await ChangeLog.find({ action: 'export' }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: 'SaberReport', role: 'Portal-Admin' });
    expect(audit[0].snapshot.rowCounts).toEqual({
      completeness: 7, services: 8, credit: 2, announcements: 3, issues: 3,
    });
    expect(audit[0].snapshot.rowCount).toBe(23);
  });

  it('audit write fails → 500 and no file', async () => {
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await get('/api/saber-report/download?year=2025&part=credit').expect(500);
    expect(res.body.message).toMatch(/audit record/);
  });
});
