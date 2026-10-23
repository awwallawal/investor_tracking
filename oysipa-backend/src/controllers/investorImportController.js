const path = require('path');
const multer = require('multer');
const {
  parseImportFile, planImport, applyImport, confirmationText, ImportFileError, MAX_FILE_BYTES,
} = require('../services/investorImport');

// Import investors (story 11.11): DG/Portal-Admin only (enforced in the routes).
// One `.json` file in the multipart field "file", at most 2 MB, kept in memory.
const importFile = (req, res, next) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (r, file, cb) => {
      if (path.extname(file.originalname || '').toLowerCase() !== '.json') {
        const err = new Error('Only a .json import file is accepted.');
        err.code = 'BAD_FILE_TYPE';
        return cb(err);
      }
      return cb(null, true);
    },
  }).single('file');

  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'The import file is larger than 2 MB.' });
      if (err.code === 'BAD_FILE_TYPE') return res.status(400).json({ message: err.message });
      return res.status(400).json({ message: 'Upload error.' });
    }
    if (!req.file || !req.file.buffer || req.file.size === 0) {
      return res.status(400).json({ message: 'Choose an import file (.json) in the form field "file".' });
    }
    return next();
  });
};

const readPlan = async (req) => planImport(parseImportFile(req.file.buffer));

const sendError = (res, error) => {
  if (error instanceof ImportFileError) return res.status(400).json({ message: error.message });
  console.error('Investor import failed:', error.message);
  return res.status(500).json({ message: 'Server Error' });
};

// POST /api/investors/import/dry-run — writes nothing.
exports.dryRun = async (req, res) => {
  try {
    const plan = await readPlan(req);
    return res.json({ confirmation: confirmationText(plan), report: plan.report });
  } catch (error) {
    return sendError(res, error);
  }
};

// POST /api/investors/import/run — file + `confirm`, which must be exactly
// "IMPORT <n>" for n = investors to create in a fresh plan of this file.
exports.run = async (req, res) => {
  try {
    const plan = await readPlan(req);
    const expected = confirmationText(plan);
    const confirm = typeof (req.body && req.body.confirm) === 'string' ? req.body.confirm.trim() : '';
    if (confirm !== expected) {
      return res.status(400).json({
        message: `Type "${expected}" to confirm (the number of investors this file creates now). Nothing was imported.`,
        confirmation: expected,
      });
    }
    const result = await applyImport(plan, req.user);
    return res.json({ ...result, report: plan.report });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.importFile = importFile;
