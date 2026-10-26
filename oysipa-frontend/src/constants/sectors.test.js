// Story 11.14: the frontend sector list must equal the backend list (the API
// accepts list values only).
import { createRequire } from 'module';
import {
  SECTORS, NOT_RECORDED, PRIORITY_SECTORS, OTHER_SECTORS, SECTOR_VALUES,
} from './sectors';

const require = createRequire(import.meta.url);
const backend = require('../../../oysipa-backend/src/constants/sectors.js');

describe('frontend sector list', () => {
  it('matches oysipa-backend/src/constants/sectors.js', () => {
    expect(SECTORS).toEqual(backend.SECTORS);
    expect(PRIORITY_SECTORS).toEqual(backend.PRIORITY_SECTORS);
    expect(OTHER_SECTORS).toEqual(backend.OTHER_SECTORS);
    expect(NOT_RECORDED).toBe(backend.NOT_RECORDED);
    expect(SECTOR_VALUES).toEqual(backend.SECTOR_VALUES);
  });
});
