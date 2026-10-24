// Announcements register (story 11.8, DLR 4.4). Keep in sync with
// oysipa-backend/src/constants/announcementFields.js.

// "N of 5": 0 none yet, 1-4 basic, 5 or more stretch.
export const ANNOUNCEMENT_TARGET = 5;

export const ANNOUNCEMENT_BAND_LABELS = {
  'none yet': 'None yet',
  basic: 'Basic band (1–4)',
  stretch: 'Stretch band (5 or more)',
};

// Same limit as the server (MAX_URL_LENGTH in the backend constants).
export const MAX_URL_LENGTH = 2000;

// True for an http(s) link of at most MAX_URL_LENGTH characters (the server checks too).
export const isHttpUrl = (value) => {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};
