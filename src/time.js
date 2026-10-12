// Times as a file writes them: a date, a time of day and a time zone, read from its
// characters into the nanosecond it names, counted in UTC from the start of the Unix epoch, with BigInt. The
// calendar is worked out by hand (the proleptic Gregorian calendar of XML Schema), so the tool reads no clock, no time
// zone of the machine and no locale, and the same text gives the same moment on every system. A time is never shown in
// another form than the one the file writes.

const TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})?$/;
const OFFSET = /^([+-])([0-9]{2}):([0-9]{2})$/;

export const TIME_FORM = 'YYYY-MM-DDThh:mm:ss with an optional fraction of a second and a time zone, Z or +hh:mm';
export const OFFSET_FORM = '+hh:mm or -hh:mm, with hours from 00 to 14 and minutes from 00 to 59';

const NS = 1000000000n;

// What is wrong with a time zone offset, or null when it is right.
export function offsetProblem(text) {
  const m = OFFSET.exec(text);
  if (!m) return `is not written ${OFFSET_FORM}`;
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (h > 14) return `has ${m[2]} hours, more than 14`;
  if (min > 59) return `has ${m[3]} minutes, more than 59`;
  if (h === 14 && min !== 0) return 'has 14 hours with minutes other than 00';
  return null;
}

// The minutes east of UTC of a valid offset.
export function offsetMinutes(text) {
  const m = OFFSET.exec(text);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// The days from the start of the Unix epoch to a day of the proleptic Gregorian calendar.
export function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Reads a time: { ns, zone } with ns the nanosecond it names as a BigInt, or { problem } that says what is wrong. A
// fraction of more than nine digits is read to the nanosecond.
export function readTime(text) {
  const m = TIME.exec(text);
  if (!m) return { problem: `is not a date and time written ${TIME_FORM}` };
  const [, ys, mos, ds, hs, mins, ss, frac, zone] = m;
  if (zone === undefined) return { problem: 'has no time zone, so the moment it names is not known; end it with Z or an offset such as +01:00' };
  const [year, month, day, hour, minute, second] = [ys, mos, ds, hs, mins, ss].map(Number);
  if (month < 1 || month > 12) return { problem: `has the month ${mos}` };
  const last = month === 2 && leap(year) ? 29 : DAYS[month - 1];
  if (day < 1 || day > last) return { problem: `has the day ${ds}, but month ${mos} of ${ys} has ${last} days` };
  if (hour > 23) return { problem: `has the hour ${hs}` };
  if (minute > 59) return { problem: `has the minute ${mins}` };
  if (second > 59) return { problem: `has the second ${ss}` };
  let offset = 0;
  if (zone !== 'Z') {
    const p = offsetProblem(zone);
    if (p) return { problem: `has a time zone that ${p}` };
    offset = offsetMinutes(zone);
  }
  const seconds = BigInt(daysFromCivil(year, month, day)) * 86400n + BigInt(hour * 3600 + minute * 60 + second - offset * 60);
  const nanos = frac === undefined ? 0n : BigInt(frac.slice(0, 9).padEnd(9, '0'));
  return { ns: seconds * NS + nanos, zone };
}

// -1, 0 or 1 as the moment a is before, at or after the moment b.
export const compareTime = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const UNITS = [[86400n, 'day'], [3600n, 'hour'], [60n, 'minute']];

// A span of nanoseconds as a report shows it: whole seconds with commas, and the largest whole unit it makes.
export function spanText(ns) {
  const s = ns / NS;
  if (s === 0n) return 'less than a second';
  const head = `${s.toLocaleString('en-US')} ${s === 1n ? 'second' : 'seconds'}`;
  for (const [size, name] of UNITS) {
    if (s >= size) {
      const n = s / size;
      return `${head} (${s % size === 0n ? '' : 'more than '}${n.toLocaleString('en-US')} ${n === 1n ? name : `${name}s`})`;
    }
  }
  return head;
}
