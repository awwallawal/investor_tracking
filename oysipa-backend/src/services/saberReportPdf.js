// SABER report PDF (story 11.9): A4 landscape, server-side with pdfkit.
// A cover page with the summary numbers, one section per part with tables
// (long text cut to fit; the CSV holds the full text), and on every page the
// confidential line in the header and footer, plus page numbers.
//
// Text is set in DejaVu Sans Condensed (assets/fonts, free licence in
// DejaVu-LICENSE.txt), which has ✓, ₦ and the Yoruba letters (ẹ ọ ṣ and tone
// marks). Only if those files cannot be loaded does it fall back to the
// built-in Helvetica, with text folded to its WinAnsi characters.
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  CONFIDENTIAL, FIELDS, PART_TITLES, RULES_NOTE, generatedText, yearText, pct, yesNo, isoDay, supportingText,
} = require('./saberReport');

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_FILES = {
  regular: path.join(FONT_DIR, 'DejaVuSansCondensed.ttf'),
  bold: path.join(FONT_DIR, 'DejaVuSansCondensed-Bold.ttf'),
};
// Mutable so a test can point at a missing file (fallback path).
const fontFiles = { ...FONT_FILES };

const MARGIN = 36;
const HEADER_Y = 16;
const SIZE = 7;
const ROW_PAD = 3;
const FULL_TEXT_NOTE = 'Long text is cut to fit. The CSV of this part holds the full text.';

// Characters outside Latin-1 that WinAnsi still has (fallback font only).
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
const pdfText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/₦/g, 'NGN ')
    .replace(/✓/g, 'OK')
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(ch) ? ch : '?'))
    .join('');
};
// Unicode font: one line, composed characters.
const unicodeText = (value) => (value === undefined || value === null ? '' : String(value).replace(/[\r\n\t]+/g, ' ').normalize('NFC'));

// Fonts for this document: { regular, bold, clean, unicode }.
const setupFonts = (doc) => {
  try {
    doc.registerFont('SaberRegular', fontFiles.regular);
    doc.registerFont('SaberBold', fontFiles.bold);
    doc.font('SaberBold');
    doc.font('SaberRegular');
    return {
      regular: 'SaberRegular', bold: 'SaberBold', clean: unicodeText, unicode: true,
    };
  } catch (e) {
    console.error('SABER report: the PDF font could not be loaded; using Helvetica (ASCII fallback).', e.message);
    return {
      regular: 'Helvetica', bold: 'Helvetica-Bold', clean: pdfText, unicode: false,
    };
  }
};

