// SABER report / verifier export (story 11.9). DG / Portal-Admin only (route).
// GET /api/saber-report?year=YYYY|all           → JSON summary (no personal data)
// GET /api/saber-report/download?year=&part=     → one CSV, the PDF or a ZIP of all six
// Each download first writes a ChangeLog `export` row (entity SaberReport,
// snapshot { list, year, part, files, rowCounts, rowCount }), as the 11.15 list
// exports; if that fails → 500 and no file.
const mongoose = require('mongoose');
const archiver = require('archiver');
const { resolveYear } = require('../services/metrics');
const {
  buildSaberReport, csvPart, rowCounts, fileName, CSV_PARTS, PARTS, PART_TITLES,
} = require('../services/saberReport');
const { buildPdf } = require('../services/saberReportPdf');
const { recordChanges } = require('../utils/recordDeletion');
const { EXPORT_ENTITY_IDS } = require('./exportController');

const AUDIT_ENTITY = 'SaberReport';

const yearFrom = (req) => resolveYear(req.query ? req.query.year : undefined);

// Resolves to the ZIP of `entries` ([{ name, data }]) as a Buffer.
const zipOf = (entries) => new Promise((resolve, reject) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks = [];
  archive.on('data', (c) => chunks.push(c));
  archive.on('end', () => resolve(Buffer.concat(chunks)));
  archive.on('warning', reject);
  archive.on('error', reject);
  entries.forEach((e) => archive.append(e.data, { name: e.name }));
  archive.finalize();
});

const getSaberReport = async (req, res) => {
  try {
    const parsed = yearFrom(req);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const report = await buildSaberReport({ year: parsed.year, user: req.user });
    const counts = rowCounts(report);
    return res.json({
      year: report.year,
      currentYear: parsed.current,
      generatedAt: report.generatedAt.toISOString(),
      summary: report.summary,
      links: report.links,
      parts: [
        ...CSV_PARTS.map((part) => ({
          part, title: PART_TITLES[part], format: 'csv', rows: counts[part], fileName: fileName(report.year, part),
        })),
        { part: 'pdf', title: 'PDF report (all parts)', format: 'pdf', fileName: fileName(report.year, 'pdf') },
        { part: 'all', title: 'All files (ZIP)', format: 'zip', fileName: fileName(report.year, 'all') },
      ],
    });
  } catch (error) {
    console.error('Error building the SABER report:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const downloadSaberReport = async (req, res) => {
  try {
    const parsed = yearFrom(req);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const part = req.query ? req.query.part : undefined;
    if (typeof part !== 'string' || !PARTS.includes(part)) {
      return res.status(400).json({ message: `part must be one of: ${PARTS.join(', ')}.` });
    }
    const report = await buildSaberReport({ year: parsed.year, user: req.user });
    const counts = rowCounts(report);

    let body;
    let type;
    let files;
    if (CSV_PARTS.includes(part)) {
      body = csvPart(report, part).csv;
      type = 'text/csv; charset=utf-8';
      files = [fileName(report.year, part)];
    } else if (part === 'pdf') {
      body = await buildPdf(report);
      type = 'application/pdf';
      files = [fileName(report.year, 'pdf')];
    } else {
      const entries = [
        ...CSV_PARTS.map((p) => ({ name: fileName(report.year, p), data: Buffer.from(csvPart(report, p).csv, 'utf8') })),
        { name: fileName(report.year, 'pdf'), data: await buildPdf(report) },
      ];
      body = await zipOf(entries);
      type = 'application/zip';
      files = entries.map((e) => e.name);
    }
    const partCounts = CSV_PARTS.includes(part) ? { [part]: counts[part] } : counts;
    const rowCount = Object.values(partCounts).reduce((n, v) => n + v, 0);

    try {
      await recordChanges(req, 'export', [[AUDIT_ENTITY, [{
        _id: new mongoose.Types.ObjectId(EXPORT_ENTITY_IDS.saberReport),
        list: 'saber-report',
        year: report.year === null ? 'all' : report.year,
        part,
        files,
        filters: { year: report.year === null ? 'all' : String(report.year), part },
        rowCounts: partCounts,
        rowCount,
      }]]]);
    } catch (auditError) {
      console.error('ChangeLog write failed; SABER report refused:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was exported.' });
    }

    res.set('Content-Type', type);
    res.set('Content-Disposition', `attachment; filename="${fileName(report.year, part)}"`);
    res.set('X-Row-Count', String(rowCount));
    return res.status(200).send(body);
  } catch (error) {
    console.error('Error building the SABER report download:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getSaberReport, downloadSaberReport, zipOf };
