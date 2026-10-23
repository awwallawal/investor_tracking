// Investor import (story 11.11, with the 11.5 fields). Used by the Import
// investors dialog (POST /api/investors/import/*) and scripts/import-investors.js.
//
// planImport(json) reads the database and returns a plan; it never writes.
// applyImport(plan, actor) writes exactly that plan. The run route always makes
// a fresh plan, so the typed confirmation is checked against current data.
//
// Rules (spec 11.5 + 11.11):
// - create: skipped as a duplicate when the content studio's normalised-name key
//   (normaliseName) matches an investor already in the app (or an earlier record
//   in the same file).
// - update-existing: matched on the exact names in existingAppNames. Empty fields
//   are filled; a non-empty field is never overwritten (the difference is
//   reported). leadSource is never changed. Notes are appended, never replaced.
// - projects (`project` and `projects[]`): added only when the investor has no
//   project with the same normalised title. An unknown lifecycleStatusName skips
//   the whole record. Extra fields go into the description as text.
// - interactions come only from the top-level `interactions[]`, matched on the
//   exact investorName, repeat-safe on the file's `id` (stored as importRef).
// - Email conflicts, unknown lifecycle names and odd country/sector values are
//   reported, never thrown and never guessed.
// - The report holds organisation names, keys, file ids and field names only:
//   never emails, phones or contact names.
// No transaction (the target MongoDB may be standalone): being idempotent makes a
// repeat run safe.

const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const LifecycleStatus = require('../models/LifecycleStatusModel');
const { recordChanges, newBatchId } = require('../utils/recordDeletion');
const { parseHappenedDate, todayLagos } = require('../utils/happenedDate');
const { SERVICE_CODES } = require('../constants/serviceCodes');
const {
  LEAD_SOURCES, UNKNOWN_LEAD_SOURCE, ORGANISATION_TYPES, DEFAULT_ORGANISATION_TYPE, CURRENCIES, EMAIL_RE,
} = require('../constants/investorFields');

const IMPORTED_CATEGORY = 'Imported record';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

// Sector names the content studio uses (the State's sectors plus four). A value
// that is neither here nor already in the app is reported as a warning.
const KNOWN_SECTORS = [
  'Agribusiness', 'Solid Minerals and Mining', 'Energy (oil and gas)', 'Real Estate and Construction',
  'Financial Services', 'Culture and Tourism', 'Renewable Energy', 'Manufacturing', 'Infrastructure',
  'Hospitality', 'Retail and Trade', 'Technology and ICT', 'Waste and Circular Economy', 'Healthcare',
  'Not known',
];

// Investor fields an update-existing record may fill when empty in the app.
const FILL_FIELDS = [
  'email', 'phoneNumber', 'sector', 'countryOfOrigin', 'companyRegistrationInfo', 'keyContactPerson',
  'firstContactDate', 'organisationType', 'website', 'headOffice',
];
// Differences on these fields may show both values in the report (not personal data).
const SHOW_VALUE_FIELDS = ['sector', 'countryOfOrigin', 'organisationType', 'website', 'headOffice', 'leadSource'];

// Project fields with a place in the schema; any other field (except tags) is
// appended to the description as text.
const PROJECT_FIELDS = ['projectTitle', 'description', 'location', 'lifecycleStatusName', 'estimatedValue', 'currency', 'estimatedNumberOfJobs', 'tags'];
// matchesBatch1Project is used for matching and also kept in the description text.
// Interaction fields appended to the description (no schema for them).
const INTERACTION_TEXT_FIELDS = [
  ['category', 'Category'], ['performedBy', 'Performed by'], ['evidence', 'Evidence'], ['evidenceSaved', 'Evidence saved'],
  ['evidenceFolder', 'Evidence folder'], ['note', 'Note'], ['dateNote', 'Date note'],
  ['proposedVerificationLevel', 'Proposed verification level'],
];

class ImportFileError extends Error {}

