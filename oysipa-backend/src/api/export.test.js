// Story 11.15: CSV export of the current list view, audited (synthetic data only).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestorIssue = require('../models/InvestorIssue');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const ChangeLog = require('../models/ChangeLog');
const exportController = require('../controllers/exportController');
const { cell } = require('../services/csv');

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

let staff;
let staffToken;

beforeEach(async () => {
  await Promise.all([InvestorIssue.deleteMany({}), InvestmentAnnouncement.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({})]);
  staff = await User.create({ name: 'Export Staff', email: 'export.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
});
afterEach(() => {
  exportController.limits.maxRows = 5000;
  jest.restoreAllMocks();
});

const exportOf = (path, token = staffToken) => request(app).get(`/api/export/${path}`).set('Authorization', bearer(token));
const lines = (text) => text.replace(/^﻿/, '').split('\r\n').filter((l) => l !== '');
const exportRows = () => ChangeLog.find({ action: 'export' }).lean();

describe('Export', () => {
  it('120 investors filtered → CSV with 120 rows (+ filters and header lines) and one ChangeLog export row', async () => {
    const docs = [];
    for (let i = 0; i < 120; i += 1) {
      docs.push({
        investorName: `Synthetic Agro ${String(i).padStart(3, '0')}`, sector: 'Agribusiness', countryOfOrigin: 'Nigeria', leadSource: 'Other', email: `agro${i}@example.com`, phoneNumber: '+2340000000', keyContactPerson: 'Contact Person', firstContactDate: new Date('2025-03-01T00:00:00.000Z'),
      });
    }
    await Investor.insertMany(docs);
    await Investor.create({ investorName: 'Synthetic Steel', sector: 'Manufacturing', countryOfOrigin: 'China' });
    await ChangeLog.collection.deleteMany({});

    const res = await exportOf('investors?sector=Agribusiness,Alien&sort=name').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="oysipa-investors-\d{4}-\d{2}-\d{2}\.csv"/);
    const out = lines(res.text);
    expect(out[0]).toBe('Filters: sector=Agribusiness; sort=name');
    expect(out[1].split(',').slice(0, 3)).toEqual(['Name', 'Organisation type', 'Sector']);
    expect(out[1]).toMatch(/Key contact person,Email,Phone/);
    expect(out).toHaveLength(122);
    expect(out[2]).toMatch(/^Synthetic Agro 000,Investor,Agribusiness,/);
    expect(out[2]).toMatch(/2025-03-01/);
    expect(out[2]).toMatch(/agro0@example\.com/);

    // Same rows as the list.
    const listed = await request(app).get('/api/investors?sector=Agribusiness,Alien&sort=name').set('Authorization', bearer(staffToken)).expect(200);
    expect(listed.body).toHaveLength(120);

    const rows = await exportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entity: 'Investor', action: 'export', byName: 'Export Staff', role: 'Staff',
    });
    expect(rows[0].snapshot).toMatchObject({ list: 'investors', rowCount: 120, filters: { sector: 'Agribusiness', sort: 'name' } });
  });

  it('more than the cap → 400 "narrow the filters", no audit row', async () => {
    exportController.limits.maxRows = 1;
    await Investor.create({ investorName: 'Synthetic Two', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    const res = await exportOf('investors').expect(400);
    expect(res.body.message).toMatch(/Narrow the filters/);
    expect(await exportRows()).toHaveLength(0);
  });

  it('the audit write fails → 500 and no CSV', async () => {
    jest.spyOn(ChangeLog, 'insertMany').mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await exportOf('investors').expect(500);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.text).not.toMatch(/Filters:/);
  });

  it('change log export: DG/PA only (Staff → 403); entity ChangeLog; bad filter → 400', async () => {
    const denied = await exportOf('changelog').expect(403);
    expect(denied.body).toHaveProperty('msg');
    await exportOf('changelog?entity=Nope', global.dgToken).expect(400);
    await Investor.create({ investorName: 'Audited Synthetic', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    const res = await exportOf('changelog?entity=Investor', global.portalAdminToken).expect(200);
    const out = lines(res.text);
    expect(out[0]).toBe('Filters: entity=Investor');
    expect(out[1]).toBe('Time,By,Role,Entity,Record id,Action,Reason,Changed fields,Batch id');
    expect(out.length).toBeGreaterThanOrEqual(3);
    const rows = await exportRows();
    expect(rows.map((r) => r.entity)).toEqual(['ChangeLog']);
    await exportOf('nothing', global.dgToken).expect(404);
  });

  it('projects (currency column), interactions, issues, announcements and evidence exports', async () => {
    const lead = await LifecycleStatus.create({ name: 'Lead', order: 2 });
    const inv = await Investor.create({ investorName: 'Synthetic Mill Co', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    const project = await InvestmentProject.create({
      projectTitle: 'Synthetic Mill', investor: inv._id, lifecycleStatus: lead._id, estimatedValue: 2500, currency: 'USD', estimatedNumberOfJobs: 4,
    });
    let out = lines((await exportOf('projects?hasValue=1').expect(200)).text);
    expect(out[1]).toMatch(/^Title,Investor,Sector,Lifecycle status,Currency,Estimated value,Estimated jobs/);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatch(/^Synthetic Mill,Synthetic Mill Co,.*,Lead,USD,2500,4,/);

    await InteractionLog.create({
      investor: inv._id, loggedBy: staff._id, description: '=HYPERLINK("x") call', category: 'Phone', interactionDate: new Date('2026-02-03T00:00:00.000Z'),
    });
    out = lines((await exportOf('interactions?noCode=1').expect(200)).text);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatch(/^2026-02-03,/);
    // A formula-like cell is defused.
    expect(out[2]).toContain('"\'=HYPERLINK(""x"") call"');

    await InvestorIssue.create({
      investor: inv._id, reference: 'ISS-09', dateRegistered: new Date(), dateReported: new Date('2026-01-05T00:00:00.000Z'), category: 'other', description: 'Synthetic, with a comma',
    });
    out = lines((await exportOf('issues?q=ISS-09').expect(200)).text);
    expect(out[2]).toMatch(/^ISS-09,2026-01-05,Synthetic Mill Co,/);
    expect(out[2]).toContain('"Synthetic, with a comma"');

    await InvestmentAnnouncement.create({
      project: project._id, announcementDate: new Date('2026-04-01T00:00:00.000Z'), outlet: 'Synthetic Times', oysipaNamed: false,
    });
    out = lines((await exportOf('announcements?year=2026').expect(200)).text);
    expect(out[2]).toMatch(/^2026-04-01,Synthetic Times,Synthetic Mill,Synthetic Mill Co,no,/);

    const folder = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes' });
    await EvidenceFile.create({
      folder: folder._id, fileName: 'synthetic.pdf', mimeType: 'application/pdf', size: 4, sha256: 'x1', provider: 'fake', key: 'secret-key', uploadedBy: staff._id, uploadedAt: new Date(),
    });
    const ev = await exportOf(`evidence?folder=${folder._id}&untagged=1`).expect(200);
    out = lines(ev.text);
    expect(out[2]).toMatch(/^synthetic\.pdf,Programmes,/);
    expect(ev.text).not.toContain('secret-key');

    const entities = (await exportRows()).map((r) => r.entity).sort();
    expect(entities).toEqual(['EvidenceFile', 'InteractionLog', 'InvestmentAnnouncement', 'InvestmentProject', 'InvestorIssue']);
  });

  it('csv cells: quotes, commas, newlines and formulas', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell('line\nbreak')).toBe('"line\nbreak"');
    // Plain phone numbers and numbers are kept as typed (review #11).
    expect(cell('+234 801 234 5678')).toBe('+234 801 234 5678');
    expect(cell('-5')).toBe('-5');
    expect(cell('+1')).toBe('+1');
    expect(cell('+cmd')).toBe("'+cmd");
    expect(cell('-2+3')).toBe("'-2+3");
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell(-5)).toBe('-5');
    expect(cell(null)).toBe('');
  });

  it('the cap boundary: exactly the cap is allowed, one more is refused (counted before loading)', async () => {
    await Investor.create({ investorName: 'Synthetic Cap A', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    // 2 investors with Test Investor.
    exportController.limits.maxRows = 2;
    await exportOf('investors').expect(200);
    exportController.limits.maxRows = 1;
    const res = await exportOf('investors').expect(400);
    expect(res.body.rowCount).toBe(2);
    const find = jest.spyOn(Investor, 'find');
    await exportOf('investors').expect(400);
    expect(find).not.toHaveBeenCalled();
    expect(await exportRows()).toHaveLength(1);
    // Change log path: counted too.
    await ChangeLog.collection.deleteMany({});
    await Investor.create({ investorName: 'Synthetic Cap B', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    await Investor.create({ investorName: 'Synthetic Cap C', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    expect((await exportOf('changelog', global.dgToken).expect(400)).body.message).toMatch(/Narrow the filters/);
    exportController.limits.maxRows = 2;
    await exportOf('changelog', global.dgToken).expect(200);
  });

  it('Staff change log export → 403 and no audit row; the audit row uses the list sentinel id; q is cut to 200', async () => {
    await exportOf('changelog').expect(403);
    expect(await exportRows()).toHaveLength(0);
    await exportOf(`investors?q=${'x'.repeat(250)}`).expect(200);
    await exportOf('investors').expect(200);
    const rows = await exportRows();
    expect(rows.map((r) => String(r.entityId))).toEqual([exportController.EXPORT_ENTITY_IDS.investors, exportController.EXPORT_ENTITY_IDS.investors]);
    expect(rows.map((r) => (r.snapshot.filters.q || '').length).sort()).toEqual([0, 200]);
  });

  it('export rows = list rows (same records, same order) for every list', async () => {
    const lead = await LifecycleStatus.create({ name: 'Lead', order: 2 });
    const folder = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes' });
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const inv = await Investor.create({
        investorName: `Synthetic Order ${i}`, sector: i % 2 ? 'Agribusiness' : 'Manufacturing', countryOfOrigin: ['Nigeria', 'Ghana', 'China', 'Togo'][i], firstContactDate: new Date(`202${i}-01-0${i + 1}T00:00:00.000Z`),
      });
      // eslint-disable-next-line no-await-in-loop
      const p = await InvestmentProject.create({
        projectTitle: `Synthetic Project ${3 - i}`, investor: inv._id, lifecycleStatus: lead._id, estimatedValue: i * 10, estimatedNumberOfJobs: 4 - i,
      });
      // eslint-disable-next-line no-await-in-loop
      await InteractionLog.create({
        investor: inv._id, loggedBy: staff._id, description: `Synthetic call ${i}`, category: 'Phone', interactionDate: new Date(`2026-0${i + 1}-10T00:00:00.000Z`),
      });
      // eslint-disable-next-line no-await-in-loop
      await InvestorIssue.create({
        investor: inv._id, reference: `ISS-1${i}`, dateRegistered: new Date(), dateReported: new Date(`2025-0${i + 1}-10T00:00:00.000Z`), category: 'other', description: 'Synthetic order issue',
      });
      // eslint-disable-next-line no-await-in-loop
      await InvestmentAnnouncement.create({
        project: p._id, announcementDate: new Date(`2026-0${4 - i}-01T00:00:00.000Z`), outlet: `Synthetic Outlet ${i}`, oysipaNamed: false,
      });
      // eslint-disable-next-line no-await-in-loop
      await EvidenceFile.create({
        folder: folder._id, fileName: `order-${i}.pdf`, mimeType: 'application/pdf', size: 4, sha256: `ord${i}`, provider: 'fake', key: `ok${i}`, uploadedBy: staff._id, uploadedAt: new Date(`2026-0${4 - i}-01T10:00:00.000Z`),
      });
    }
    const ids = (text) => {
      const out = lines(text);
      const col = out[1].split(',').indexOf('Record id');
      return out.slice(2).map((l) => l.split(',')[col]);
    };
    const cases = [
      ['investors', '/api/investors', 'sort=-country'],
      ['investors', '/api/investors', 'sort=firstContact&sector=Agribusiness'],
      ['projects', '/api/projects', 'sort=-value'],
      ['projects', '/api/projects', 'sort=jobs&hasJobs=1'],
      ['interactions', '/api/interactions', 'sort=date'],
      ['interactions', '/api/interactions', ''],
      ['issues', '/api/issues', 'sort=date'],
      ['announcements', '/api/announcements', ''],
      ['evidence', '/api/evidence/files', 'sort=-date'],
      ['evidence', '/api/evidence/files', 'sort=name&type=pdf'],
    ];
    for (const [list, api, qs] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const listed = (await request(app).get(`${api}?${qs}`).set('Authorization', bearer(staffToken)).expect(200)).body.map((r) => String(r._id));
      // eslint-disable-next-line no-await-in-loop
      const exported = ids((await exportOf(`${list}?${qs}`).expect(200)).text);
      expect({ list, qs, ids: exported }).toEqual({ list, qs, ids: listed });
      expect(listed.length).toBeGreaterThan(0);
    }
    // Change log: export = the viewer's rows, newest first.
    const viewer = (await request(app).get('/api/changelog?entity=Investor').set('Authorization', bearer(global.dgToken)).expect(200)).body.rows;
    const out = lines((await exportOf('changelog?entity=Investor', global.dgToken).expect(200)).text).slice(2);
    expect(out.map((l) => l.split(',')[4])).toEqual(viewer.map((r) => String(r.entityId)));
  });

  it('an interaction with no happened date exports its recorded Lagos day', async () => {
    const inv = await Investor.create({ investorName: 'Synthetic Night', sector: 'Agribusiness', countryOfOrigin: 'Nigeria' });
    const log = await InteractionLog.create({ investor: inv._id, loggedBy: staff._id, description: 'Night note', category: 'Note' });
    await InteractionLog.updateOne({ _id: log._id }, { $unset: { interactionDate: 1 } });
    await InteractionLog.collection.updateOne({ _id: log._id }, { $set: { createdAt: new Date('2026-03-31T23:30:00.000Z') } });
    const out = lines((await exportOf('interactions?q=night').expect(200)).text);
    expect(out[2]).toMatch(/^2026-04-01,2026-03-31T23:30:00\.000Z,/);
  });
});
