const { AsyncResource } = require('async_hooks');
const path = require('path');
const multer = require('multer');
const storage = require('../services/documentStorage');

// Allowed document types (FR-Y19): extension → accepted MIME types. The first
// MIME type is the one stored. Browsers sometimes send octet-stream for Office
// files, so that is accepted when the extension is allowed.
const ALLOWED = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};
const GENERIC_MIME = 'application/octet-stream';

const TYPE_MSG = 'File type not allowed. Use PDF, Word (.doc/.docx), Excel (.xls/.xlsx), JPEG or PNG.';

const canonicalMime = (fileName, mimeType) => {
  const types = ALLOWED[path.extname(fileName || '').toLowerCase()];
  if (!types) return null;
  if (!types.includes(mimeType) && mimeType !== GENERIC_MIME) return null;
  return types[0];
};

// Storage must be configured before a file is even read.
const requireStorage = (req, res, next) => {
  if (!storage.isConfigured()) {
    return res.status(503).json({ message: storage.NOT_CONFIGURED_MSG });
  }
  return next();
};

// Parses a single multipart `file` into memory, enforcing size and type.
// Sends 400 {message} for a bad file. Sets req.file.mimetype to the canonical type.
const singleDocument = (req, res, next) => {
  const maxBytes = storage.maxBytes();
  const upload = multer({
    storage: multer.memoryStorage(),
    // Decode file names as UTF-8 (default is latin1, which garbles e.g. Yoruba names).
    defParamCharset: 'utf8',
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (r, file, cb) => {
      const mime = canonicalMime(file.originalname, file.mimetype);
      if (!mime) {
        const err = new Error(TYPE_MSG);
        err.code = 'BAD_FILE_TYPE';
        return cb(err);
      }
      // eslint-disable-next-line no-param-reassign
      file.mimetype = mime;
      return cb(null, true);
    },
  }).single('file');

  // Bound to the current async context: multer calls back from the request
  // stream's events, which would otherwise lose the audit actor (story 11.10).
  upload(req, res, AsyncResource.bind((err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const mb = maxBytes / (1024 * 1024);
        const label = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
        return res.status(400).json({ message: `File is larger than ${label} MB.` });
      }
      if (err.code === 'BAD_FILE_TYPE') {
        return res.status(400).json({ message: TYPE_MSG });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      }
      // Any other parse error (malformed multipart, aborted stream).
      return res.status(400).json({ message: 'Upload error.' });
    }
    if (!req.file || !req.file.buffer || req.file.size === 0) {
      return res.status(400).json({ message: 'Choose a file to upload (form field "file").' });
    }
    return next();
  }));
};

module.exports = {
  requireStorage, singleDocument, canonicalMime, TYPE_MSG, ALLOWED,
};
