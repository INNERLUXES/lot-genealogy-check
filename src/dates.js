// Dates as the files write them: a day, YYYY-MM-DD, or a day with a time and a time zone, YYYY-MM-DDThh:mm:ss with an
// optional fraction of a second and Z or +hh:mm. They are read from their characters with the calendar of src/time.js,
// which is worked out by hand, so the tool reads no clock, no time zone of the machine and no locale. A day is counted as
// days from the start of the Unix epoch.

import { readTime } from './time.js';

export const DATE_FORM = 'YYYY-MM-DD, or YYYY-MM-DDThh:mm:ss with a time zone, Z or +hh:mm';

const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const US = /^[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}$/;
const DAY_NS = 86400n * 1000000000n;

// Reads a date: { day, ns } with day the days from the epoch and ns the nanosecond as a BigInt or null for a day alone,
// or { problem } that says what is wrong.
export function readDate(raw) {
  const text = raw.trim();
  if (DAY.test(text)) {
    const t = readTime(`${text}T00:00:00Z`);
    if (t.problem) return { problem: t.problem };
    return { day: Number(t.ns / DAY_NS), ns: null, hasTime: false };
  }
  if (US.test(text)) return { problem: `is written like a date of the United States; write ${DATE_FORM}, because the tool does not guess whether the first number is the month or the day` };
  const t = readTime(text);
  if (t.problem && /^is not a date and time/.test(t.problem)) return { problem: `is not a date written ${DATE_FORM}` };
  if (t.problem) return { problem: t.problem };
  return { day: Number(t.ns / DAY_NS), ns: t.ns, hasTime: true };
}

// Whether a date is in the future of the moment now (a read date). A day alone is in the future when it is more than one
// day after the day of now, because the time zones of the world span more than a day; a date with a time is in the
// future when it is after now.
export function isFuture(date, now) {
  if (date.ns !== null && now.ns !== null) return date.ns > now.ns;
  return date.day > now.day + 1;
}
