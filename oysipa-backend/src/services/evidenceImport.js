// Bulk attach of evidence files into the Evidence library, from the content
// studio's library manifest (CSV). Used by scripts/attach-documents.js.
//
// planEvidenceImport(rows) reads the database and the files; it never writes or
// uploads. applyEvidenceImport(plan, actor) writes exactly that plan.
//
// Rules (spec-evidence-library-and-bulk-attach):
// - Only rows with attach=yes are loaded.
// - Folders come from folderKey/parentKey (folderKey "top/sub", parentKey "top");
//   top-level folders take their name from parentName and their description
//   from parentDescription. Existing folders (same key) are left as they are.
//   Only folders that receive at least one file are created.
// - Each file is stored once by SHA-256. Rows with the same content add links;
//   a row whose folder, date or "what" differs from the stored row is reported
//   as a warning.
// - A row with an interactionRef is linked to the interaction with that
//   importRef and its investor. An unknown ref (or one shared by several
//   interactions) is reported; the file is still stored.
// - A missing file, a type outside the upload list (taken from `file`; a
//   `fileName` of another type is refused), a file over the size limit, or a bad
//   documentDate is reported and the row is skipped. Never thrown.
// - Additions are written first, then audited; a failed audit undoes the addition.
// - Repeat-safe: a second run uploads 0, links 0, creates 0 folders.
// - The report holds counts, row numbers, file names and refs only.
// Columns are read by header name, never by position.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const EvidenceFolder = require('../models/EvidenceFolder');
const EvidenceFile = require('../models/EvidenceFile');
const InteractionLog = require('../models/InteractionLog');
const InvestmentProject = require('../models/InvestmentProject');
const documentStorage = require('./documentStorage');
const { recordChanges, newBatchId } = require('../utils/recordDeletion');
const { parseHappenedDate } = require('../utils/happenedDate');
const {
  sha256, mimeFromName, topOrder, parseFolderDate,
} = require('./evidenceLibrary');

const REQUIRED_COLUMNS = ['folderKey', 'folderName', 'parentKey', 'parentName', 'file', 'fileName', 'attach'];

// Minimal RFC 4180 CSV parser: quoted fields may hold commas, quotes ("") and
// line breaks. Handles a UTF-8 BOM and CRLF. Returns [{ cells, line }] where
// `line` is the 1-based CSV line the record starts on. Blank lines are dropped.
const parseCsvRecords = (text) => {
  const src = String(text).replace(/^﻿/, '');
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  let i = 0;
  const endRecord = () => {
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === '')) records.push({ cells: row, line: startLine });
    row = [];
    field = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      if (ch === '\n') line += 1;
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      i += 1;
      line += 1;
      startLine = line;
      continue;
    }
    field += ch; i += 1;
  }
  if (inQuotes) throw new Error('CSV has an unclosed quoted field');
  if (field !== '' || row.length > 0) endRecord();
  return records;
};

const parseCsv = (text) => parseCsvRecords(text).map((r) => r.cells);

// CSV text → [{ row (CSV line the record starts on; header = 1), ...columns }].
const parseManifest = (text) => {
  const records = parseCsvRecords(text);
  if (records.length === 0) throw new Error('The manifest is empty');
  const header = records[0].cells.map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`The manifest is missing column(s): ${missing.join(', ')}`);
  return records.slice(1).map(({ cells, line }) => {
    const rec = { row: line };
    header.forEach((h, j) => { rec[h] = (cells[j] === undefined ? '' : cells[j]).trim(); });
    return rec;
  });
};

const isYes = (v) => String(v || '').trim().toLowerCase() === 'yes';
const dayKey = (d) => (d ? d.toISOString().slice(0, 10) : '');

