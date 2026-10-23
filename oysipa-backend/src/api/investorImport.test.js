// Import investors (story 11.5 + 11.11): dry run, run, repeat, rules, audit.
// Synthetic fixtures only: no real names, emails or phones.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const ChangeLog = require('../models/ChangeLog');
const { normaliseName, planImport, applyImport } = require('../services/investorImport');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

let staffToken;
let dgUser;
let existing;

const fixture = () => ({
  records: [
    {
      key: normaliseName('Alpha Agro Limited'),
      action: 'create',
      existingAppNames: [],
      investor: {
        investorName: 'Alpha Agro Limited', email: 'info@alpha-agro.africa', phoneNumber: '0800 000 0001', sector: 'Agribusiness',
        countryOfOrigin: 'Nigeria', leadSource: 'Business event or conference', leadSourceDetail: 'Synthetic summit', firstContactDate: '2025-07-22', organisationType: 'Investor',
      },
      project: {
        projectTitle: 'Alpha Mill', description: 'Synthetic mill', location: 'Ibadan', lifecycleStatusName: 'Commitment', estimatedValue: 10000000, currency: 'USD', valueNote: 'synthetic value note',
      },
      tags: ['import:synthetic', 'source:fixture'],
      website: 'https://alpha.example.test',
      companyEmail: 'sales@alpha.example.test',
      headOffice: 'Ibadan',
      notes: 'Synthetic note',
    },
    {
      key: normaliseName('Beta Partners'),
      action: 'create',
      investor: {
        investorName: 'Beta Partners', email: 'taken@example.test', sector: 'Financial Services', countryOfOrigin: 'Nigeria (assumed',
        leadSource: 'Government or MDA referral', firstContactDate: null, organisationType: 'Intermediary',
      },
      project: null,
      tags: ['import:synthetic'],
    },
    {
      key: normaliseName('Test Investor Ltd'),
      action: 'create',
      investor: { investorName: 'Test Investor Ltd', sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other' },
      tags: [],
    },
    {
      key: 'existing',
      action: 'update-existing',
      existingAppNames: ['Existing Co'],
      investor: {
        investorName: 'Existing Company', email: null, phoneNumber: '0700 000 0002', sector: 'Agribusiness', countryOfOrigin: 'NG',
        keyContactPerson: 'Synthetic Person', leadSource: 'Government or MDA referral', organisationType: 'Investor',
      },
      projects: [
        { projectTitle: 'EXISTING  plant', lifecycleStatusName: 'Commitment' },
        { projectTitle: 'New Plant A', lifecycleStatusName: 'Commitment', currency: 'NGN', estimatedValue: 2500000000 },
        {
          projectTitle: 'New Plant B', lifecycleStatusName: 'Commitment', stage: 'Operating', announcementDate: '2025-01-01', evidence: ['clip one', 'clip two'], tags: ['batch:2'],
        },
        // The file says this is the investor's existing project under another title.
        { projectTitle: 'Renamed Existing', matchesBatch1Project: 'Existing Plant', lifecycleStatusName: 'Commitment' },
      ],
      tags: ['import:synthetic-2'],
      website: 'https://existing.example.test',
      notes: 'Batch note',
    },
    { key: 'nobody', action: 'update-existing', existingAppNames: ['Nobody Here'], investor: {}, projects: [] },
    {
      key: normaliseName('Gamma Works'),
      action: 'create',
      investor: { investorName: 'Gamma Works', sector: 'Manufacturing', countryOfOrigin: 'Nigeria', leadSource: 'Other' },
      projects: [{ projectTitle: 'Gamma Line', lifecycleStatusName: 'Unknown Stage' }],
    },
    {
      key: normaliseName('Delta Foods'),
      action: 'create',
      investor: { investorName: 'Delta Foods', sector: 'Mystery Sector', countryOfOrigin: 'Ghana', leadSource: 'Other' },
      projects: [],
    },
  ],
  interactions: [
    {
      id: 'INT-T1', date: '2025-01-15', investorName: 'Alpha Agro Limited', description: 'Synthetic site visit', category: 'Assistance',
      serviceCodes: ['A2', 'V1'], performedBy: 'Synthetic desk', evidenceFolder: 'folder/synthetic', proposedVerificationLevel: 1, tags: ['import:synthetic'],
    },
    { id: 'INT-T2', date: '2099-01-01', investorName: 'Alpha Agro Limited', description: 'Future', serviceCodes: [] },
    { id: 'INT-T3', date: '2025-02-01', investorName: 'No Such Org', description: 'Nobody', serviceCodes: ['M4'] },
    { id: 'INT-T4', date: '2024-03-01', investorName: 'Existing Co', description: 'Synthetic call', category: 'Marketing', serviceCodes: ['M4'], note: 'synthetic' },
  ],
});

const upload = (route, token, json, confirm) => {
  let req = request(app).post(`/api/investors/import/${route}`);
  if (token) req = req.set('Authorization', bearer(token));
  if (confirm !== undefined) req = req.field('confirm', confirm);
  const buffer = Buffer.isBuffer(json) ? json : Buffer.from(JSON.stringify(json));
  return req.attach('file', buffer, { filename: 'import.json', contentType: 'application/json' });
};

const snapshot = async () => ({
  investors: await Investor.collection.find({}).sort({ _id: 1 }).toArray(),
  projects: await InvestmentProject.collection.find({}).sort({ _id: 1 }).toArray(),
  logs: await InteractionLog.collection.find({}).sort({ _id: 1 }).toArray(),
  changeLog: await ChangeLog.countDocuments(),
});

beforeEach(async () => {
  await ChangeLog.collection.deleteMany({});
  const staff = await User.create({ name: 'Import Staff', email: 'import.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  dgUser = await User.findOne({ email: 'dg@example.com' });
  const commitment = await LifecycleStatus.create({ name: 'Commitment', order: 5 });
  await Investor.create({ investorName: 'Holder Co', email: 'taken@example.test', sector: 'Tech', countryOfOrigin: 'NG', leadSource: 'Other' });
  existing = await Investor.create({
    investorName: 'Existing Co', sector: 'Tech', countryOfOrigin: 'NG', leadSource: 'Unknown (pre-T11)', organisationType: 'Investor',
  });
  await InvestmentProject.create({ projectTitle: 'Existing Plant', investor: existing._id, lifecycleStatus: commitment._id });
});

describe('normaliseName (port of the content studio norm())', () => {
  it('matches the Python rules', () => {
    expect(normaliseName('Milkin Barn Agroserve Limited')).toBe('milkin barn agroserve');
    expect(normaliseName('The Ọ̀yọ́ Company (Nig) Ltd')).toBe('oyo');
    expect(normaliseName('Café Enterprises International Group')).toBe('cafe');
    expect(normaliseName(null)).toBe('');
  });
});

describe('POST /api/investors/import/dry-run', () => {
  it('reports creates, updates, duplicates, errors, warnings and interactions; writes nothing', async () => {
    const before = await snapshot();
    const res = await upload('dry-run', global.dgToken, fixture()).expect(200);
    expect(await snapshot()).toEqual(before);

    const { report, confirmation } = res.body;
    expect(confirmation).toBe('IMPORT 3');
    expect(report.counts).toMatchObject({
      records: 7, create: 3, update: 1, duplicates: 1, errors: 2, projectsToCreate: 3, projectsSkipped: 2,
      interactions: 4, interactionsToCreate: 2, interactionDuplicates: 0, interactionErrors: 2,
    });
    expect(report.create.map((r) => r.name)).toEqual(['Alpha Agro Limited', 'Beta Partners', 'Delta Foods']);
    expect(report.create[0].projects).toEqual([{ title: 'Alpha Mill', currency: 'USD' }]);
    expect(report.duplicates[0]).toMatchObject({ kind: 'investor', name: 'Test Investor Ltd', matches: 'Test Investor' });

    const upd = report.update[0];
    expect(upd.appName).toBe('Existing Co');
    expect(upd.filled).toEqual(expect.arrayContaining(['phoneNumber', 'keyContactPerson', 'website', 'notes']));
    expect(upd.filled).not.toContain('sector');
    expect(upd.conflicts).toEqual(expect.arrayContaining([
      { field: 'sector', app: 'Tech', file: 'Agribusiness' },
      expect.objectContaining({ field: 'leadSource', note: 'never changed on existing records' }),
    ]));
    expect(upd.projects.map((p) => p.title)).toEqual(['New Plant A', 'New Plant B']);
    expect(upd.projectsSkipped).toEqual(['EXISTING  plant', 'Renamed Existing']);

    const errors = report.errors.map((e) => [e.kind, e.key || e.id, e.missingStatus || null]);
    expect(errors).toEqual(expect.arrayContaining([
      ['record', 'nobody', null],
      ['record', 'gamma works', 'Unknown Stage'],
      ['interaction', 'INT-T2', null],
      ['interaction', 'INT-T3', null],
    ]));
    const messages = report.warnings.map((w) => w.message).join(' | ');
    expect(messages).toMatch(/already used by another investor/);
    expect(messages).toMatch(/No firstContactDate/);
    expect(messages).toMatch(/Odd country value/);
    expect(messages).toMatch(/Sector "Mystery Sector"/);
    expect(report.interactions.map((i) => i.id)).toEqual(['INT-T1', 'INT-T4']);

    // No personal data in the report.
    const text = JSON.stringify(res.body);
    ['info@alpha-agro.africa', 'taken@example.test', 'sales@alpha', '0800 000 0001', '0700 000 0002', 'Synthetic Person'].forEach((pii) => {
      expect(text).not.toContain(pii);
    });
  });

  it('bad files → 400 with a clear message', async () => {
    let res = await upload('dry-run', global.dgToken, Buffer.from('{not json')).expect(400);
    expect(res.body.message).toMatch(/not valid JSON/);
    res = await upload('dry-run', global.dgToken, { rows: [] }).expect(400);
    expect(res.body.message).toMatch(/records/);
    res = await upload('dry-run', global.dgToken, Buffer.alloc(2 * 1024 * 1024 + 10, 32)).expect(400);
    expect(res.body.message).toMatch(/2 MB/);
    res = await request(app).post('/api/investors/import/dry-run').set('Authorization', bearer(global.dgToken))
      .attach('file', Buffer.from('{}'), { filename: 'import.csv', contentType: 'text/csv' })
      .expect(400);
    expect(res.body.message).toMatch(/\.json/);
    res = await request(app).post('/api/investors/import/dry-run').set('Authorization', bearer(global.dgToken)).expect(400);
    expect(res.body).toHaveProperty('message');
  });

  it('Staff → 403 on both routes, nothing written', async () => {
    const before = await snapshot();
    let res = await upload('dry-run', staffToken, fixture());
    expect(res.statusCode).toBe(403);
    res = await upload('run', staffToken, fixture(), 'IMPORT 3');
    expect(res.statusCode).toBe(403);
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST /api/investors/import/run', () => {
  it('wrong confirmation → 400, nothing written', async () => {
    const before = await snapshot();
    for (const confirm of [undefined, '', 'IMPORT 2', 'import 3']) {
      const res = await upload('run', global.dgToken, fixture(), confirm).expect(400);
      expect(res.body.message).toMatch(/IMPORT 3/);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('runs the plan, writes audit rows; a second run creates 0 (IMPORT 0)', async () => {
    const res = await upload('run', global.dgToken, fixture(), 'IMPORT 3').expect(200);
    expect(res.body.counts).toMatchObject({
      created: 3, updated: 1, projectsCreated: 3, interactionsCreated: 2,
    });
    expect(res.body.errors).toEqual([]);
    const { batchId } = res.body;

    // Created investor: fields, .africa email, notes with company email, stamps.
    const alpha = await Investor.findOne({ investorName: 'Alpha Agro Limited' }).lean();
    expect(alpha).toMatchObject({
      email: 'info@alpha-agro.africa', leadSource: 'Business event or conference', organisationType: 'Investor', website: 'https://alpha.example.test', headOffice: 'Ibadan', importBatchId: batchId,
    });
    expect(alpha.notes).toBe('Synthetic note; Company email: sales@alpha.example.test');
    expect(alpha.importTags).toEqual(['import:synthetic', 'source:fixture']);
    expect(alpha.firstContactDate.toISOString().slice(0, 10)).toBe('2025-07-22');
    const mill = await InvestmentProject.findOne({ investor: alpha._id }).lean();
    expect(mill).toMatchObject({ projectTitle: 'Alpha Mill', currency: 'USD', estimatedValue: 10000000, importBatchId: batchId });
    expect(mill.description).toContain('valueNote: synthetic value note');

    // Email taken: imported without it.
    const beta = await Investor.findOne({ investorName: 'Beta Partners' }).lean();
    expect(beta.email).toBeUndefined();
    expect(beta.organisationType).toBe('Intermediary');
    expect(await Investor.countDocuments({ email: 'taken@example.test' })).toBe(1);
    // Empty projects: investor only.
    const delta = await Investor.findOne({ investorName: 'Delta Foods' }).lean();
    expect(await InvestmentProject.countDocuments({ investor: delta._id })).toBe(0);
    // Unknown status: whole record skipped.
    expect(await Investor.exists({ investorName: 'Gamma Works' })).toBeNull();

    // Update-existing: empty fields filled, non-empty kept, leadSource unchanged.
    const ex = await Investor.findById(existing._id).lean();
    expect(ex).toMatchObject({
      phoneNumber: '0700 000 0002', keyContactPerson: 'Synthetic Person', sector: 'Tech', countryOfOrigin: 'NG', leadSource: 'Unknown (pre-T11)', website: 'https://existing.example.test', notes: 'Batch note',
    });
    expect(ex.importTags).toEqual(['import:synthetic-2']);
    const exProjects = await InvestmentProject.find({ investor: existing._id }).sort({ projectTitle: 1 }).lean();
    expect(exProjects.map((p) => p.projectTitle)).toEqual(['Existing Plant', 'New Plant A', 'New Plant B']);
    const plantB = exProjects[2];
    expect(plantB.description).toContain('stage: Operating');
    expect(plantB.description).toContain('evidence: clip one; clip two');
    expect(plantB.importTags).toEqual(['import:synthetic-2', 'batch:2']);

    // Interactions.
    const logs = await InteractionLog.find({ importRef: { $exists: true } }).sort({ importRef: 1 }).lean();
    expect(logs.map((l) => l.importRef)).toEqual(['INT-T1', 'INT-T4']);
    expect(logs[0]).toMatchObject({
      category: 'Imported record', serviceCodes: ['A2', 'V1'], importBatchId: batchId, importTags: ['import:synthetic'],
    });
    expect(String(logs[0].investor)).toBe(String(alpha._id));
    expect(logs[0].project).toBeUndefined();
    expect(String(logs[0].loggedBy)).toBe(String(dgUser._id));
    expect(logs[0].interactionDate.toISOString().slice(0, 10)).toBe('2025-01-15');
    expect(logs[0].description).toContain('Synthetic site visit');
    expect(logs[0].description).toMatch(/Category: Assistance.*Performed by: Synthetic desk.*Evidence folder: folder\/synthetic.*Proposed verification level: 1/);
    expect(String(logs[1].investor)).toBe(String(existing._id));

    // Audit: 3 created + 1 updated investor, 3 projects, 2 interactions.
    const rows = await ChangeLog.find({}).lean();
    expect(rows).toHaveLength(9);
    rows.forEach((r) => {
      expect(r).toMatchObject({ action: 'import', batchId, role: 'Director-General' });
      expect(String(r.by)).toBe(String(dgUser._id));
      expect(r.snapshot).toBeDefined();
    });
    expect(rows.filter((r) => r.entity === 'Investor')).toHaveLength(4);
    expect(rows.filter((r) => r.entity === 'InvestmentProject')).toHaveLength(3);
    expect(rows.filter((r) => r.entity === 'InteractionLog')).toHaveLength(2);
    // The update-existing audit row says what this run changed.
    const exRow = rows.find((r) => r.entity === 'Investor' && String(r.entityId) === String(existing._id));
    expect(exRow.reason).toBe('filled: phoneNumber, keyContactPerson, website, notes; projects added: 2');
    expect(rows.find((r) => r.entity === 'Investor' && String(r.entityId) === String(alpha._id)).reason).toBeNull();

    // Second upload: dry run shows nothing to do; IMPORT 0 runs and creates nothing.
    const snap = await snapshot();
    const dry = await upload('dry-run', global.dgToken, fixture()).expect(200);
    expect(dry.body.confirmation).toBe('IMPORT 0');
    expect(dry.body.report.counts).toMatchObject({
      create: 0, update: 0, fieldsToFill: 0, projectsToCreate: 0, duplicates: 4, interactionsToCreate: 0, interactionDuplicates: 2,
    });
    const again = await upload('run', global.dgToken, fixture(), 'IMPORT 0').expect(200);
    expect(again.body.counts).toMatchObject({
      created: 0, updated: 0, fieldsFilled: 0, projectsCreated: 0, interactionsCreated: 0, auditRows: 0,
    });
    expect(await snapshot()).toEqual(snap);
  });

  it('unknown status: after the owner adds it, a new run imports the record', async () => {
    await upload('run', global.dgToken, fixture(), 'IMPORT 3').expect(200);
    await LifecycleStatus.create({ name: 'Unknown Stage', order: 9 });
    const dry = await upload('dry-run', global.dgToken, fixture()).expect(200);
    expect(dry.body.confirmation).toBe('IMPORT 1');
    await upload('run', global.dgToken, fixture(), 'IMPORT 1').expect(200);
    const gamma = await Investor.findOne({ investorName: 'Gamma Works' }).lean();
    expect(await InvestmentProject.countDocuments({ investor: gamma._id, projectTitle: 'Gamma Line' })).toBe(1);
  });

  it('all-update batch: IMPORT 0 runs the fills and interactions', async () => {
    const f = fixture();
    const file = { records: [f.records[3]], interactions: [f.interactions[3]] };
    const dry = await upload('dry-run', global.dgToken, file).expect(200);
    expect(dry.body.confirmation).toBe('IMPORT 0');
    const res = await upload('run', global.dgToken, file, 'IMPORT 0').expect(200);
    expect(res.body.counts).toMatchObject({ created: 0, updated: 1, projectsCreated: 2, interactionsCreated: 1 });
    expect((await Investor.findById(existing._id).lean()).phoneNumber).toBe('0700 000 0002');
  });

  it('a non-empty field is never overwritten by a later batch; notes are appended once', async () => {
    await Investor.updateOne({ _id: existing._id }, { $set: { phoneNumber: '0100', notes: 'Officer note' } });
    const f = fixture();
    const file = { records: [f.records[3]] };
    await upload('run', global.dgToken, file, 'IMPORT 0').expect(200);
    let ex = await Investor.findById(existing._id).lean();
    expect(ex.phoneNumber).toBe('0100');
    expect(ex.notes).toBe('Officer note\n\nBatch note');
    await upload('run', global.dgToken, file, 'IMPORT 0').expect(200);
    ex = await Investor.findById(existing._id).lean();
    expect(ex.notes).toBe('Officer note\n\nBatch note');
  });
});

describe('Import edge cases (review fixes)', () => {
  const mk = (name, extra = {}) => ({
    action: 'create', investor: { investorName: name, sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other', ...extra },
  });
  const plan = (json) => planImport(json);

  it('two creates with one normalised key: 1 created, duplicate noted, interaction on the second spelling created', async () => {
    const json = {
      records: [mk('Foo Ltd'), mk('Foo Limited')],
      interactions: [
        { id: 'DUP-1', date: '2025-01-01', investorName: 'Foo Limited', description: 'Synthetic', serviceCodes: [] },
        { id: 'DUP-1', date: '2025-01-02', investorName: 'Foo Ltd', description: 'Again', serviceCodes: [] },
      ],
    };
    const p = await plan(json);
    expect(p.report.counts).toMatchObject({ create: 1, duplicates: 1, interactionsToCreate: 1, interactionDuplicates: 1 });
    expect(p.report.duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'investor', name: 'Foo Limited', matches: 'Foo Ltd', note: 'earlier record in this file' }),
      expect.objectContaining({ kind: 'interaction', id: 'DUP-1', note: 'earlier entry in this file' }),
    ]));
    const res = await applyImport(p, dgUser);
    expect(res.counts).toMatchObject({ created: 1, interactionsCreated: 1 });
    expect(await Investor.countDocuments({ investorName: { $in: ['Foo Ltd', 'Foo Limited'] } })).toBe(1);
    const foo = await Investor.findOne({ investorName: 'Foo Ltd' });
    const log = await InteractionLog.findOne({ importRef: 'DUP-1' }).lean();
    expect(String(log.investor)).toBe(String(foo._id));
  });

  it('a name that normalises to "" never makes other records duplicates', async () => {
    expect(normaliseName('Global Services Limited')).toBe('');
    await Investor.create({ investorName: 'Global Services Limited', sector: 'Tech', countryOfOrigin: 'NG', leadSource: 'Other' });
    const p = await plan({ records: [mk('The Company Ltd'), mk('International Group Plc')] });
    expect(p.report.counts).toMatchObject({ create: 2, duplicates: 0 });
    // The exact name still matches.
    const again = await plan({ records: [mk('Global Services Limited')] });
    expect(again.report.counts).toMatchObject({ create: 0, duplicates: 1 });
  });

  it('numeric or padded interaction ids are seen as already imported', async () => {
    const json = { records: [], interactions: [{ id: 77, date: '2025-01-01', investorName: 'Existing Co', description: 'Synthetic', serviceCodes: [] }] };
    await applyImport(await plan(json), dgUser);
    expect(await InteractionLog.countDocuments({ importRef: '77' })).toBe(1);
    const again = await plan({ records: [], interactions: [{ ...json.interactions[0], id: ' 77 ' }] });
    expect(again.report.counts).toMatchObject({ interactionsToCreate: 0, interactionDuplicates: 1 });
  });

  it('write-time skips are reported: exists() and the unique index (11000)', async () => {
    await InteractionLog.init();
    const json = { records: [], interactions: [{ id: 'RACE-1', date: '2025-01-01', investorName: 'Existing Co', description: 'Synthetic', serviceCodes: [] }] };
    const p1 = await plan(json);
    const p2 = await plan(json);
    await applyImport(p1, dgUser);
    const second = await applyImport(p2, dgUser);
    expect(second.counts.interactionsCreated).toBe(0);
    expect(second.skipped).toEqual([{ row: 1, id: 'RACE-1', message: 'Already imported; skipped.' }]);

    // Race: the check passes but the insert hits the unique index.
    const spy = jest.spyOn(InteractionLog, 'exists').mockResolvedValue(null);
    try {
      const third = await applyImport(p2, dgUser);
      expect(third.counts.interactionsCreated).toBe(0);
      expect(third.errors).toEqual([]);
      expect(third.skipped).toEqual([{ row: 1, id: 'RACE-1', message: 'Already imported; skipped.' }]);
    } finally {
      spy.mockRestore();
    }
    expect(await InteractionLog.countDocuments({ importRef: 'RACE-1' })).toBe(1);
  });

  it('organisationType: "Investor" is replaced by the file type; any other type is never changed', async () => {
    const contact = await Investor.create({ investorName: 'Contact Co', sector: 'Tech', countryOfOrigin: 'NG', organisationType: 'Contact' });
    const kpis = async () => (await request(app).get('/api/admin/dashboard-kpis').set('Authorization', bearer(global.dgToken)).expect(200)).body.totalInvestors;
    const before = await kpis();
    const json = {
      records: [
        { action: 'update-existing', existingAppNames: ['Existing Co'], investor: { organisationType: ' Intermediary ' } },
        { action: 'update-existing', existingAppNames: ['Contact Co'], investor: { organisationType: 'Intermediary' } },
      ],
    };
    const p = await plan(json);
    expect(p.report.update[0].filled).toEqual(['organisationType']);
    expect(p.report.update[1].filled).toEqual([]);
    expect(p.report.update[1].conflicts).toEqual([{ field: 'organisationType', app: 'Contact', file: 'Intermediary' }]);
    await applyImport(p, dgUser);
    expect((await Investor.findById(existing._id)).organisationType).toBe('Intermediary');
    expect((await Investor.findById(contact._id)).organisationType).toBe('Contact');
    expect(await kpis()).toBe(before - 1);
  });

  it('a value or jobs that is not a non-negative number is left out with a warning', async () => {
    const rec = mk('Numbers Co');
    rec.projects = [{ projectTitle: 'Num', lifecycleStatusName: 'Commitment', estimatedValue: 'ten million', estimatedNumberOfJobs: -5 }];
    const p = await plan({ records: [rec] });
    const msgs = p.report.warnings.map((w) => w.message);
    expect(msgs).toEqual(expect.arrayContaining([
      expect.stringMatching(/estimatedValue is not a non-negative number/),
      expect.stringMatching(/estimatedNumberOfJobs is not a non-negative number/),
    ]));
    expect(p.creates[0].projects[0]).not.toHaveProperty('estimatedValue');
    expect(p.creates[0].projects[0]).not.toHaveProperty('estimatedNumberOfJobs');
  });

  it('leadSourceDetail differences are reported by field name only', async () => {
    await Investor.updateOne({ _id: existing._id }, { $set: { leadSourceDetail: 'Private app detail' } });
    const p = await plan({ records: [{ action: 'update-existing', existingAppNames: ['Existing Co'], investor: { leadSourceDetail: 'Private file detail' } }] });
    const c = p.report.update[0].conflicts.find((x) => x.field === 'leadSourceDetail');
    expect(c).toBeDefined();
    const text = JSON.stringify(p.report);
    expect(text).not.toContain('Private app detail');
    expect(text).not.toContain('Private file detail');
  });
});
