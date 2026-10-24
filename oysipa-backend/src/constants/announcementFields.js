// Announcements register (story 11.8, SABER DLR 4.4). Single source for the
// metric rules. The frontend keeps a copy in oysipa-frontend/src/constants/announcementFields.js.

// Projects of these organisation types are left out of the announcements count.
const EXCLUDED_ORGANISATION_TYPES = ['Intermediary', 'Promotion agent'];

// DLR 4.4 bands: 0 → none yet; 1–4 → basic; 5 or more → stretch. Shown as "N of 5".
const ANNOUNCEMENT_TARGET = 5;
const BAND_NONE = 'none yet';
const BAND_BASIC = 'basic';
const BAND_STRETCH = 'stretch';
const announcementBand = (counted) => {
  if (!counted) return BAND_NONE;
  if (counted >= ANNOUNCEMENT_TARGET) return BAND_STRETCH;
  return BAND_BASIC;
};

const MAX_URL_LENGTH = 2000;

module.exports = {
  EXCLUDED_ORGANISATION_TYPES,
  ANNOUNCEMENT_TARGET,
  BAND_NONE,
  BAND_BASIC,
  BAND_STRETCH,
  announcementBand,
  MAX_URL_LENGTH,
};
