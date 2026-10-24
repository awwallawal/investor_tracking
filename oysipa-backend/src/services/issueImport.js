// Investor issues loader (story 11.7), from the content studio's issues JSON.
// Used by scripts/import-issues.js.
//
// planIssueImport(data) reads the database and the files; it never writes or
// uploads. applyIssueImport(plan, actor) writes exactly that plan.
//
// Rules (spec-11-7):
// - The investor is matched by exact investorName. `project` is never matched:
//   the file's project text is kept in `projectText`.
// - Repeat-safe by importRef (the file's `id`, e.g. ISS-05): an issue that
//   exists is not created again; its files are still checked.
// - Change report (story 11.7b): a loaded issue whose file row differs from the
//   database is listed with the names of the differing fields (never values).
//   Those changes are never written.
// - Reference (11.7b): a new issue gets reference = its importRef when that is
//   ISS-NN and free (taken → row error), stored in the canonical form (ISS-5 →
//   ISS-05); any other importRef gets the next free number. Rows with their own
//   number are created first, so a numbered row never loses its number.
// - The report says a difference can also be an edit made in the app since loading.
// - Files go through the same storage, type list and size limit as uploads and
//   are stored once by SHA-256 in the first issue's library subfolder
//   (investor-issues/<ref>); each file is linked to the investor and the issue.
// - Per-row problems are reported and the run continues. Never thrown.
// - Every creation is written first and audited after (ChangeLog `import`, and
//   `link` for file links); a failed audit undoes it.
// - The report holds counts, refs and file numbers only: no names.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestorIssue = require('../models/InvestorIssue');
const EvidenceFile = require('../models/EvidenceFile');
const documentStorage = require('./documentStorage');
const { recordChanges, newBatchId } = require('../utils/recordDeletion');
const { runAs } = require('../utils/auditContext');
const { parseHappenedDate } = require('../utils/happenedDate');
const { sha256, mimeFromName } = require('./evidenceLibrary');
const {
  ensureIssueFolder, canonicalReference, isReferenceDuplicate, createWithReference,
} = require('./issueRegister');
const {
  ISSUE_STATUSES, RESOLVED, NOTE_REQUIRED_STATUSES, ISSUE_CATEGORIES, REPORTED_VIA,
} = require('../constants/issueFields');
const { resolveMda } = require('../constants/mdas');

const text = (v) => (typeof v === 'string' ? v.trim() : '');

const parseIssuesFile = (input) => {
  let data;
  try {
    data = JSON.parse(Buffer.isBuffer(input) ? input.toString('utf8') : String(input));
  } catch (err) {
    throw new Error('The issues file is not valid JSON');
  }
  if (!data || !Array.isArray(data.issues)) throw new Error('The issues file has no "issues" list');
  return data;
};

// Validates one issue row. Returns { doc, files, errors[], warnings[] }.
const checkRow = (r) => {
  const errors = [];
  const warnings = [];
  const ref = text(r.id);
  if (!ref) errors.push('no id');
  const category = text(r.category);
  if (!ISSUE_CATEGORIES.includes(category)) errors.push(`category not on the list (${category ? 'given' : 'empty'})`);
  const description = text(r.description);
  if (!description) errors.push('no description');
  const status = text(r.status) || 'Open';
  if (!ISSUE_STATUSES.includes(status)) errors.push('status not on the list');
  const reportedVia = text(r.reportedVia);
  if (reportedVia && !REPORTED_VIA.includes(reportedVia)) errors.push('reportedVia not on the list');
  const date = parseHappenedDate(r.dateReported, { required: true, label: 'dateReported' });
  if (date.error) errors.push(date.error);

  const mdas = [];
  (Array.isArray(r.mdaResponsible) ? r.mdaResponsible : []).forEach((m, i) => {
    // Code, vlprs name/abbreviation/old code or a studio alias (constants/mdas.js).
    const got = resolveMda(m);
    if (got.error) errors.push(`mdaResponsible #${i + 1} is not on the MDA list`);
    else {
      if (got.qualified) warnings.push(`mdaResponsible #${i + 1} recorded as ${got.codes.join(' + ')} (qualifier dropped)`);
      got.codes.forEach((c) => { if (!mdas.includes(c)) mdas.push(c); });
    }
  });
  if (r.mdaResponsible !== undefined && !Array.isArray(r.mdaResponsible)) errors.push('mdaResponsible is not a list');

  if (r.actions !== undefined && r.actions !== null && !Array.isArray(r.actions)) errors.push('actions is not a list');
  if (r.evidenceFiles !== undefined && r.evidenceFiles !== null && !Array.isArray(r.evidenceFiles)) errors.push('evidenceFiles is not a list');
  const actions = [];
  (Array.isArray(r.actions) ? r.actions : []).forEach((a, i) => {
    const d = parseHappenedDate(a && a.date, { required: true, label: `action #${i + 1} date` });
    if (d.error) errors.push(d.error);
    const note = text(a && a.note);
    if (!note) errors.push(`action #${i + 1} has no note`);
    if (!d.error && note) actions.push({ date: d.value, by: text(a.by) || undefined, note });
  });

  const resolution = text(r.resolution);
  if (NOTE_REQUIRED_STATUSES.includes(status) && !resolution) errors.push(`status ${status} needs a resolution / reason note`);
  if (r.resolvedDate) warnings.push('resolvedDate in the file is not used (the server sets it)');

  return {
    ref,
    investorName: text(r.investorName),
    errors,
    warnings,
    doc: {
      projectText: text(r.project) || undefined,
      dateReported: date.value,
      reportedVia: reportedVia || undefined,
      mdaResponsible: mdas,
      category,
      description,
      status,
      actions,
      resolution: resolution || undefined,
      importRef: ref,
      importNote: text(r.note) || undefined,
    },
    files: Array.isArray(r.evidenceFiles) ? r.evidenceFiles : [],
  };
};

