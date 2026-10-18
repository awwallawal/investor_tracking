// The frontend picker list must match the backend enum (same codes, same order).
const fs = require('fs');
const path = require('path');
const { SERVICE_CODES } = require('./serviceCodes');

describe('SABER service codes', () => {
  it('frontend constants list the same codes as the backend enum, in order', () => {
    const file = path.join(__dirname, '..', '..', '..', 'oysipa-frontend', 'src', 'constants', 'serviceCodes.js');
    const text = fs.readFileSync(file, 'utf8');
    const frontendCodes = [...text.matchAll(/code: '([^']+)'/g)].map((m) => m[1]);
    expect(frontendCodes).toEqual(SERVICE_CODES);
    expect(SERVICE_CODES).toHaveLength(29);
  });
});
