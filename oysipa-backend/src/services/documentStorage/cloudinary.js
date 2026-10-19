// Cloudinary adapter for private document storage (FR-Y19).
// Files are uploaded with type 'private', so Cloudinary never serves them from a
// public delivery URL; they open only through a signed, expiring download link.
// Credentials come from the server env and are passed per call (no global config).
const crypto = require('crypto');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const NAME = 'cloudinary';
const FOLDER = 'oysipa-documents';

const credentials = () => ({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isConfigured = () => {
  const c = credentials();
  return !!(c.cloud_name && c.api_key && c.api_secret);
};

const IMAGE_FORMATS = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const resourceTypeFor = (mimeType) => (IMAGE_FORMATS[mimeType] ? 'image' : 'raw');

// Resolves { key, resourceType }.
const upload = (buffer, { fileName, mimeType }) => new Promise((resolve, reject) => {
  const resourceType = resourceTypeFor(mimeType);
  const id = crypto.randomUUID();
  // Raw files keep their extension in the public id so downloads open correctly.
  const ext = path.extname(fileName || '').toLowerCase();
  const publicId = resourceType === 'raw' ? `${id}${ext}` : id;

  const stream = cloudinary.uploader.upload_stream({
    ...credentials(),
    type: 'private',
    resource_type: resourceType,
    folder: FOLDER,
    public_id: publicId,
    overwrite: false,
  }, (error, result) => {
    if (error) return reject(error);
    if (!result || !result.public_id) return reject(new Error('Cloudinary returned no public_id'));
    return resolve({ key: result.public_id, resourceType });
  });
  stream.end(buffer);
});

// Signed link that expires after ttlSeconds.
const signedUrl = async (doc, ttlSeconds) => {
  const resourceType = doc.resourceType || 'raw';
  const format = resourceType === 'image' ? (IMAGE_FORMATS[doc.mimeType] || '') : '';
  return cloudinary.utils.private_download_url(doc.key, format, {
    ...credentials(),
    resource_type: resourceType,
    type: 'private',
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
};

const remove = async (doc) => {
  const result = await cloudinary.uploader.destroy(doc.key, {
    ...credentials(),
    resource_type: doc.resourceType || 'raw',
    type: 'private',
    invalidate: true,
  });
  // 'not found' means it is already gone, which is the goal.
  if (result && result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Cloudinary destroy failed: ${result.result}`);
  }
};

module.exports = {
  name: NAME, isConfigured, upload, signedUrl, remove,
};