// Plans one run. `baseDir` resolves relative `file` paths (the manifest's folder).
// `maxBytes` defaults to the storage limit (10 MB).
const planEvidenceImport = async (rows, { baseDir = process.cwd(), maxBytes = documentStorage.maxBytes() } = {}) => {
  const counts = {
    rows: rows.length,
    attachRows: 0,
    notAttached: 0,
    rowsLoaded: 0,
    skipped: 0,
    warnings: 0,
    foldersToCreate: 0,
    filesToUpload: 0,
    filesAlreadyStored: 0,
    linksToAdd: 0,
    linksExisting: 0,
    refErrors: 0,
    untaggedFiles: 0,
  };
  const skipped = []; // { row, fileName, reason }
  const warnings = []; // { row, fileName, message }
  const refErrors = []; // { row, fileName, ref, reason }

  const folderSpecs = new Map(); // key → spec (only folders that receive a file)
  const addFolder = (spec) => {
    if (!folderSpecs.has(spec.key)) folderSpecs.set(spec.key, spec);
  };

  const files = new Map(); // sha → file plan
  const attachRows = rows.filter((r) => {
    if (isYes(r.attach)) return true;
    counts.notAttached += 1;
    return false;
  });
  counts.attachRows = attachRows.length;

  const refs = [...new Set(attachRows.map((r) => r.interactionRef).filter(Boolean))];
  const logs = refs.length
    ? await InteractionLog.find({ importRef: { $in: refs } }).select('importRef investor project').lean()
    : [];
  const projectIds = logs.filter((l) => l.project).map((l) => l.project);
  const projects = projectIds.length
    ? await InvestmentProject.find({ _id: { $in: projectIds } }).select('investor').lean()
    : [];
  const projectInvestor = new Map(projects.map((p) => [String(p._id), p.investor]));
  const logsByRef = new Map();
  logs.forEach((l) => {
    if (!logsByRef.has(l.importRef)) logsByRef.set(l.importRef, []);
    logsByRef.get(l.importRef).push({
      _id: l._id,
      investor: (l.project && projectInvestor.get(String(l.project))) || l.investor,
    });
  });

  const skip = (r, reason) => {
    counts.skipped += 1;
    skipped.push({ row: r.row, fileName: r.fileName || path.basename(r.file || ''), reason });
  };

  for (const r of attachRows) {
    const fileName = r.fileName || path.basename(r.file || '');
    const topKey = r.parentKey || (r.folderKey || '').split('/')[0];
    if (!r.folderKey || !topKey) { skip(r, 'no folderKey'); continue; }
    if (r.folderKey.split('/').length > 2) { skip(r, 'folderKey has more than two levels'); continue; }
    if (r.folderKey !== topKey && !r.folderKey.startsWith(`${topKey}/`)) { skip(r, 'folderKey is not under parentKey'); continue; }
    const folderDate = parseFolderDate(r.folderDate);
    if (folderDate.error) { skip(r, 'bad folderDate'); continue; }

    if (!r.file) { skip(r, 'no file path'); continue; }
    // The type comes from the file itself (its extension), never from fileName.
    const mimeType = mimeFromName(r.file);
    if (!mimeType) { skip(r, 'file type not allowed (PDF, Word, Excel, JPEG, PNG only)'); continue; }
    if (r.fileName && mimeFromName(r.fileName) !== mimeType) { skip(r, 'fileName and file have different types'); continue; }
    const abs = path.resolve(baseDir, r.file);
    let stat;
    try { stat = fs.statSync(abs); } catch (e) { stat = null; }
    if (!stat || !stat.isFile()) { skip(r, 'file not found'); continue; }
    if (stat.size === 0) { skip(r, 'file is empty'); continue; }
    if (stat.size > maxBytes) { skip(r, `file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`); continue; }
    const docDate = parseHappenedDate(r.documentDate, { label: 'documentDate' });
    if (docDate.error) { skip(r, docDate.error); continue; }

    const hash = sha256(fs.readFileSync(abs));
    counts.rowsLoaded += 1;
    if (!files.has(hash)) {
      // The first row of a file decides its folder: only those folders are created.
      addFolder({
        key: topKey, name: r.parentName || topKey, description: r.parentDescription || undefined, parentKey: null,
      });
      if (r.folderKey !== topKey) {
        addFolder({
          key: r.folderKey,
          name: r.folderName || r.folderKey,
          description: r.folderDescription || undefined,
          folderDate: folderDate.value,
          parentKey: topKey,
        });
      }
      files.set(hash, {
        sha256: hash,
        row: r.row,
        abs,
        fileName,
        mimeType,
        size: stat.size,
        folderKey: r.folderKey,
        documentDate: docDate.value,
        what: r.what || undefined,
        existingId: null,
        existingLinks: [],
        links: [], // { row, ref, investor, interaction }
      });
    } else {
      const first = files.get(hash);
      if (first.folderKey !== r.folderKey || dayKey(first.documentDate) !== dayKey(docDate.value)
        || (first.what || '') !== (r.what || '')) {
        counts.warnings += 1;
        warnings.push({ row: r.row, fileName, message: `same file as row ${first.row}; stored in ${first.folderKey}` });
      }
    }
    const plan = files.get(hash);
    if (r.interactionRef) {
      const matches = logsByRef.get(r.interactionRef) || [];
      const refError = (reason) => {
        counts.refErrors += 1;
        refErrors.push({
          row: r.row, fileName, ref: r.interactionRef, reason,
        });
      };
      if (matches.length === 0 || !matches[0].investor) refError('no interaction with this importRef');
      else if (matches.length > 1) refError(`${matches.length} interactions share this importRef`);
      else if (!plan.links.some((l) => String(l.interaction) === String(matches[0]._id))) {
        plan.links.push({
          row: r.row, ref: r.interactionRef, investor: matches[0].investor, interaction: matches[0]._id,
        });
      }
    }
  }

  // Existing state.
  const shas = [...files.keys()];
  const existing = shas.length
    ? await EvidenceFile.find({ sha256: { $in: shas } }).select('sha256 links fileName').lean()
    : [];
  existing.forEach((e) => {
    const p = files.get(e.sha256);
    p.existingId = e._id;
    p.existingLinks = e.links || [];
  });
  files.forEach((p) => {
    if (p.existingId) counts.filesAlreadyStored += 1; else counts.filesToUpload += 1;
    const before = p.links.length;
    p.links = p.links.filter((l) => !p.existingLinks.some((x) => String(x.interaction) === String(l.interaction)));
    counts.linksExisting += before - p.links.length;
    counts.linksToAdd += p.links.length;
    if (p.existingLinks.length === 0 && p.links.length === 0) counts.untaggedFiles += 1;
  });

  // Only folders that receive a file to upload are needed (files already
  // stored keep their folder), so no folder is ever created empty.
  const neededKeys = new Set();
  files.forEach((p) => {
    if (p.existingId) return;
    neededKeys.add(p.folderKey);
    neededKeys.add(p.folderKey.split('/')[0]);
  });
  const neededFolders = [...folderSpecs.values()].filter((f) => neededKeys.has(f.key));
  const keys = neededFolders.map((f) => f.key);
  const existingFolders = keys.length
    ? await EvidenceFolder.find({ key: { $in: keys } }).select('key').lean()
    : [];
  const existingKeys = new Set(existingFolders.map((f) => f.key));
  const foldersToCreate = neededFolders.filter((f) => !existingKeys.has(f.key));
  counts.foldersToCreate = foldersToCreate.length;

  return {
    counts,
    skipped,
    warnings,
    refErrors,
    folders: neededFolders,
    foldersToCreate,
    files: [...files.values()],
  };
};

