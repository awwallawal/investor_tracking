// Story 11.15: global search across record types (synthetic data only).
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

const bearer = (t) => `Bearer ${t}`;
const sign = (user) => jwt.sign({ user: { id: user._id.toString(), role: user.role } }, process.env.JWT_SECRET, { expiresIn: '1h' });

let staffToken;
let f;

beforeEach(async () => {
  await Promise.all([InvestorIssue.deleteMany({}), InvestmentAnnouncement.deleteMany({}), EvidenceFile.deleteMany({}), EvidenceFolder.deleteMany({})]);
  const staff = await User.create({ name: 'Search Staff', email: 'search.staff@example.com', password: 'password123', role: 'Staff', status: 'active' });
  staffToken = sign(staff);
  const idea = await LifecycleStatus.findOne({ name: 'Idea' });
  const investors = [];
  for (let i = 1; i <= 7; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    investors.push(await Investor.create({ investorName: `Electra Synthetic ${i}`, sector: 'Manufacturing', countryOfOrigin: 'Nigeria' }));
  }
  const project = await InvestmentProject.create({ projectTitle: 'Electric Bus Plant', investor: investors[0]._id, lifecycleStatus: idea._id });
  await InteractionLog.create({
    investor: investors[0]._id, loggedBy: staff._id, description: 'Discussed the electric grid link', category: 'Meeting',
  });
  const issue = await InvestorIssue.create({
    investor: investors[1]._id, reference: 'ISS-05', dateRegistered: new Date(), dateReported: new Date('2026-03-01T00:00:00.000Z'), category: 'utilities/power', description: 'Power supply to the site',
  });
  await InvestmentAnnouncement.create({
    project: project._id, announcementDate: new Date('2026-04-01T00:00:00.000Z'), outlet: 'Electronic Daily', oysipaNamed: false,
  });
  const folder = await EvidenceFolder.create({ key: 'programmes', name: 'Programmes' });
  const file = await EvidenceFile.create({
    folder: folder._id, fileName: 'electrification-forum.pdf', mimeType: 'application/pdf', size: 4, sha256: 's1', provider: 'fake', key: 'k-search', uploadedBy: staff._id, uploadedAt: new Date(),
  });
  f = {
    investors, project, issue, folder, file,
  };
});

const search = (q, token = staffToken) => request(app).get(`/api/search?q=${encodeURIComponent(q)}`).set('Authorization', bearer(token));
const byType = (body) => Object.fromEntries(body.groups.map((g) => [g.type, g]));

describe('Global search', () => {
  it('"ele": grouped results in a fixed order, top 5 per group, counts and links', async () => {
    const res = await search('ele').expect(200);
    expect(res.body.q).toBe('ele');
    expect(res.body.groups.map((g) => g.type)).toEqual(['investors', 'projects', 'issues', 'announcements', 'interactions', 'files']);
    const g = byType(res.body);
    expect(g.investors.count).toBe(7);
    expect(g.investors.items).toHaveLength(5);
    expect(g.investors.items[0]).toMatchObject({ title: 'Electra Synthetic 1', to: `/investors/${f.investors[0]._id}` });
    expect(g.investors.seeAll).toBe('/investors?q=ele');
    expect(g.projects).toMatchObject({ count: 1, label: 'Projects' });
    expect(g.projects.items[0]).toMatchObject({ title: 'Electric Bus Plant', to: `/projects/${f.project._id}` });
    expect(g.announcements.items[0].title).toBe('Electronic Daily');
    expect(g.interactions.items[0].to).toBe(`/interactions?q=Discussed+the+electric+grid+link&investor=${f.investors[0]._id}`);
    expect(g.files.items[0]).toMatchObject({ title: 'electrification-forum.pdf', to: `/evidence/${f.folder._id}?q=electrification-forum.pdf` });
    expect(g.files.seeAll).toBe('/evidence?q=ele');
    expect(g.issues.count).toBe(0);
    // "See all" lists exactly `count` rows.
    const all = await request(app).get(`/api${g.investors.seeAll}`).set('Authorization', bearer(staffToken)).expect(200);
    expect(all.body).toHaveLength(g.investors.count);
  });

  it('an issue reference and part of a file name (DG)', async () => {
    const issue = byType((await search('ISS-05', global.dgToken).expect(200)).body).issues;
    expect(issue.count).toBe(1);
    expect(issue.items[0]).toMatchObject({ title: 'ISS-05 · Electra Synthetic 2', to: `/issues/${f.issue._id}` });
    const files = byType((await search('forum', global.dgToken).expect(200)).body).files;
    expect(files.count).toBe(1);
    expect(files.items[0]).not.toHaveProperty('key');
  });

  it('fewer than 2 characters → 400; Staff never get a change-log group', async () => {
    await search('e').expect(400);
    await search(' ! ').expect(400);
    await request(app).get('/api/search').set('Authorization', bearer(staffToken)).expect(400);
    const res = await search('electra').expect(200);
    expect(res.body.groups.map((g) => g.type)).not.toContain('changelog');
    await request(app).get('/api/search?q=electra').expect(401);
    // An array q uses its first value.
    const arr = await request(app).get('/api/search?q=electra&q=zz').set('Authorization', bearer(staffToken)).expect(200);
    expect(arr.body.q).toBe('electra');
  });

  it('round trips: every group\'s "See all" lists its items; list-type item links find the item', async () => {
    const res = await search('ele').expect(200);
    const toApi = (to) => {
      const [path, query] = to.split('?');
      const api = path === '/evidence' ? '/api/evidence/files' : `/api${path}`;
      return `${api}${query ? `?${query}` : ''}`;
    };
    for (const g of res.body.groups.filter((x) => x.count > 0)) {
      // eslint-disable-next-line no-await-in-loop
      const all = (await request(app).get(toApi(g.seeAll)).set('Authorization', bearer(staffToken)).expect(200)).body;
      expect({ type: g.type, length: all.length }).toEqual({ type: g.type, length: g.count });
      const ids = all.map((r) => String(r._id));
      g.items.forEach((item) => expect(ids).toContain(String(item._id)));
    }
    // The interaction link opens the interactions list on that log.
    const log = byType(res.body).interactions.items[0];
    expect(log.to).toMatch(/^\/interactions\?q=.+&investor=/);
    const opened = (await request(app).get(toApi(log.to)).set('Authorization', bearer(staffToken)).expect(200)).body;
    expect(opened.map((r) => String(r._id))).toEqual([String(log._id)]);
    // The file link opens its folder filtered to the file.
    const file = byType(res.body).files.items[0];
    const [folderPath, folderQuery] = file.to.split('?');
    const folderFiles = (await request(app).get(`/api/evidence/folders/${folderPath.split('/')[2]}/files?${folderQuery}`).set('Authorization', bearer(staffToken)).expect(200)).body.files;
    expect(folderFiles.map((x) => String(x._id))).toEqual([String(file._id)]);
  });
});
