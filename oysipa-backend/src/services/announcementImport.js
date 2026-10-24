// Announcements loader (story 11.8, DLR 4.4), from the content studio's
// announcements JSON. Used by scripts/import-announcements.js.
//
// planAnnouncementImport(data) reads the database and the files; it never
// writes or uploads. applyAnnouncementImport(plan, actor) writes exactly that plan.
//
// Rules (spec-11-8):
// - File: { announcements: [ { id, investorName, projectTitle, announcementDate
//   (YYYY-MM-DD), outlet, url?, archivedCopyUrl?, oysipaNamed, oysipaRoleText?,
//   supportingInteractionRefs?: [interaction importRef], archivedFiles?: [path], note? } ] }.
// - The investor is matched by exact name, the project by exact title within
//   that investor. Unknown or ambiguous → row error.
// - Interaction refs must belong to that project or investor; a bad ref is a
//   row warning and is skipped.
// - Repeat-safe by importRef (= id): an announcement that exists is not created
//   again and never overwritten; rows that differ are listed (field names only).
//   Its files are still checked (stored once, linked once).
// - Files go through the same storage, type list and size limit as uploads, are
//   stored once by SHA-256 in the first announcement's library subfolder
//   (announcements/<ref>) and linked to the investor and the announcement.
// - Per-row problems are reported and the run continues. Never thrown.
// - Every creation is written first and audited after (ChangeLog `import`, and
//   `link` for file links); a failed audit undoes it.
// - The report holds counts and refs only: no names.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const InvestmentAnnouncement = require('../models/InvestmentAnnouncement');
const EvidenceFile = require('../models/EvidenceFile');
const documentStorage = require('./documentStorage');
const { recordChanges, newBatchId } = require('../utils/recordDeletion');
const { runAs } = require('../utils/auditContext');
const { parseHappenedDate } = require('../utils/happenedDate');
const { sha256, mimeFromName } = require('./evidenceLibrary');
const { ensureAnnouncementFolder } = require('./announcementRegister');
const { MAX_URL_LENGTH } = require('../constants/announcementFields');

const text = (v) => (typeof v === 'string' ? v.trim() : '');

const isHttpUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
};

const parseAnnouncementsFile = (input) => {
  let data;
  try {
    data = JSON.parse(Buffer.isBuffer(input) ? input.toString('utf8') : String(input));
  } catch (err) {
    throw new Error('The announcements file is not valid JSON');
  }
  if (!data || !Array.isArray(data.announcements)) throw new Error('The announcements file has no "announcements" list');
  return data;
};

// Validates one row. Returns { ref, investorName, projectTitle, doc, interactionRefs, files, errors[] }.
const checkRow = (r) => {
  const errors = [];
  const ref = text(r.id);
  if (!ref) errors.push('no id');
  const investorName = text(r.investorName);
  if (!investorName) errors.push('no investorName');
  const projectTitle = text(r.projectTitle);
  if (!projectTitle) errors.push('no projectTitle');
  const date = parseHappenedDate(r.announcementDate, { required: true, label: 'announcementDate' });
  if (date.error) errors.push(date.error);
  const outlet = text(r.outlet);
  if (!outlet) errors.push('no outlet');
  // An optional link: too long, or not http(s), is a row error.
  const checkUrl = (value, label) => {
    if (!value) return;
    if (value.length > MAX_URL_LENGTH) errors.push(`${label} is too long`);
    else if (!isHttpUrl(value)) errors.push(`${label} is not an http(s) link`);
  };
  const url = text(r.url);
  checkUrl(url, 'url');
  if (r.url !== undefined && r.url !== null && typeof r.url !== 'string') errors.push('url is not text');
  const archivedCopyUrl = text(r.archivedCopyUrl);
  checkUrl(archivedCopyUrl, 'archivedCopyUrl');
  if (r.archivedCopyUrl !== undefined && r.archivedCopyUrl !== null && typeof r.archivedCopyUrl !== 'string') errors.push('archivedCopyUrl is not text');
  if (typeof r.oysipaNamed !== 'boolean') errors.push('oysipaNamed must be true or false');
  const oysipaRoleText = text(r.oysipaRoleText);
  if (r.oysipaNamed === true && !oysipaRoleText) errors.push('oysipaRoleText is required when oysipaNamed is true');
  const refsRaw = r.supportingInteractionRefs;
  if (refsRaw !== undefined && refsRaw !== null && !Array.isArray(refsRaw)) errors.push('supportingInteractionRefs is not a list');
  const filesRaw = r.archivedFiles;
  if (filesRaw !== undefined && filesRaw !== null && !Array.isArray(filesRaw)) errors.push('archivedFiles is not a list');

  return {
    ref,
    investorName,
    projectTitle,
    errors,
    doc: {
      announcementDate: date.value,
      outlet,
      url: url || undefined,
      archivedCopyUrl: archivedCopyUrl || undefined,
      oysipaNamed: r.oysipaNamed === true,
      oysipaRoleText: oysipaRoleText || undefined,
      importRef: ref,
      importNote: text(r.note) || undefined,
    },
    interactionRefs: Array.isArray(refsRaw) ? refsRaw : [],
    files: Array.isArray(filesRaw) ? filesRaw : [],
  };
};

