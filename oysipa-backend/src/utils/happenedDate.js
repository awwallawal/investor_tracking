// "Happened" dates (FR-Y18): the officer-entered date an event actually took
// place (e.g. from a paper record). The server createdAt stays the recorded time.
// Rules: optional (the controller falls back to today on create), never after
// today on the Africa/Lagos calendar, never before 1990-01-01.

const TIME_ZONE = 'Africa/Lagos';
const MIN_DAY = '1990-01-01';
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Full ISO-8601 date-time with an explicit zone (Z or +hh:mm).
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

const lagosDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

// Calendar day (YYYY-MM-DD) of an instant in Lagos.
const lagosDay = (date) => lagosDayFormatter.format(date);

// Today's calendar day in Lagos, as YYYY-MM-DD.
const todayLagos = () => lagosDay(new Date());

const isEmpty = (raw) => raw === undefined || raw === null || raw === '';

// Returns { value: Date } or { error: string }; { value: undefined } when not sent.
// Accepts only YYYY-MM-DD or a full ISO-8601 date-time. Every accepted value is
// normalised to its Lagos calendar day, stored as that day at 00:00:00.000Z
// (01:00 in Lagos, so the same calendar day there).
const parseHappenedDate = (raw, { required = false, label = 'Date' } = {}) => {
  if (isEmpty(raw)) {
    return required ? { error: `${label} is required.` } : { value: undefined };
  }
  const isDayOnly = typeof raw === 'string' && DAY_ONLY.test(raw);
  const isDateTime = typeof raw === 'string' && ISO_DATE_TIME.test(raw);
  if (!isDayOnly && !isDateTime) {
    return { error: `${label} must be a date (YYYY-MM-DD).` };
  }

  let day;
  if (isDayOnly) {
    // Reject impossible days such as 2025-02-30 (Date rolls them over).
    const check = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== raw) {
      return { error: `${label} is not a valid date.` };
    }
    day = raw;
  } else {
    const instant = new Date(raw);
    if (Number.isNaN(instant.getTime())) {
      return { error: `${label} is not a valid date.` };
    }
    day = lagosDay(instant);
  }
  const value = new Date(`${day}T00:00:00.000Z`);

  if (day > todayLagos()) {
    return { error: `${label} cannot be in the future.` };
  }
  if (day < MIN_DAY) {
    return { error: `${label} cannot be before 1 Jan 1990.` };
  }
  return { value };
};

// Removes the server-owned timestamps from a request body (never taken from the client).
const stripTimestamps = (body) => {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    delete body.createdAt;
    delete body.updatedAt;
  }
  return body;
};

module.exports = {
  parseHappenedDate, todayLagos, lagosDay, stripTimestamps, TIME_ZONE, MIN_DAY,
};