// JavaScript port of the content studio's norm() (research/master/build_import.py).
const normaliseName = (s) => {
  let t = String(s || '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase();
  t = t.replace(/\(.*?\)/g, ' ');
  t = t.replace(/\b(limited|ltd|plc|nig|nigeria|company|co|the|international|group|global|services|enterprises?)\b/g, ' ');
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
};

// Project titles are compared case- and punctuation-insensitively (nothing stripped).
const normaliseTitle = (s) => String(s || '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0);
const str = (v) => (isEmpty(v) ? undefined : String(v).trim());
const textOf = (v) => {
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join('; ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return isEmpty(v) ? '' : String(v).trim();
};
const uniq = (arr) => [...new Set(arr.filter((x) => typeof x === 'string' && x.trim()))];
const todayDate = () => new Date(`${todayLagos()}T00:00:00.000Z`);
const dayOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

const sameValue = (field, appValue, fileValue) => {
  if (field === 'firstContactDate') return dayOf(appValue) === dayOf(fileValue);
  return String(appValue).trim().toLowerCase() === String(fileValue).trim().toLowerCase();
};

const isOddCountry = (c) => !/^[A-Za-z][A-Za-z .'&-]{1,39}$/.test(c);

// Parses an uploaded file buffer (or string). Throws ImportFileError with a clear message.
const parseImportFile = (input) => {
  if (input === undefined || input === null) throw new ImportFileError('Choose an import file (.json).');
  if (Buffer.isBuffer(input) && input.length > MAX_FILE_BYTES) throw new ImportFileError('The import file is larger than 2 MB.');
  let json = input;
  if (Buffer.isBuffer(input) || typeof input === 'string') {
    const text = (Buffer.isBuffer(input) ? input.toString('utf8') : input).replace(/^﻿/, '');
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new ImportFileError('The file is not valid JSON.');
    }
  }
  return validateImportJson(json);
};

function validateImportJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray(json.records)) {
    throw new ImportFileError('The file has no "records" list. Use the content studio import file.');
  }
  if (json.interactions !== undefined && !Array.isArray(json.interactions)) {
    throw new ImportFileError('"interactions" must be a list.');
  }
  return json;
}

// Notes text from the file: the record's notes plus the company email.
const fileNotes = (rec) => {
  const parts = [str(rec.notes)];
  const companyEmail = str(rec.companyEmail);
  if (companyEmail) parts.push(`Company email: ${companyEmail}`);
  return parts.filter(Boolean).join('; ') || undefined;
};

const projectDescription = (p) => {
  const lines = [str(p.description)];
  Object.keys(p).forEach((k) => {
    if (PROJECT_FIELDS.includes(k)) return;
    const t = textOf(p[k]);
    if (t) lines.push(`${k}: ${t}`);
  });
  return lines.filter(Boolean).join('\n') || undefined;
};

const interactionDescription = (it) => {
  const extra = INTERACTION_TEXT_FIELDS
    .map(([k, label]) => [label, textOf(it[k])])
    .filter(([, t]) => t)
    .map(([label, t]) => `${label}: ${t}`);
  return [str(it.description), extra.length ? `[Imported record] ${extra.join('. ')}` : null].filter(Boolean).join('\n\n');
};

// Loads what the plan needs from the database (read-only).
const loadState = async (json) => {
  const investors = await Investor.find({}).lean();
  const statuses = await LifecycleStatus.find({}).select('name').lean();
  const projects = await InvestmentProject.find({}).select('investor projectTitle').lean();
  const refs = (json.interactions || []).map((i) => str(i && i.id)).filter(Boolean);
  const imported = refs.length
    ? await InteractionLog.find({ importRef: { $in: refs } }).select('importRef').lean()
    : [];

  const byName = new Map();
  const byKey = new Map();
  const emails = new Map();
  investors.forEach((inv) => {
    byName.set(inv.investorName, inv);
    const k = normaliseName(inv.investorName);
    if (k && !byKey.has(k)) byKey.set(k, inv);
    if (inv.email) emails.set(String(inv.email).toLowerCase(), String(inv._id));
  });
  const titles = new Map(); // investor id → Set(normalised titles)
  projects.forEach((p) => {
    const id = String(p.investor);
    if (!titles.has(id)) titles.set(id, new Set());
    titles.get(id).add(normaliseTitle(p.projectTitle));
  });
  return {
    byName,
    byKey,
    emails,
    statuses: new Map(statuses.map((s) => [s.name, s._id])),
    titles,
    importedRefs: new Set(imported.map((l) => l.importRef)),
    sectors: new Set([...KNOWN_SECTORS, ...investors.map((i) => i.sector).filter(Boolean)]),
  };
};

// Builds the project docs of one record. Returns { docs, skipped, error }.
const planProjects = (rec, existingTitles, state) => {
  const list = [rec.project, ...(Array.isArray(rec.projects) ? rec.projects : [])].filter((p) => p && typeof p === 'object');
  const seen = new Set(existingTitles || []);
  const docs = [];
  const skipped = [];
  const warnings = [];
  for (const p of list) {
    const title = str(p.projectTitle);
    if (!title) return { error: 'A project has no projectTitle.' };
    const statusName = str(p.lifecycleStatusName);
    if (!statusName) return { error: `Project "${title}" has no lifecycleStatusName.` };
    if (!state.statuses.has(statusName)) {
      return { error: `Lifecycle status "${statusName}" is not in the app. Add it in Admin Settings, then run the import again.`, missingStatus: statusName };
    }
    const currency = str(p.currency);
    if (currency && !CURRENCIES.includes(currency)) return { error: `Project "${title}" has an unknown currency "${currency}".` };
    const norm = normaliseTitle(title);
    // The file may say this is an earlier batch's project under another title
    // (matchesBatch1Project). When that title is already on the investor, it is
    // the same project: skipped, never duplicated (and never overwritten).
    const match = str(p.matchesBatch1Project);
    if (seen.has(norm) || (match && seen.has(normaliseTitle(match)))) {
      skipped.push(title);
      continue;
    }
    seen.add(norm);
    const doc = {
      projectTitle: title,
      description: projectDescription(p),
      location: str(p.location),
      lifecycleStatus: state.statuses.get(statusName),
      dateRegistered: todayDate(),
      importTags: uniq([...(Array.isArray(rec.tags) ? rec.tags : []), ...(Array.isArray(p.tags) ? p.tags : [])]),
    };
    ['estimatedValue', 'estimatedNumberOfJobs'].forEach((field) => {
      const v = p[field];
      if (v === undefined || v === null) return;
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) doc[field] = v;
      else warnings.push(`Project "${title}": ${field} is not a non-negative number; not imported.`);
    });
    if (currency) doc.currency = currency;
    Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);
    const invalid = new InvestmentProject({ ...doc, investor: '000000000000000000000000' }).validateSync();
    if (invalid) return { error: `Project "${title}" is not valid: ${Object.keys(invalid.errors).join(', ')}.` };
    docs.push({ doc, title, currency: doc.currency || 'NGN' });
  }
  return { docs, skipped, warnings };
};

