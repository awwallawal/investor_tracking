// Cloudinary adapter (11.4b): private uploads, signed expiring links, removal.
// The SDK is mocked: nothing reaches Cloudinary.
jest.mock('cloudinary', () => {
  const uploader = { upload_stream: jest.fn(), destroy: jest.fn() };
  const utils = { private_download_url: jest.fn(() => 'https://signed.example.test/x') };
  return { v2: { uploader, utils } };
});

const { v2: cloudinary } = require('cloudinary');
const adapter = require('./cloudinary');

const ENV = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  process.env.CLOUDINARY_CLOUD_NAME = 'cloud-test';
  process.env.CLOUDINARY_API_KEY = 'key-test';
  process.env.CLOUDINARY_API_SECRET = 'secret-test';
  jest.clearAllMocks();
  cloudinary.uploader.upload_stream.mockImplementation((options, cb) => ({
    end: () => cb(null, { public_id: `oysipa-documents/${options.public_id}` }),
  }));
});

afterEach(() => {
  ENV.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
});

describe('cloudinary adapter', () => {
  it('isConfigured needs all three env values', () => {
    expect(adapter.isConfigured()).toBe(true);
    delete process.env.CLOUDINARY_API_SECRET;
    expect(adapter.isConfigured()).toBe(false);
  });

  it('uploads a PDF as a private raw resource; public_id keeps the extension', async () => {
    const res = await adapter.upload(Buffer.from('x'), { fileName: 'Scan.PDF', mimeType: 'application/pdf' });
    const [options] = cloudinary.uploader.upload_stream.mock.calls[0];
    expect(options).toMatchObject({ type: 'private', resource_type: 'raw', cloud_name: 'cloud-test' });
    expect(options.public_id).toMatch(/\.pdf$/);
    expect(res).toEqual({ key: `oysipa-documents/${options.public_id}`, resourceType: 'raw' });
  });

  it('uploads images as private image resources without an extension', async () => {
    const res = await adapter.upload(Buffer.from('x'), { fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    const [options] = cloudinary.uploader.upload_stream.mock.calls[0];
    expect(options).toMatchObject({ type: 'private', resource_type: 'image' });
    expect(options.public_id).not.toMatch(/\./);
    expect(res.resourceType).toBe('image');
  });

  it('upload rejects on an SDK error', async () => {
    cloudinary.uploader.upload_stream.mockImplementation((options, cb) => ({ end: () => cb(new Error('boom')) }));
    await expect(adapter.upload(Buffer.from('x'), { fileName: 'a.pdf', mimeType: 'application/pdf' })).rejects.toThrow('boom');
  });

  it.each([
    [{ key: 'k1', resourceType: 'raw', mimeType: 'application/pdf' }, '', 'raw'],
    [{ key: 'k2', resourceType: 'image', mimeType: 'image/jpeg' }, 'jpg', 'image'],
    [{ key: 'k3', resourceType: 'image', mimeType: 'image/png' }, 'png', 'image'],
  ])('signedUrl %#: private download URL expiring after the ttl', async (doc, format, resourceType) => {
    const now = Math.floor(Date.now() / 1000);
    const url = await adapter.signedUrl(doc, 300);
    expect(url).toBe('https://signed.example.test/x');
    const [publicId, fmt, options] = cloudinary.utils.private_download_url.mock.calls[0];
    expect(publicId).toBe(doc.key);
    expect(fmt).toBe(format);
    expect(options).toMatchObject({ type: 'private', resource_type: resourceType });
    expect(options.expires_at).toBeGreaterThanOrEqual(now + 300);
    expect(options.expires_at).toBeLessThanOrEqual(now + 302);
  });

  it.each(['ok', 'not found'])('remove resolves on %p', async (result) => {
    cloudinary.uploader.destroy.mockResolvedValue({ result });
    await expect(adapter.remove({ key: 'k1', resourceType: 'raw' })).resolves.toBeUndefined();
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('k1', expect.objectContaining({ type: 'private', resource_type: 'raw' }));
  });

  it('remove rejects on "error"', async () => {
    cloudinary.uploader.destroy.mockResolvedValue({ result: 'error' });
    await expect(adapter.remove({ key: 'k1', resourceType: 'raw' })).rejects.toThrow(/error/);
  });
});