const same = (a, b) => (a === undefined || a === null ? '' : a) === (b === undefined || b === null ? '' : b);
const isoOrEmpty = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString();
};
const idList = (l) => [...new Set((l || []).map(String))].sort().join('|');

// Field names of a loaded announcement that differ from its file row (no values).
const changedFields = (doc, projectId, interactionIds, stored) => {
  const fields = [];
  if (String(projectId) !== String(stored.project)) fields.push('project');
  if (isoOrEmpty(doc.announcementDate) !== isoOrEmpty(stored.announcementDate)) fields.push('announcementDate');
  ['outlet', 'url', 'archivedCopyUrl', 'oysipaRoleText', 'importNote'].forEach((f) => {
    if (!same(doc[f], stored[f])) fields.push(f);
  });
  if (doc.oysipaNamed !== (stored.oysipaNamed === true)) fields.push('oysipaNamed');
  if (idList(interactionIds) !== idList(stored.supportingInteractions)) fields.push('supportingInteractions');
  return fields;
};

// The project with this exact title within the investor with this exact name.
// Returns { project } or { error }.
const matchProject = async (investorName, projectTitle) => {
  const investors = await Investor.find({ investorName }).select('_id').limit(2).lean();
  if (investors.length === 0) return { error: 'no investor with this exact name' };
  if (investors.length > 1) return { error: 'several investors have this name' };
  const projects = await InvestmentProject.find({ investor: investors[0]._id, projectTitle }).select('_id investor').limit(2).lean();
  if (projects.length === 0) return { error: 'no project with this exact title for that investor' };
  if (projects.length > 1) return { error: 'that investor has several projects with this title' };
  return { project: projects[0] };
};

// Interaction refs (InteractionLog.importRef) that belong to the project or its
// investor. Returns { ids, skipped: [{ index, reason }] }.
const resolveInteractionRefs = async (refs, project) => {
  const skipped = [];
  const wanted = refs.map((r) => text(r));
  const present = [...new Set(wanted.filter(Boolean))];
  const logs = present.length
    ? await InteractionLog.find({ importRef: { $in: present } }).select('_id importRef project investor').lean()
    : [];
  const byRef = new Map(logs.map((l) => [l.importRef, l]));
  const projectIds = new Set((await InvestmentProject.find({ investor: project.investor }).distinct('_id')).map(String));
  projectIds.add(String(project._id));
  const ids = [];
  wanted.forEach((r, i) => {
    if (!r) { skipped.push({ index: i + 1, reason: 'empty' }); return; }
    const log = byRef.get(r);
    if (!log) { skipped.push({ index: i + 1, ref: r, reason: 'no interaction with this importRef' }); return; }
    const belongs = (log.project && projectIds.has(String(log.project)))
      || (log.investor && String(log.investor) === String(project.investor));
    if (!belongs) { skipped.push({ index: i + 1, ref: r, reason: 'interaction of another project or investor' }); return; }
    if (!ids.some((x) => String(x) === String(log._id))) ids.push(log._id);
  });
  return { ids, skipped };
};