// Field names of a loaded issue that differ from its file row (no values).
const same = (a, b) => (a === undefined || a === null ? '' : a) === (b === undefined || b === null ? '' : b);
// ISO string of a date, or '' when missing or invalid (never throws).
const isoOrEmpty = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString();
};
const changedFields = (doc, investorName, stored, storedInvestorName) => {
  const fields = [];
  ['category', 'description', 'status', 'reportedVia'].forEach((f) => {
    if (!same(doc[f], stored[f])) fields.push(f);
  });
  const sortedCodes = (l) => [...(Array.isArray(l) ? l : [])].sort().join('|');
  if (sortedCodes(doc.mdaResponsible) !== sortedCodes(stored.mdaResponsible)) fields.push('mdaResponsible');
  if (isoOrEmpty(doc.dateReported) !== isoOrEmpty(stored.dateReported)) fields.push('dateReported');
  ['projectText', 'resolution', 'importNote'].forEach((f) => {
    if (!same(doc[f], stored[f])) fields.push(f);
  });
  const fileActions = doc.actions || [];
  const dbActions = stored.actions || [];
  if (fileActions.length !== dbActions.length
    || fileActions.some((a, i) => isoOrEmpty(a.date) !== isoOrEmpty(dbActions[i].date)
      || !same(a.note, dbActions[i].note) || !same(a.by, dbActions[i].by))) {
    fields.push('actions');
  }
  // Only when the file gives a name.
  if (investorName && !same(investorName, storedInvestorName)) fields.push('investorName');
  return fields;
};