// Writes the plan. Folders first (top before sub), then files (stored, saved,
// audited), then links (saved, audited). Every addition is written first and
// audited after; a failed audit undoes it. Per-row failures are reported and
// the run continues. Returns { batchId, counts, errors }.
const applyEvidenceImport = async (plan, actor, { batchId = newBatchId() } = {}) => {
  const result = {
    foldersCreated: 0, filesUploaded: 0, linksAdded: 0, auditRows: 0,
  };
  const errors = []; // { row, fileName?, folderKey?, stage }
  const user = actor && actor.user ? actor.user : actor;

  const needsUpload = plan.files.some((f) => !f.existingId);
  if (needsUpload && !documentStorage.isConfigured()) {
    throw new Error(documentStorage.NOT_CONFIGURED_MSG);
  }

  const reportLinksNotStored = (f) => f.links.forEach((l) => errors.push({ row: l.row, fileName: f.fileName, stage: 'file not stored' }));

  // Folders: find or create by key (top level first). A failed folder is
  // reported and its files are skipped.
  const folderIds = new Map();
  const failedFolders = new Set();
  const ordered = [...plan.folders].sort((a, b) => (a.parentKey ? 1 : 0) - (b.parentKey ? 1 : 0));
  for (const spec of ordered) {
    if (spec.parentKey && !folderIds.has(spec.parentKey)) {
      failedFolders.add(spec.key);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      let folder = await EvidenceFolder.findOne({ key: spec.key }).select('_id').lean();
      if (!folder) {
        const doc = {
          _id: new mongoose.Types.ObjectId(),
          key: spec.key,
          name: spec.name,
          ...(spec.description && { description: spec.description }),
          ...(spec.folderDate && { folderDate: spec.folderDate }),
          parent: spec.parentKey ? folderIds.get(spec.parentKey) : null,
          order: spec.parentKey ? 0 : topOrder(spec.key),
        };
        try {
          // eslint-disable-next-line no-await-in-loop
          await EvidenceFolder.create(doc);
          folder = doc;
        } catch (err) {
          if (!(err && err.code === 11000)) throw err;
          // Created by another run meanwhile: use it.
          // eslint-disable-next-line no-await-in-loop
          folder = await EvidenceFolder.findOne({ key: spec.key }).select('_id').lean();
          if (!folder) throw err;
        }
        if (folder === doc) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await recordChanges(user, 'import', [['EvidenceFolder', [doc]]], { batchId });
          } catch (auditError) {
            // eslint-disable-next-line no-await-in-loop
            await EvidenceFolder.deleteOne({ _id: doc._id });
            throw auditError;
          }
          result.auditRows += 1;
          result.foldersCreated += 1;
        }
      }
      folderIds.set(spec.key, folder._id);
    } catch (err) {
      console.error(`Folder ${spec.key}: could not be created:`, err.message);
      failedFolders.add(spec.key);
      errors.push({ folderKey: spec.key, stage: 'folder' });
    }
  }

  for (const f of plan.files) {
    let fileId = f.existingId;
    if (!fileId && (failedFolders.has(f.folderKey) || !folderIds.has(f.folderKey))) {
      errors.push({ row: f.row, fileName: f.fileName, stage: 'folder' });
      reportLinksNotStored(f);
      continue;
    }
    if (!fileId) {
      // Re-check: another run may have stored it since the plan.
      // eslint-disable-next-line no-await-in-loop
      const again = await EvidenceFile.findOne({ sha256: f.sha256 }).select('_id links').lean();
      if (again) {
        fileId = again._id;
        f.links = f.links.filter((l) => !(again.links || []).some((x) => String(x.interaction) === String(l.interaction)));
      } else {
        let buffer;
        try { buffer = fs.readFileSync(f.abs); } catch (err) { buffer = null; }
        if (!buffer || sha256(buffer) !== f.sha256) {
          // The file changed (or went) since the plan: never store other content.
          errors.push({ row: f.row, fileName: f.fileName, stage: 'changed' });
          reportLinksNotStored(f);
          continue;
        }
        let stored;
        try {
          // eslint-disable-next-line no-await-in-loop
          stored = await documentStorage.upload(buffer, { fileName: f.fileName, mimeType: f.mimeType });
        } catch (err) {
          console.error(`Row ${f.row}: upload failed:`, err.message);
          errors.push({ row: f.row, fileName: f.fileName, stage: 'upload' });
          reportLinksNotStored(f);
          continue;
        }
        const doc = {
          _id: new mongoose.Types.ObjectId(),
          folder: folderIds.get(f.folderKey),
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
          sha256: f.sha256,
          ...(f.documentDate && { documentDate: f.documentDate }),
          ...(f.what && { what: f.what }),
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
          console.error(`Row ${f.row}: ${stage} failed; removing the stored copy:`, err.message);
          if (stage === 'audit') {
            try {
              // eslint-disable-next-line no-await-in-loop
              await EvidenceFile.deleteOne({ _id: doc._id });
            } catch (undoError) {
              console.error(`Row ${f.row}: could not remove the unaudited file row`);
            }
          }
          try {
            // eslint-disable-next-line no-await-in-loop
            await documentStorage.remove(doc);
          } catch (cleanupError) {
            console.error(`Row ${f.row}: could not remove the orphaned stored file`);
          }
          errors.push({ row: f.row, fileName: f.fileName, stage });
          reportLinksNotStored(f);
          continue;
        }
      }
    }

    for (const l of f.links) {
      const link = {
        _id: new mongoose.Types.ObjectId(),
        investor: l.investor,
        interaction: l.interaction,
        serviceCodes: [],
        linkedBy: user._id,
        linkedAt: new Date(),
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await EvidenceFile.updateOne(
          { _id: fileId, 'links.interaction': { $ne: l.interaction } },
          { $push: { links: link } },
        );
        // Audited only when the link was actually added.
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
        console.error(`Row ${l.row}: link failed:`, err.message);
        errors.push({ row: l.row, fileName: f.fileName, stage: 'link' });
      }
    }
  }

  return { batchId, counts: result, errors };
};

module.exports = {
  parseCsv, parseManifest, planEvidenceImport, applyEvidenceImport, REQUIRED_COLUMNS,
};