// Plans one run. `filesRoot` resolves relative archivedFiles paths.
const planAnnouncementImport = async (data, { filesRoot = process.cwd(), maxBytes = documentStorage.maxBytes() } = {}) => {
  const rows = data.announcements || [];
  const counts = {
    announcements: rows.length,
    toCreate: 0,
    existing: 0,
    changed: 0,
    errors: 0,
    warnings: 0,
    interactionLinks: 0,
    files: 0,
    fileErrors: 0,
    filesToUpload: 0,
    filesAlreadyStored: 0,
    linksToAdd: 0,
    linksExisting: 0,
  };
  const errors = []; // { row, ref, reason }
  const warnings = []; // { row, ref, message }
  const announcements = []; // valid rows: { row, ref, project, investor, existingId, doc }
  const changes = []; // loaded announcements that differ from the file: { row, ref, fields[] }
  const files = new Map(); // sha → { sha256, abs, fileName, mimeType, size, firstRef, existingId, existingLinks, links }

  const refs = rows.map((r) => text(r && r.id)).filter(Boolean);
  const existingRows = refs.length ? await InvestmentAnnouncement.find({ importRef: { $in: refs } }).lean() : [];
  const existingByRef = new Map(existingRows.map((a) => [a.importRef, a]));
  const seenRefs = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const row = i + 1;
    const checked = checkRow(rows[i] || {});
    const ref = checked.ref || `#${row}`;
    const fail = (reason) => { counts.errors += 1; errors.push({ row, ref, reason }); };
    const warn = (message) => { counts.warnings += 1; warnings.push({ row, ref, message }); };
    if (checked.ref && seenRefs.has(checked.ref)) { fail('id appears twice in the file'); continue; }
    if (checked.ref) seenRefs.add(checked.ref);
    if (checked.errors.length) { fail(checked.errors.join('; ')); continue; }

    const existing = existingByRef.get(checked.ref);
    // eslint-disable-next-line no-await-in-loop
    const matched = await matchProject(checked.investorName, checked.projectTitle);
    let project;
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      project = await InvestmentProject.findById(existing.project).select('_id investor').lean();
      counts.existing += 1;
      if (matched.error) {
        // Renamed since loading (or gone): nothing to compare against.
        warn('investor/project no longer matches by name; not compared with the file');
      } else {
        // eslint-disable-next-line no-await-in-loop
        const interactionIds = (await resolveInteractionRefs(checked.interactionRefs, matched.project)).ids;
        const fields = changedFields(checked.doc, matched.project._id, interactionIds, existing);
        if (fields.length) { counts.changed += 1; changes.push({ row, ref: checked.ref, fields }); }
      }
      if (!project || !project.investor) {
        warn('the loaded announcement has no project investor; its files are skipped');
        continue;
      }
    } else {
      if (matched.error) { fail(matched.error); continue; }
      project = matched.project;
      counts.toCreate += 1;
    }

    let supporting = [];
    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveInteractionRefs(checked.interactionRefs, project);
      resolved.skipped.forEach((s) => warn(`supportingInteractionRefs #${s.index}${s.ref ? ` (${s.ref})` : ''} skipped: ${s.reason}`));
      supporting = resolved.ids;
      counts.interactionLinks += supporting.length;
    }

    announcements.push({
      row,
      ref: checked.ref,
      project: project._id,
      investor: project.investor,
      existingId: existing ? existing._id : null,
      doc: { ...checked.doc, supportingInteractions: supporting },
    });

    checked.files.forEach((p, j) => {
      counts.files += 1;
      const fileFail = (reason) => {
        counts.fileErrors += 1;
        errors.push({ row, ref, reason: `file #${j + 1}: ${reason}` });
      };
      if (typeof p !== 'string' || !p.trim()) { fileFail('no path'); return; }
      const mimeType = mimeFromName(p);
      if (!mimeType) { fileFail('file type not allowed (PDF, Word, Excel, JPEG, PNG only)'); return; }
      const root = path.resolve(filesRoot);
      const abs = path.resolve(root, p);
      const rel = path.relative(root, abs);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { fileFail('outside the files root'); return; }
      let stat;
      try { stat = fs.statSync(abs); } catch (e) { stat = null; }
      if (!stat || !stat.isFile()) { fileFail('file not found'); return; }
      if (stat.size === 0) { fileFail('file is empty'); return; }
      if (stat.size > maxBytes) { fileFail(`file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`); return; }
      const hash = sha256(fs.readFileSync(abs));
      if (!files.has(hash)) {
        files.set(hash, {
          sha256: hash, abs, fileName: path.basename(abs), mimeType, size: stat.size, firstRef: checked.ref, existingId: null, existingLinks: [], links: [],
        });
      }
      const f = files.get(hash);
      if (!f.links.some((l) => l.ref === checked.ref)) f.links.push({ ref: checked.ref, row, file: j + 1 });
    });
  }
  counts.errors += counts.fileErrors;

  // Existing files and links.
  const shas = [...files.keys()];
  const stored = shas.length ? await EvidenceFile.find({ sha256: { $in: shas } }).select('sha256 links').lean() : [];
  stored.forEach((e) => {
    const f = files.get(e.sha256);
    f.existingId = e._id;
    f.existingLinks = e.links || [];
  });
  const idByRef = new Map(announcements.filter((x) => x.existingId).map((x) => [x.ref, String(x.existingId)]));
  files.forEach((f) => {
    if (f.existingId) counts.filesAlreadyStored += 1; else counts.filesToUpload += 1;
    f.links = f.links.filter((l) => {
      const id = idByRef.get(l.ref);
      const linked = id && f.existingLinks.some((x) => x.announcement && String(x.announcement) === id);
      if (linked) counts.linksExisting += 1;
      return !linked;
    });
    counts.linksToAdd += f.links.length;
  });

  return {
    counts, errors, warnings, changes, announcements, files: [...files.values()],
  };
};