// Plans one run. `filesRoot` resolves relative evidence paths.
const planIssueImport = async (data, { filesRoot = process.cwd(), maxBytes = documentStorage.maxBytes() } = {}) => {
  const rows = data.issues || [];
  const counts = {
    issues: rows.length,
    toCreate: 0,
    existing: 0,
    changed: 0,
    errors: 0,
    warnings: 0,
    files: 0,
    fileErrors: 0,
    filesToUpload: 0,
    filesAlreadyStored: 0,
    linksToAdd: 0,
    linksExisting: 0,
  };
  const errors = []; // { row, ref, reason }
  const warnings = []; // { row, ref, message }
  const issues = []; // valid rows: { row, ref, investor, existingId, reference, doc }
  const changes = []; // loaded issues that differ from the file: { row, ref, fields[] }
  const files = new Map(); // sha → { sha256, abs, fileName, mimeType, size, firstRef, existingId, existingLinks, links: [{ref,row}] }

  const refs = rows.map((r) => text(r && r.id)).filter(Boolean);
  const existingIssues = refs.length
    ? await InvestorIssue.find({ importRef: { $in: refs } }).lean()
    : [];
  const existingByRef = new Map(existingIssues.map((i) => [i.importRef, i]));
  const storedInvestors = existingIssues.length
    ? await Investor.find({ _id: { $in: existingIssues.map((i) => i.investor) } }).select('investorName').lean()
    : [];
  const investorNameById = new Map(storedInvestors.map((v) => [String(v._id), v.investorName]));
  // References already used by other issues (a new ISS-NN row cannot take
  // one), compared in the canonical form.
  const formatRefs = [...new Set(refs.map(canonicalReference).filter(Boolean))];
  const takenRefs = new Set(formatRefs.length
    ? (await InvestorIssue.find({ reference: { $in: formatRefs } }).select('reference').lean()).map((i) => i.reference)
    : []);
  const plannedRefs = new Set(); // canonical references of new rows in this file
  const seenRefs = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const row = i + 1;
    const checked = checkRow(rows[i] || {});
    const ref = checked.ref || `#${row}`;
    checked.warnings.forEach((message) => { counts.warnings += 1; warnings.push({ row, ref, message }); });
    const fail = (reason) => { counts.errors += 1; errors.push({ row, ref, reason }); };
    if (checked.ref && seenRefs.has(checked.ref)) { fail('id appears twice in the file'); continue; }
    if (checked.ref) seenRefs.add(checked.ref);
    if (checked.errors.length) { fail(checked.errors.join('; ')); continue; }

    let investorId;
    const existing = existingByRef.get(checked.ref);
    if (existing) {
      investorId = existing.investor;
      counts.existing += 1;
      const fields = changedFields(checked.doc, checked.investorName, existing, investorNameById.get(String(existing.investor)));
      if (fields.length) { counts.changed += 1; changes.push({ row, ref: checked.ref, fields }); }
    } else {
      const wanted = canonicalReference(checked.ref);
      if (wanted && (takenRefs.has(wanted) || plannedRefs.has(wanted))) { fail(`reference ${wanted} is already used`); continue; }
      if (wanted) plannedRefs.add(wanted);
      if (!checked.investorName) { fail('no investorName'); continue; }
      // eslint-disable-next-line no-await-in-loop
      const found = await Investor.find({ investorName: checked.investorName }).select('_id').limit(2).lean();
      if (found.length === 0) { fail('no investor with this exact name'); continue; }
      if (found.length > 1) { fail('several investors have this name'); continue; }
      investorId = found[0]._id;
      counts.toCreate += 1;
    }
    issues.push({
      row,
      ref: checked.ref,
      investor: investorId,
      existingId: existing ? existing._id : null,
      reference: existing ? null : canonicalReference(checked.ref),
      doc: checked.doc,
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
  const issueIdByRef = new Map(issues.filter((x) => x.existingId).map((x) => [x.ref, String(x.existingId)]));
  files.forEach((f) => {
    if (f.existingId) counts.filesAlreadyStored += 1; else counts.filesToUpload += 1;
    f.links = f.links.filter((l) => {
      const id = issueIdByRef.get(l.ref);
      const linked = id && f.existingLinks.some((x) => x.issue && String(x.issue) === id);
      if (linked) counts.linksExisting += 1;
      return !linked;
    });
    counts.linksToAdd += f.links.length;
  });

  return {
    counts, errors, warnings, changes, issues, files: [...files.values()],
  };
};

// Writes the plan: issues, then folders and files, then links. Per-row
// failures are reported and the run continues. Returns { batchId, counts, errors }.
const writeIssueImport = async (plan, actor, batchId) => {
  const user = actor && actor.user ? actor.user : actor;
  const result = {
    issuesCreated: 0, foldersCreated: 0, filesUploaded: 0, linksAdded: 0, auditRows: 0,
  };
  const errors = []; // { ref, file?, stage }
  if (plan.files.some((f) => !f.existingId) && !documentStorage.isConfigured()) {
    throw new Error(documentStorage.NOT_CONFIGURED_MSG);
  }

  // 1. Issues.
  const issueByRef = new Map(); // ref → { _id, investor, reference, importRef, category, dateReported }
  const ISSUE_FIELDS = 'investor reference importRef category dateReported';
  // Rows with their own ISS-NN first; rows that need a new number after them.
  const ordered = [
    ...plan.issues.filter((p) => p.existingId || p.reference),
    ...plan.issues.filter((p) => !p.existingId && !p.reference),
  ];
  for (const p of ordered) {
    if (p.existingId) {
      // eslint-disable-next-line no-await-in-loop
      const ex = await InvestorIssue.findById(p.existingId).select(ISSUE_FIELDS).lean();
      if (ex) issueByRef.set(p.ref, ex);
      else errors.push({ ref: p.ref, stage: 'issue gone since the plan' });
      continue;
    }
    const now = new Date();
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      investor: p.investor,
      ...p.doc,
      dateRegistered: now,
      ...(p.doc.status === RESOLVED && { resolvedDate: now }),
      actions: p.doc.actions.map((a) => ({
        _id: new mongoose.Types.ObjectId(), ...a, recordedBy: user._id, recordedAt: now,
      })),
      importBatchId: batchId,
      ...(p.reference && { reference: p.reference }),
    };
    let stage = 'save';
    try {
      // ISS-NN importRef: that reference; any other: the next free number.
      // eslint-disable-next-line no-await-in-loop
      if (p.reference) await InvestorIssue.create(doc); else await createWithReference(doc);
      stage = 'audit';
      // eslint-disable-next-line no-await-in-loop
      await recordChanges(user, 'import', [['InvestorIssue', [doc]]], { batchId });
      result.auditRows += 1;
      result.issuesCreated += 1;
      issueByRef.set(p.ref, doc);
    } catch (err) {
      if (stage === 'save' && p.reference && isReferenceDuplicate(err)) {
        // Taken by an app issue since the plan.
        errors.push({ ref: p.ref, stage: `reference ${p.reference} is already used` });
        continue;
      }
      if (stage === 'save' && err && err.code === 11000) {
        // Created by another run meanwhile: use it.
        // eslint-disable-next-line no-await-in-loop
        const ex = await InvestorIssue.findOne({ importRef: p.ref }).select(ISSUE_FIELDS).lean();
        if (ex) { issueByRef.set(p.ref, ex); continue; }
      }
      console.error(`Issue ${p.ref}: ${stage} failed:`, err.message);
      if (stage === 'audit') {
        try {
          // eslint-disable-next-line no-await-in-loop
          await InvestorIssue.deleteOne({ _id: doc._id });
        } catch (undoError) {
          console.error(`Issue ${p.ref}: could not remove the unaudited issue`);
        }
      }
      errors.push({ ref: p.ref, stage });
    }
  }

  // 2. Files (stored once) and 3. links.
  const audit = { actor: user, batchId };
  for (const f of plan.files) {
    const owner = issueByRef.get(f.firstRef) || f.links.map((l) => issueByRef.get(l.ref)).find(Boolean);
    let fileId = f.existingId;
    if (!fileId) {
      if (!owner) {
        errors.push({ ref: f.firstRef, stage: 'file skipped (issue not created)' });
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
          const ensured = await ensureIssueFolder(owner, audit);
          folder = ensured.folder;
          result.foldersCreated += ensured.created;
          result.auditRows += ensured.created;
        } catch (err) {
          console.error(`Issue ${owner.importRef}: folder failed:`, err.message);
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
          console.error(`Issue ${f.firstRef}: upload failed:`, err.message);
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
          console.error(`Issue ${f.firstRef}: file ${stage} failed; removing the stored copy:`, err.message);
          if (stage === 'audit') {
            try {
              // eslint-disable-next-line no-await-in-loop
              await EvidenceFile.deleteOne({ _id: doc._id });
            } catch (undoError) {
              console.error(`Issue ${f.firstRef}: could not remove the unaudited file row`);
            }
          }
          try {
            // eslint-disable-next-line no-await-in-loop
            await documentStorage.remove(doc);
          } catch (cleanupError) {
            console.error(`Issue ${f.firstRef}: could not remove the orphaned stored file`);
          }
          errors.push({ ref: f.firstRef, stage: `file ${stage}` });
          continue;
        }
      }
    }

    for (const l of f.links) {
      const issue = issueByRef.get(l.ref);
      if (!issue) continue; // its issue failed: already reported
      const link = {
        _id: new mongoose.Types.ObjectId(),
        investor: issue.investor,
        issue: issue._id,
        serviceCodes: [],
        linkedBy: user._id,
        linkedAt: new Date(),
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await EvidenceFile.updateOne(
          { _id: fileId, links: { $not: { $elemMatch: { issue: issue._id } } } },
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
        console.error(`Issue ${l.ref}: link failed:`, err.message);
        errors.push({ ref: l.ref, file: l.file, stage: 'link' });
      }
    }
  }

  return { batchId, counts: result, errors };
};

// Story 11.10: runs with the import user as the audit actor and the run's
// batchId. The plugin's create rows are suppressed (the import writes its own
// `import` rows); updates of existing records still get update rows.
const applyIssueImport = (plan, actor, { batchId = newBatchId() } = {}) => runAs(
  actor, () => writeIssueImport(plan, actor, batchId), { batchId, suppress: ['create'] },
);

module.exports = {
  parseIssuesFile, planIssueImport, applyIssueImport,
};