// Email check shared by creates and fills. Returns the email to use or undefined,
// pushing a warning (without the address) when it cannot be used.
const checkEmail = (raw, ownerId, state, plannedEmails, warn) => {
  const email = str(raw) && str(raw).toLowerCase();
  if (!email) return undefined;
  if (!EMAIL_RE.test(email)) {
    warn('Email is not a valid address; imported without it.');
    return undefined;
  }
  const holder = state.emails.get(email) || plannedEmails.get(email);
  if (holder && holder !== ownerId) {
    warn('Email is already used by another investor; imported without it.');
    return undefined;
  }
  return email;
};

const planImport = async (input) => {
  const json = validateImportJson(input);
  const state = await loadState(json);
  const report = {
    counts: {},
    create: [],
    update: [],
    duplicates: [],
    errors: [],
    warnings: [],
    interactions: [],
  };
  const creates = [];
  const updates = [];
  const interactions = [];
  const plannedEmails = new Map(); // email → owner token (investor id or "create:<n>")
  const plannedKeys = new Map(); // non-empty key → { name, create } of an earlier create in the file
  const plannedNames = new Map(); // exact name → { name, create }
  const nameTargets = new Map(); // file name → { id } | { create: index }
  const updateState = new Map(); // investor id → working copy (several records may update one investor)
  const plannedTitles = new Map(); // investor id → Set of titles after planned projects
  let fieldsToFill = 0;

  json.records.forEach((rec, row) => {
    const r = rec && typeof rec === 'object' ? rec : {};
    const inv = r.investor && typeof r.investor === 'object' ? r.investor : {};
    const appNames = Array.isArray(r.existingAppNames) ? r.existingAppNames.filter((n) => typeof n === 'string') : [];
    const name = str(inv.investorName) || appNames[0] || null;
    const key = str(r.key) || (name ? normaliseName(name) : '') || null;
    // An empty normalised key never matches (falls back to the exact name only).
    const keyGet = (map, k) => (k ? map.get(k) : undefined);
    const base = { row: row + 1, key, name };
    const recWarnings = [];
    const warn = (message) => recWarnings.push({ ...base, message });
    const fail = (message, extra = {}) => report.errors.push({ ...base, kind: 'record', message, ...extra });

    const country = str(inv.countryOfOrigin);
    const sector = str(inv.sector);
    if (country && isOddCountry(country)) warn(`Odd country value "${country}" (kept as given).`);
    if (sector && !state.sectors.has(sector)) warn(`Sector "${sector}" is not one of the known sectors (kept as given).`);

    if (r.action === 'create') {
      if (!name) return fail('Record has no investor.investorName.');
      const dupOf = state.byName.get(name) || keyGet(state.byKey, key) || keyGet(state.byKey, normaliseName(name));
      if (dupOf) {
        report.duplicates.push({ ...base, kind: 'investor', matches: dupOf.investorName });
        nameTargets.set(name, { id: String(dupOf._id) });
        return undefined;
      }
      const earlier = plannedNames.get(name) || keyGet(plannedKeys, key) || keyGet(plannedKeys, normaliseName(name));
      if (earlier) {
        report.duplicates.push({ ...base, kind: 'investor', matches: earlier.name, note: 'earlier record in this file' });
        if (!nameTargets.has(name)) nameTargets.set(name, { create: earlier.create });
        return undefined;
      }
      if (!sector) return fail('Sector is missing.');
      if (!country) return fail('Country of origin is missing.');
      let leadSource = str(inv.leadSource);
      if (!leadSource) {
        leadSource = UNKNOWN_LEAD_SOURCE;
        warn(`Lead source missing; set to "${UNKNOWN_LEAD_SOURCE}".`);
      } else if (!LEAD_SOURCES.includes(leadSource)) {
        return fail(`Unknown lead source "${leadSource}".`);
      }
      const organisationType = str(inv.organisationType);
      if (organisationType && !ORGANISATION_TYPES.includes(organisationType)) return fail(`Unknown organisation type "${organisationType}".`);
      let firstContactDate;
      if (isEmpty(inv.firstContactDate)) {
        firstContactDate = todayDate();
        warn('No firstContactDate in the file; the import date is used.');
      } else {
        const parsed = parseHappenedDate(inv.firstContactDate, { label: 'First contact date' });
        if (parsed.error) return fail(parsed.error);
        firstContactDate = parsed.value;
      }
      const projects = planProjects(r, [], state);
      if (projects.error) return fail(projects.error, projects.missingStatus ? { missingStatus: projects.missingStatus } : {});
      projects.warnings.forEach(warn);

      const owner = `create:${creates.length}`;
      const email = checkEmail(inv.email, owner, state, plannedEmails, warn);
      const doc = {
        investorName: name,
        email,
        phoneNumber: str(inv.phoneNumber),
        sector,
        countryOfOrigin: country,
        companyRegistrationInfo: str(inv.companyRegistrationInfo),
        keyContactPerson: str(inv.keyContactPerson),
        leadSource,
        leadSourceDetail: str(inv.leadSourceDetail),
        firstContactDate,
        organisationType,
        website: str(r.website),
        headOffice: str(r.headOffice),
        notes: fileNotes(r),
        importTags: uniq(Array.isArray(r.tags) ? r.tags : []),
      };
      Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);
      const invalid = new Investor(doc).validateSync();
      if (invalid) return fail(`Investor is not valid: ${Object.keys(invalid.errors).join(', ')}.`);

      if (email) plannedEmails.set(email, owner);
      const planned = { name, create: creates.length };
      plannedNames.set(name, planned);
      if (key) plannedKeys.set(key, planned);
      if (normaliseName(name)) plannedKeys.set(normaliseName(name), planned);
      nameTargets.set(name, { create: creates.length });
      creates.push({ base, doc, projects: projects.docs.map((p) => p.doc) });
      report.create.push({
        ...base,
        organisationType: doc.organisationType || 'Investor',
        leadSource,
        projects: projects.docs.map((p) => ({ title: p.title, currency: p.currency })),
        projectsSkipped: projects.skipped,
      });
      report.warnings.push(...recWarnings);
      return undefined;
    }

    if (r.action === 'update-existing') {
      if (appNames.length === 0) return fail('Record has no existingAppNames.');
      const matches = uniq(appNames).map((n) => state.byName.get(n)).filter(Boolean);
      if (matches.length === 0) return fail(`No app investor has any of these names: ${appNames.join(', ')}.`);
      const target = matches[0];
      const id = String(target._id);
      const others = uniq(matches.slice(1).filter((m) => String(m._id) !== id).map((m) => m.investorName));
      if (others.length) warn(`Also matches ${others.join(', ')}; only "${target.investorName}" is updated.`);

      const current = updateState.get(id) || { ...target };
      if (!plannedTitles.has(id)) plannedTitles.set(id, new Set(state.titles.get(id) || []));
      const projects = planProjects(r, plannedTitles.get(id), state);
      if (projects.error) return fail(projects.error, projects.missingStatus ? { missingStatus: projects.missingStatus } : {});
      projects.warnings.forEach(warn);

      const set = {};
      const filled = [];
      const conflicts = [];
      const file = {
        ...Object.fromEntries(FILL_FIELDS.map((f) => [f, inv[f]])),
        website: r.website,
        headOffice: r.headOffice,
      };
      for (const field of FILL_FIELDS) {
        let value = file[field];
        if (isEmpty(value)) continue;
        if (field === 'firstContactDate') {
          const parsed = parseHappenedDate(value, { label: 'First contact date' });
          if (parsed.error) {
            warn(`${parsed.error} Not filled.`);
            continue;
          }
          value = parsed.value;
        } else if (field === 'organisationType') {
          value = str(value);
          if (!ORGANISATION_TYPES.includes(value)) {
            warn(`Unknown organisation type "${value}"; not filled.`);
            continue;
          }
        } else {
          value = String(value).trim();
        }
        const appValue = current[field];
        // Owner decision (23 Oct): organisationType holds the default "Investor"
        // on every existing record, so a different valid type from the file
        // replaces "Investor" (listed as filled). Any other type never changes.
        const replacesDefault = field === 'organisationType' && appValue === DEFAULT_ORGANISATION_TYPE && value !== appValue;
        if (isEmpty(appValue) || replacesDefault) {
          if (field === 'email') {
            value = checkEmail(value, id, state, plannedEmails, warn);
            if (!value) continue;
            plannedEmails.set(value, id);
          }
          set[field] = value;
          current[field] = value;
          filled.push(field);
        } else if (!sameValue(field, appValue, value)) {
          conflicts.push(SHOW_VALUE_FIELDS.includes(field)
            ? { field, app: String(appValue), file: String(value) }
            : { field });
        }
      }
      // leadSource (and its detail) are never changed on existing records.
      for (const field of ['leadSource', 'leadSourceDetail']) {
        const value = str(inv[field]);
        if (value && !(current[field] && sameValue(field, current[field], value))) {
          conflicts.push(SHOW_VALUE_FIELDS.includes(field)
            ? { field, app: current[field] ? String(current[field]) : '', file: value, note: 'never changed on existing records' }
            : { field, note: 'never changed on existing records' });
        }
      }
      // Notes are appended (never replaced) when the file's text is not already there.
      const notes = fileNotes(r);
      if (notes && !String(current.notes || '').includes(notes)) {
        set.notes = current.notes ? `${current.notes}\n\n${notes}` : notes;
        current.notes = set.notes;
        filled.push(current.notes === notes ? 'notes' : 'notes (appended)');
      }
      const newTags = uniq(Array.isArray(r.tags) ? r.tags : []).filter((t) => !(current.importTags || []).includes(t));
      if (newTags.length) current.importTags = [...(current.importTags || []), ...newTags];

      projects.docs.forEach((p) => plannedTitles.get(id).add(normaliseTitle(p.title)));
      updateState.set(id, current);
      const fileName = str(inv.investorName);
      if (fileName && !nameTargets.has(fileName)) nameTargets.set(fileName, { id });

      const changes = filled.length + projects.docs.length;
      fieldsToFill += filled.length;
      updates.push({
        base, investorId: id, set, filled, addTags: newTags, projects: projects.docs.map((p) => p.doc), changes,
      });
      report.update.push({
        ...base,
        appName: target.investorName,
        filled,
        conflicts,
        projects: projects.docs.map((p) => ({ title: p.title, currency: p.currency })),
        projectsSkipped: projects.skipped,
        unchanged: changes === 0,
      });
      report.warnings.push(...recWarnings);
      return undefined;
    }

    return fail(`Unknown action "${r.action}" (expected "create" or "update-existing").`);
  });

  // Interactions (top-level interactions[]).
  const seenRefs = new Set();
  (json.interactions || []).forEach((raw, idx) => {
    const it = raw && typeof raw === 'object' ? raw : {};
    const ref = str(it.id);
    const investorName = str(it.investorName);
    const base = { row: idx + 1, id: ref || null, name: investorName || null };
    const fail = (message) => report.errors.push({ ...base, kind: 'interaction', message });
    if (!ref) return fail('Interaction has no id.');
    if (state.importedRefs.has(ref) || seenRefs.has(ref)) {
      report.duplicates.push({ ...base, kind: 'interaction', note: seenRefs.has(ref) ? 'earlier entry in this file' : 'already imported' });
      return undefined;
    }
    if (!investorName) return fail('Interaction has no investorName.');
    const app = state.byName.get(investorName);
    const target = app ? { id: String(app._id) } : nameTargets.get(investorName);
    if (!target) return fail(`No investor named "${investorName}" in the app or in this file.`);
    const description = str(it.description);
    if (!description) return fail('Interaction has no description.');
    let codes = Array.isArray(it.serviceCodes) ? it.serviceCodes : [];
    if (codes.length === 0 && str(it.serviceCode)) codes = [str(it.serviceCode)];
    const bad = codes.filter((c) => !SERVICE_CODES.includes(c));
    if (bad.length) return fail(`Unknown service code(s): ${bad.join(', ')}.`);
    let interactionDate;
    if (isEmpty(it.date)) {
      interactionDate = todayDate();
      report.warnings.push({ ...base, kind: 'interaction', message: 'No date in the file; the import date is used.' });
    } else {
      const parsed = parseHappenedDate(it.date, { label: 'Interaction date' });
      if (parsed.error) return fail(parsed.error);
      interactionDate = parsed.value;
    }
    seenRefs.add(ref);
    interactions.push({
      base,
      target,
      doc: {
        description: interactionDescription(it),
        category: IMPORTED_CATEGORY,
        serviceCodes: uniq(codes),
        interactionDate,
        importRef: ref,
        importTags: uniq(Array.isArray(it.tags) ? it.tags : []),
      },
    });
    report.interactions.push({
      ...base, date: dayOf(interactionDate), serviceCodes: uniq(codes), investorIsNew: target.create !== undefined,
    });
    return undefined;
  });

  const updatesWithChanges = updates.filter((u) => u.changes > 0 || u.addTags.length > 0);
  report.counts = {
    records: json.records.length,
    create: creates.length,
    update: updates.filter((u) => u.changes > 0).length,
    unchanged: updates.filter((u) => u.changes === 0).length,
    fieldsToFill,
    projectsToCreate: creates.reduce((n, c) => n + c.projects.length, 0) + updates.reduce((n, u) => n + u.projects.length, 0),
    projectsSkipped: [...report.create, ...report.update].reduce((n, r) => n + r.projectsSkipped.length, 0),
    duplicates: report.duplicates.filter((d) => d.kind === 'investor').length,
    interactions: (json.interactions || []).length,
    interactionsToCreate: interactions.length,
    interactionDuplicates: report.duplicates.filter((d) => d.kind === 'interaction').length,
    errors: report.errors.filter((e) => e.kind === 'record').length,
    interactionErrors: report.errors.filter((e) => e.kind === 'interaction').length,
    warnings: report.warnings.length,
  };
  return {
    creates, updates: updatesWithChanges, interactions, report,
  };
};