// Writes the plan: announcements, then folders and files, then links. Per-row
// failures are reported and the run continues. Returns { batchId, counts, errors }.
const writeAnnouncementImport = async (plan, actor, batchId) => {
  const user = actor && actor.user ? actor.user : actor;
  const result = {
    announcementsCreated: 0, foldersCreated: 0, filesUploaded: 0, linksAdded: 0, auditRows: 0,
  };
  const errors = []; // { ref, file?, stage }
  if (plan.files.some((f) => !f.existingId) && !documentStorage.isConfigured()) {
    throw new Error(documentStorage.NOT_CONFIGURED_MSG);
  }

  // 1. Announcements.
  const byRef = new Map(); // ref → { _id, project, investor, importRef, announcementDate }
  const FIELDS = 'project importRef announcementDate';
  for (const p of plan.announcements) {
    if (p.existingId) {
      // eslint-disable-next-line no-await-in-loop
      const ex = await InvestmentAnnouncement.findById(p.existingId).select(FIELDS).lean();
      if (ex) byRef.set(p.ref, { ...ex, investor: p.investor });
      else errors.push({ ref: p.ref, stage: 'announcement gone since the plan' });
      continue;
    }
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      project: p.project,
      ...p.doc,
      createdBy: user._id,
      importBatchId: batchId,
    };
    let stage = 'save';
    try {
      // eslint-disable-next-line no-await-in-loop
      await InvestmentAnnouncement.create(doc);
      stage = 'audit';
      // eslint-disable-next-line no-await-in-loop
      await recordChanges(user, 'import', [['InvestmentAnnouncement', [doc]]], { batchId });
      result.auditRows += 1;
      result.announcementsCreated += 1;
      byRef.set(p.ref, { ...doc, investor: p.investor });
    } catch (err) {
      if (stage === 'save' && err && err.code === 11000) {
        // Created by another run meanwhile: use it.
        // eslint-disable-next-line no-await-in-loop
        const ex = await InvestmentAnnouncement.findOne({ importRef: p.ref }).select(FIELDS).lean();
        if (ex) { byRef.set(p.ref, { ...ex, investor: p.investor }); continue; }
      }
      console.error(`Announcement ${p.ref}: ${stage} failed:`, err.message);
      if (stage === 'audit') {
        try {
          // eslint-disable-next-line no-await-in-loop
          await InvestmentAnnouncement.deleteOne({ _id: doc._id });
        } catch (undoError) {
          console.error(`Announcement ${p.ref}: could not remove the unaudited announcement`);
        }
      }
      errors.push({ ref: p.ref, stage });
    }
  }

  // 2. Files (stored once) and 3. links.
  const audit = { actor: user, batchId };
  for (const f of plan.files) {
    const owner = byRef.get(f.firstRef) || f.links.map((l) => byRef.get(l.ref)).find(Boolean);
    let fileId = f.existingId;
    if (!fileId) {
      if (!owner) {
        errors.push({ ref: f.firstRef, stage: 'file skipped (announcement not created)' });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const again = await EvidenceFile.findOne({ sha256: f.sha256 }).select('_id').lean();
      if (again) {
        fileId = again._id;
      } else {
        let folder;
        try {
          // eslint-disable-next-line no-await-in-loop
          const ensured = await ensureAnnouncementFolder(owner, audit);
          folder = ensured.folder;
          result.foldersCreated += ensured.created;
          result.auditRows += ensured.created;
        } catch (err) {
          console.error(`Announcement ${owner.importRef}: folder failed:`, err.message);
          errors.push({ ref: owner.importRef, stage: 'folder' });
          continue;
        }
        let buffer;
        try { buffer = fs.readFileSync(f.abs); } catch (err) { buffer = null; }
        if (!buffer || sha256(buffer) !== f.sha256) {
          errors.push({ ref: f.firstRef, stage: 'file changed since the plan' });
          continue;
        }
        let stored;
        try {
          // eslint-disable-next-line no-await-in-loop
          stored = await documentStorage.upload(buffer, { fileName: f.fileName, mimeType: f.mimeType });
        } catch (err) {
          console.error(`Announcement ${f.firstRef}: upload failed:`, err.message);
          errors.push({ ref: f.firstRef, stage: 'upload' });
          continue;
        }
        const doc = {
          _id: new mongoose.Types.ObjectId(),
          folder: folder._id,
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
          sha256: f.sha256,
          provider: stored.provider,
          key: stored.key,
          resourceType: stored.resourceType,
          uploadedBy: user._id,
          uploadedAt: new Date(),
          importBatchId: batchId,
          links: [],
        };
        let stage = 'save';
        try {
          // eslint-disable-next-line no-await-in-loop
          await EvidenceFile.create(doc);
          stage = 'audit';
          // eslint-disable-next-line no-await-in-loop
          await recordChanges(user, 'import', [['EvidenceFile', [doc]]], { batchId });
          result.auditRows += 1;
          result.filesUploaded += 1;
          fileId = doc._id;
        } catch (err) {
          console.error(`Announcement ${f.firstRef}: file ${stage} failed; removing the stored copy:`, err.message);
          if (stage === 'audit') {
            try {
              // eslint-disable-next-line no-await-in-loop
              await EvidenceFile.deleteOne({ _id: doc._id });
            } catch (undoError) {
              console.error(`Announcement ${f.firstRef}: could not remove the unaudited file row`);
            }
          }
          try {
            // eslint-disable-next-line no-await-in-loop
            await documentStorage.remove(doc);
          } catch (cleanupError) {
            console.error(`Announcement ${f.firstRef}: could not remove the orphaned stored file`);
          }
          errors.push({ ref: f.firstRef, stage: `file ${stage}` });
          continue;
        }
      }
    }

    for (const l of f.links) {
      const ann = byRef.get(l.ref);
      if (!ann) continue; // its announcement failed: already reported
      const link = {
        _id: new mongoose.Types.ObjectId(),
        investor: ann.investor,
        announcement: ann._id,
        serviceCodes: [],
        linkedBy: user._id,
        linkedAt: new Date(),
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await EvidenceFile.updateOne(
          { _id: fileId, links: { $not: { $elemMatch: { announcement: ann._id } } } },
          { $push: { links: link } },
        );
        if (res.modifiedCount === 1) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await recordChanges(user, 'link', [['EvidenceFile', [{ _id: fileId, link, ref: l.ref }]]], { batchId });
          } catch (auditError) {
            // eslint-disable-next-line no-await-in-loop
            await EvidenceFile.updateOne({ _id: fileId }, { $pull: { links: { _id: link._id } } });
            throw auditError;
          }
          result.auditRows += 1;
          result.linksAdded += 1;
        }
      } catch (err) {
        console.error(`Announcement ${l.ref}: link failed:`, err.message);
        errors.push({ ref: l.ref, file: l.file, stage: 'link' });
      }
    }
  }

  return { batchId, counts: result, errors };
};

// Story 11.10: runs with the import user as the audit actor and the run's
// batchId. The plugin's create rows are suppressed (the import writes its own
// `import` rows); updates of existing records still get update rows.
const applyAnnouncementImport = (plan, actor, { batchId = newBatchId() } = {}) => runAs(
  actor, () => writeAnnouncementImport(plan, actor, batchId), { batchId, suppress: ['create'] },
);

module.exports = {
  parseAnnouncementsFile, planAnnouncementImport, applyAnnouncementImport,
};
