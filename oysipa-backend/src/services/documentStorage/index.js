// Private document storage (FR-Y19). One module in front of the provider, chosen
// by DOCUMENT_STORAGE (default 'cloudinary'). Add an S3-compatible adapter here
// later; callers only use the functions below.
//
// A provider exposes: name, isConfigured(), upload(buffer, {fileName, mimeType})
// → {key, resourceType}, signedUrl(doc, ttlSeconds) → url, remove(doc).

const PROVIDERS = {
  // eslint-disable-next-line global-require
  cloudinary: () => require('./cloudinary'),
};

const NOT_CONFIGURED_MSG = 'Document storage is not configured';

let testProvider = null;

const providerName = () => (process.env.DOCUMENT_STORAGE || 'cloudinary').trim().toLowerCase();

const getProvider = () => {
  if (testProvider) return testProvider;
  const load = PROVIDERS[providerName()];
  return load ? load() : null;
};

const isConfigured = () => {
  const provider = getProvider();
  return !!(provider && provider.isConfigured());
};

const requireProvider = () => {
  const provider = getProvider();
  if (!provider || !provider.isConfigured()) {
    const err = new Error(NOT_CONFIGURED_MSG);
    err.code = 'STORAGE_NOT_CONFIGURED';
    throw err;
  }
  return provider;
};

const upload = async (buffer, { fileName, mimeType }) => {
  const provider = requireProvider();
  const { key, resourceType } = await provider.upload(buffer, { fileName, mimeType });
  return { provider: provider.name, key, resourceType };
};

const signedUrl = (doc, ttlSeconds) => requireProvider().signedUrl(doc, ttlSeconds);

const remove = (doc) => requireProvider().remove(doc);

// Tests inject a fake provider; pass null to restore the env-selected one.
// eslint-disable-next-line no-underscore-dangle
const __setProviderForTests = (provider) => { testProvider = provider; };

const maxBytes = () => {
  const mb = Number(process.env.DOCUMENT_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
};

module.exports = {
  isConfigured, upload, signedUrl, remove, maxBytes, __setProviderForTests, NOT_CONFIGURED_MSG,
};