const confirmationText = (plan) => `IMPORT ${plan.report.counts.create}`;

// Writes the plan. `actor` is the DG/Admin user (a User document or req).
// Returns { batchId, counts, errors[] }; per-item write failures are reported,
// not thrown, so the rest of the plan still runs.
const applyImport = async (plan, actor) => {
  const user = actor && actor.user ? actor.user : actor;
  if (!user || !user._id) throw new Error('applyImport needs the user running the import.');
  const batchId = newBatchId();
  const counts = {
    created: 0, updated: 0, fieldsFilled: 0, projectsCreated: 0, interactionsCreated: 0, auditRows: 0,
  };
  const errors = [];
  const skipped = []; // interactions already imported at write time
  const createdIds = [];

  const audit = async (groups, base, reason = null) => {
    try {
      const rows = await recordChanges(user, 'import', groups, { batchId, reason });
      counts.auditRows += rows.length;
    } catch (err) {
      console.error(`Import ${batchId}: ChangeLog write failed for row ${base.row}:`, err.message);
      errors.push({ ...base, message: 'Saved, but the audit record could not be written (logged on the server).' });
    }
  };

  const insertProjects = async (investorId, docs) => {
    if (docs.length === 0) return [];
    const saved = await InvestmentProject.insertMany(
      docs.map((d) => ({ ...d, investor: investorId, importBatchId: batchId })),
      { ordered: true },
    );
    counts.projectsCreated += saved.length;
    return saved.map((p) => p.toObject());
  };

  for (const c of plan.creates) {
    let investor;
    try {
      investor = await Investor.create({ ...c.doc, importBatchId: batchId });
      counts.created += 1;
      createdIds.push(investor._id);
    } catch (err) {
      createdIds.push(null);
      errors.push({ ...c.base, message: err.code === 11000 ? 'Duplicate name or email at write time; not created.' : `Not created: ${err.message}` });
      continue;
    }
    let projects = [];
    try {
      projects = await insertProjects(investor._id, c.projects);
    } catch (err) {
      errors.push({ ...c.base, message: `Investor created, but its projects failed: ${err.message}` });
    }
    await audit([['Investor', [investor.toObject()]], ['InvestmentProject', projects]], c.base);
  }

  for (const u of plan.updates) {
    try {
      if (Object.keys(u.set).length || u.addTags.length) {
        const update = {};
        if (Object.keys(u.set).length) update.$set = u.set;
        if (u.addTags.length) update.$addToSet = { importTags: { $each: u.addTags } };
        await Investor.updateOne({ _id: u.investorId }, update, { runValidators: true });
        // Stamp the first import run that touched it.
        await Investor.updateOne({ _id: u.investorId, importBatchId: { $in: [null] } }, { $set: { importBatchId: batchId } });
      }
    } catch (err) {
      errors.push({ ...u.base, message: err.code === 11000 ? 'Email already used at write time; fields not filled.' : `Fields not filled: ${err.message}` });
      continue;
    }
    if (u.changes > 0) {
      counts.updated += 1;
      counts.fieldsFilled += Object.keys(u.set).length;
    }
    let projects = [];
    try {
      projects = await insertProjects(u.investorId, u.projects);
    } catch (err) {
      errors.push({ ...u.base, message: `Projects failed: ${err.message}` });
    }
    const after = await Investor.findById(u.investorId).lean();
    // The reason says what this run changed on the existing record.
    const reason = [
      u.filled.length ? `filled: ${u.filled.join(', ')}` : null,
      projects.length ? `projects added: ${projects.length}` : null,
    ].filter(Boolean).join('; ') || null;
    await audit([['Investor', after ? [after] : []], ['InvestmentProject', projects]], u.base, reason);
  }

  for (const i of plan.interactions) {
    const investorId = i.target.id || createdIds[i.target.create];
    if (!investorId) {
      errors.push({ ...i.base, message: 'Its investor was not created; interaction skipped.' });
      continue;
    }
    // Re-check at write time (repeat-safe even if two runs overlap); the
    // unique importRef index catches a race between the check and the insert.
    const skippedMsg = { row: i.base.row, id: i.base.id, message: 'Already imported; skipped.' };
    if (await InteractionLog.exists({ importRef: i.doc.importRef })) {
      skipped.push(skippedMsg);
      continue;
    }
    let log;
    try {
      log = await InteractionLog.create({
        ...i.doc, investor: investorId, loggedBy: user._id, importBatchId: batchId,
      });
      counts.interactionsCreated += 1;
    } catch (err) {
      if (err.code === 11000) skipped.push(skippedMsg);
      else errors.push({ ...i.base, message: `Interaction not created: ${err.message}` });
      continue;
    }
    await audit([['InteractionLog', [log.toObject()]]], i.base);
  }

  return {
    batchId, counts, errors, skipped,
  };
};

module.exports = {
  normaliseName,
  normaliseTitle,
  parseImportFile,
  planImport,
  applyImport,
  confirmationText,
  ImportFileError,
  IMPORTED_CATEGORY,
  MAX_FILE_BYTES,
  KNOWN_SECTORS,
};
