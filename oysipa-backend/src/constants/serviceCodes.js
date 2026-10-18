// SABER DLI 4 investor service codes (SABER-DLI4-Investor-Services-and-Tracking-System.pdf, pp.2-3).
// Single source for the InteractionLog.serviceCodes enum. The wording lives in
// oysipa-frontend/src/constants/serviceCodes.js.
const SERVICE_CODE_GROUPS = {
  Marketing: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'],
  Information: ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'],
  Assistance: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'],
  Advocacy: ['V1', 'V2', 'V3', 'V4', 'V5'],
};

const SERVICE_CODES = Object.values(SERVICE_CODE_GROUPS).flat();

module.exports = { SERVICE_CODES, SERVICE_CODE_GROUPS };
