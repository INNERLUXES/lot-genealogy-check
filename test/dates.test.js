import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATE_FORM, daysFromCivil, isFuture, readDate } from '../src/index.js';

const day = (y, m, d) => daysFromCivil(y, m, d);
// Dates of other years than the made-up one are built from their parts, so that no file holds a full date outside 2101.
const iso = (y, m, d) => [y, m, d].join('-');

test('readDate: a day alone names the days from the Unix epoch, across leap years and centuries', () => {
  assert.deepEqual(readDate('2101-03-04'), { day: day(2101, 3, 4), ns: null, hasTime: false });
  assert.equal(readDate('2101-03-05').day - readDate('2101-03-04').day, 1);
  assert.equal(readDate('2101-03-01').day - readDate('2101-02-28').day, 1, 'the year 2101 is not a leap year');
  assert.equal(readDate(iso('2104', '03', '01')).day - readDate(iso('2104', '02', '28')).day, 2, 'the year 2104 is');
  assert.equal(readDate(iso('2100', '03', '01')).day - readDate(iso('2100', '02', '28')).day, 1, 'a century year that 400 does not divide is not');
  assert.equal(readDate(iso('2400', '03', '01')).day - readDate(iso('2400', '02', '28')).day, 2, 'one that 400 divides is');
  assert.equal(readDate(' 2101-03-04 ').day, day(2101, 3, 4), 'white space around a date is dropped');
});

test('readDate: a day with a time and a zone names a nanosecond, in whatever zone it is written', () => {
  const z = readDate('2101-03-04T12:00:00Z');
  const east = readDate('2101-03-04T13:00:00+01:00');
  assert.equal(z.ns, east.ns);
  assert.equal(z.day, day(2101, 3, 4));
  assert.equal(z.hasTime, true);
  assert.equal(readDate('2101-03-04T23:30:00-02:00').day, day(2101, 3, 5), 'the day is the day in UTC');
  assert.ok(readDate('2101-03-04T12:00:00.5Z').ns > z.ns);
});

test('readDate: what is not a date says why, and a date of the United States is not guessed at', () => {
  const why = (text) => readDate(text).problem;
  assert.match(why('2101-02-29'), /^has the day 29, but month 02 of 2101 has 28 days$/);
  assert.match(why('2101-04-31'), /has the day 31, but month 04 of 2101 has 30 days/);
  assert.match(why('2101-13-01'), /^has the month 13$/);
  assert.match(why('2101-00-10'), /^has the month 00$/);
  assert.match(why('2101-03-00'), /^has the day 00/);
  assert.match(why('03/04/2101'), /written like a date of the United States; write YYYY-MM-DD/);
  assert.match(why('3/4/2101'), /the tool does not guess whether the first number is the month or the day/);
  assert.match(why('2101-03-04T12:00:00'), /has no time zone/);
  assert.match(why('2101-03-04T25:00:00Z'), /has the hour 25/);
  assert.match(why('March 4'), new RegExp(`^is not a date written ${DATE_FORM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  assert.match(why('2101-3-4'), /^is not a date written/);
  assert.match(why('20210304'), /^is not a date written/);
  assert.match(why(''), /^is not a date written/);
  assert.equal(readDate('2101-03-04').problem, undefined);
});

test('isFuture: a time is in the future when it is after now; a day alone is allowed one day more for the time zones of the world', () => {
  const now = readDate('2101-03-10T12:00:00Z');
  assert.equal(isFuture(readDate('2101-03-10T12:00:00Z'), now), false, 'at the moment is not the future');
  assert.equal(isFuture(readDate('2101-03-10T12:00:01Z'), now), true, 'one second later is');
  assert.equal(isFuture(readDate('2101-03-10T13:00:00+01:00'), now), false, 'the same moment in another zone');
  assert.equal(isFuture(readDate('2101-03-10'), now), false);
  assert.equal(isFuture(readDate('2101-03-11'), now), false, 'one day after is allowed');
  assert.equal(isFuture(readDate('2101-03-12'), now), true, 'two days after is not');
  const dayNow = readDate('2101-03-10');
  assert.equal(isFuture(readDate('2101-03-11'), dayNow), false);
  assert.equal(isFuture(readDate('2101-03-12'), dayNow), true);
  assert.equal(isFuture(readDate('2101-03-12T00:00:00Z'), dayNow), true, 'a day alone as now compares days');
  assert.equal(isFuture(readDate('2101-03-11T23:59:59Z'), dayNow), false);
});