// `value` cut (with "…") to fit `width` at the current font.
const fit = (doc, value, width, clean = pdfText) => {
  const s = clean(value);
  if (doc.widthOfString(s) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(`${s.slice(0, mid)}…`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}…`;
};

const bottom = (doc) => doc.page.height - doc.page.margins.bottom;

// A table of single-line cells. `columns`: [[header, width, value(row)]]
// (widths are shares of the page width). The header row repeats on each page.
const drawTable = (doc, f, columns, rows, emptyText) => {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const total = columns.reduce((n, c) => n + c[1], 0);
  const widths = columns.map((c) => (c[1] / total) * usable);
  const rowH = SIZE + ROW_PAD * 2;
  const rule = (y) => doc.save().moveTo(left, y).lineTo(left + usable, y).lineWidth(0.3)
    .strokeColor('#CCCCCC')
    .stroke()
    .restore();
  const line = (cells, bold, shade) => {
    if (doc.y + rowH > bottom(doc)) {
      doc.addPage();
      if (!bold) line(columns.map((c) => c[0]), true, true);
    }
    const { y } = doc;
    if (shade) doc.save().rect(left, y, usable, rowH).fill('#EFE7E7').restore();
    doc.font(bold ? f.bold : f.regular).fontSize(SIZE).fillColor('#222222');
    let x = left;
    cells.forEach((c, i) => {
      doc.text(fit(doc, c, widths[i] - 4, f.clean), x + 2, y + ROW_PAD, { lineBreak: false, width: widths[i] - 4 });
      x += widths[i];
    });
    rule(y + rowH);
    doc.x = left;
    doc.y = y + rowH;
  };
  line(columns.map((c) => c[0]), true, true);
  if (!rows.length) {
    // One full-width row, not cut to the first column.
    const { y } = doc;
    doc.font(f.regular).fontSize(SIZE).fillColor('#555555')
      .text(fit(doc, emptyText, usable - 4, f.clean), left + 2, y + ROW_PAD, { lineBreak: false, width: usable - 4 });
    rule(y + rowH);
    doc.x = left;
    doc.y = y + rowH;
  }
  rows.forEach((r) => line(columns.map((c) => c[2](r)), false, false));
  doc.moveDown(0.6);
};

const heading = (doc, f, title, note) => {
  if (doc.y + 60 > bottom(doc)) doc.addPage();
  doc.x = doc.page.margins.left;
  doc.font(f.bold).fontSize(13).fillColor('#6B1E2E').text(f.clean(title));
  if (note) doc.font(f.regular).fontSize(8).fillColor('#555555').text(f.clean(note));
  doc.moveDown(0.4);
};

const keyValues = (doc, f, pairs) => {
  pairs.forEach(([k, v]) => {
    doc.font(f.bold).fontSize(10).fillColor('#222222').text(`${f.clean(k)}: `, { continued: true });
    doc.font(f.regular).text(f.clean(v));
  });
  doc.moveDown(0.5);
};

const logColumns = [
  ['Date', 7, (r) => r.date],
  ['Investor / intermediary', 14, (r) => r.name],
  ['Type', 8, (r) => r.organisationType],
  ['Project', 12, (r) => r.project],
  ['Codes', 8, (r) => r.codes.join(' ')],
  ['Description', 30, (r) => r.description],
  ['Evidence', 21, (r) => r.evidenceLink],
];

// Draws the whole report into `doc` (exported for tests of the layout).
const layout = (doc, report, f) => {
  const s = report.summary;
  const yr = yearText(report.year);
  const none = `No records for ${report.year === null ? 'any year' : yr}.`;
  const band = (b) => (b ? `, ${b}` : '');

  // Cover
  doc.font(f.bold).fontSize(22).fillColor('#6B1E2E').text('SABER report (DLI 4)');
  doc.font(f.regular).fontSize(12).fillColor('#222222').text(f.clean(`Oyo State Investment Promotion Agency (OYSIPA) · Year: ${yr} (by happened date)`));
  doc.fontSize(10).fillColor('#555555').text(f.clean(generatedText(report)));
  doc.fillColor('#8A1C1C').font(f.bold).text(CONFIDENTIAL);
  doc.moveDown(1);
  keyValues(doc, f, [
    ['Projects checked (T1–T11)', `${s.projectsChecked}; ${s.projectsComplete} complete (${pct(s.completeShare) || 'n/a'}); fields filled ${pct(s.fieldsFilledShare) || 'n/a'}`],
    ['Officer interactions in year', s.interactions],
    ['Services tagged with a SABER code', s.servicesTagged],
    ['Credit linkage', s.creditLinkage],
    ['Announcements in year', s.announcements],
    ['Announcements counted for DLR 4.4 (OYSIPA named)', `${s.announcementsCounted}${s.announcementBand ? ` (${s.announcementBand})` : ''}`],
    ['Issues counted for DLR 4.5 (Withdrawn left out)', s.issues],
    ['Issues resolved', `${s.issuesResolved} (${pct(s.issuesResolvedShare) || 'n/a'}${band(s.issuesBand)})`],
  ]);
  doc.font(f.regular).fontSize(9).fillColor('#555555').text(f.clean('Figures come from the same metrics service as the DG dashboard. Years use happened dates (first contact, interaction, announcement, date reported), never the day a record was entered. Every row in the CSVs carries its happened date and the server createdAt / updatedAt.'));

  // 1. Completeness
  doc.addPage();
  heading(doc, f, `1. ${PART_TITLES.completeness}`, `Projects of investors (organisation type Investor) first contacted in ${yr} or with an officer interaction then (on the project or at investor level); Intermediaries and Promotion agents are left out. ${RULES_NOTE} ${FULL_TEXT_NOTE}`);
  const cRows = report.completeness.rows;
  const { totals } = report.completeness;
  const okText = f.unicode ? '✓' : 'OK';
  const cell = (k) => (r) => {
    if (r.totals) return totals[k];
    return r.checks[k] ? okText : 'MISSING';
  };
  // Last row: the number of projects MISSING each field.
  const totalsRow = {
    totals: true, investor: 'Total MISSING', project: `${cRows.length} projects`, t10Latest: null, missing: cRows.reduce((n, x) => n + x.missing.length, 0),
  };
  drawTable(doc, f, [
    ['Investor', 12, (r) => r.investor],
    ['Project', 12, (r) => r.project],
    ...FIELDS.map(([k]) => [k, 4.2, cell(k)]),
    ['T10 latest', 6, (r) => isoDay(r.t10Latest)],
    ['Missing', 4.5, (r) => (r.totals ? r.missing : r.missing.length)],
  ], cRows.length ? [...cRows, totalsRow] : [], none);
  doc.font(f.regular).fontSize(9).fillColor('#222222')
    .text(f.clean(`Projects complete: ${s.projectsComplete} of ${s.projectsChecked} (${pct(s.completeShare) || 'n/a'}). Fields filled: ${pct(s.fieldsFilledShare) || 'n/a'}.`));
  doc.font(f.regular).fontSize(7).fillColor('#555555')
    .text(f.clean(FIELDS.map(([, label]) => label).join(' · ')));

  // 2. Services
  doc.addPage();
  heading(doc, f, `2. ${PART_TITLES.services}`, `Count = officer interactions with a happened date in ${yr} carrying the code (as the dashboard): ${s.servicesTagged} tagged, ${s.creditLinkage} credit linkage. Up to 3 examples per code, newest first. ${FULL_TEXT_NOTE}`);
  const sRows = [];
  report.services.codes.forEach((c) => {
    if (!c.examples.length) sRows.push({ code: c.code, count: c.count, e: null });
    c.examples.forEach((e) => sRows.push({ code: c.code, count: c.count, e }));
  });
  drawTable(doc, f, [
    ['Code', 4, (r) => r.code],
    ['Count', 4, (r) => r.count],
    ...logColumns.filter(([h]) => h !== 'Codes').map(([h, w, v]) => [h, w, (r) => (r.e ? v(r.e) : '')]),
  ], sRows, none);

  // 3. Credit linkage
  doc.addPage();
  heading(doc, f, `3. ${PART_TITLES.credit}`, `${report.credit.rows.length} officer interactions in ${yr} marked credit linkage. ${FULL_TEXT_NOTE}`);
  drawTable(doc, f, logColumns, report.credit.rows, none);

  // 4. Announcements
  doc.addPage();
  heading(doc, f, `4. ${PART_TITLES.announcements}`, `${report.announcements.rows.length} announcements in ${yr}; ${s.announcementsCounted} counted for DLR 4.4 (OYSIPA named; projects of Intermediaries / Promotion agents left out). ${FULL_TEXT_NOTE}`);
  drawTable(doc, f, [
    ['Date', 6, (r) => r.date],
    ['Outlet', 9, (r) => r.outlet],
    ['Link', 12, (r) => r.url],
    ['Archived copy', 10, (r) => r.archivedCopyUrl],
    ['Named', 4, (r) => yesNo(r.oysipaNamed)],
    ['OYSIPA role', 14, (r) => r.oysipaRoleText],
    ['Project', 10, (r) => r.project],
    ['Investor', 10, (r) => r.investor],
    ['Supporting interactions', 18, supportingText],
    ['Counts', 4, (r) => yesNo(r.counts)],
  ], report.announcements.rows, none);

  // 5. Issues
  doc.addPage();
  heading(doc, f, `5. ${PART_TITLES.issues}`, `${report.issues.rows.length} issues reported in ${yr}; ${s.issuesResolved} of ${s.issues} resolved (${pct(s.issuesResolvedShare) || 'n/a'}; Withdrawn left out). ${FULL_TEXT_NOTE}`);
  drawTable(doc, f, [
    ['Reference', 9, (r) => r.reference],
    ['Reported', 7, (r) => r.dateReported],
    ['Investor', 15, (r) => r.investor],
    ['Project', 14, (r) => r.project],
    ['Category', 11, (r) => r.category],
    ['MDA(s)', 10, (r) => r.mdas.join(', ')],
    ['Status', 9, (r) => r.status],
    ['Resolved', 7, (r) => r.resolvedDate],
    ['Latest action', 7, (r) => r.latestActionDate],
  ], report.issues.rows, none);
};

// Header and footer on every page (after layout, with buffered pages).
const stampPages = (doc, report, f) => {
  const range = doc.bufferedPageRange();
  const yr = yearText(report.year);
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const { margins } = doc.page;
    const saved = { top: margins.top, bottom: margins.bottom };
    // Writing inside the margins must not start a new page.
    margins.top = 0;
    margins.bottom = 0;
    const width = doc.page.width - MARGIN * 2;
    const pageText = `Page ${i - range.start + 1} of ${range.count}`;
    doc.font(f.bold).fontSize(7).fillColor('#8A1C1C');
    doc.text(fit(doc, `${CONFIDENTIAL} · SABER report ${yr}`, width, f.clean), MARGIN, HEADER_Y, { width, lineBreak: false });
    doc.font(f.regular).fontSize(7).fillColor('#555555');
    const pageWidth = doc.widthOfString(pageText) + 2;
    const footY = doc.page.height - 22;
    // The footer line is cut so it never runs into the page number.
    doc.text(fit(doc, `${CONFIDENTIAL} · ${generatedText(report)}`, width - pageWidth - 12, f.clean), MARGIN, footY, { width: width - pageWidth - 12, lineBreak: false });
    doc.text(pageText, MARGIN + width - pageWidth, footY, { width: pageWidth, lineBreak: false, align: 'right' });
    margins.top = saved.top;
    margins.bottom = saved.bottom;
  }
};

// Resolves to the PDF as a Buffer. `compress: false` keeps the file readable (tests).
const buildPdf = (report, { compress = true } = {}) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: {
      top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN,
    },
    bufferPages: true,
    compress,
    info: { Title: `SABER report ${yearText(report.year)}`, Author: 'OYSIPA', Subject: CONFIDENTIAL },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  try {
    const f = setupFonts(doc);
    layout(doc, report, f);
    stampPages(doc, report, f);
    doc.end();
  } catch (e) {
    reject(e);
  }
});

module.exports = {
  buildPdf, layout, pdfText, unicodeText, fit, fontFiles, FONT_FILES,
};
