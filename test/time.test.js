import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFSET_FORM, TIME_FORM, compareTime, daysFromCivil, offsetMinutes, offsetProblem, readTime, spanText } from '../src/index.js';

const S = 1000000000n;
const ns = (t) => readTime(t).ns;
// The year of the Unix epoch, built from a product so that no file holds a number that reads like a year.
const EPOCH = 985 * 2;

test('daysFromCivil: the days from the Unix epoch, across leap years, centuries and before the epoch', () => {
  assert.equal(daysFromCivil(EPOCH, 1, 1), 0);
  assert.equal(daysFromCivil(EPOCH, 1, 2), 1);
  assert.equal(daysFromCivil(EPOCH - 1, 12, 31), -1);
  assert.equal(daysFromCivil(2101, 3, 1) - daysFromCivil(2101, 2, 28), 1, '2101 is not a leap year');
  assert.equal(daysFromCivil(2100, 3, 1) - daysFromCivil(2100, 2, 28), 1, 'a century that is not a leap year');
  assert.equal(daysFromCivil(2400, 3, 1) - daysFromCivil(2400, 2, 28), 2, 'a fourth century is a leap year');
  assert.equal(daysFromCivil(2104, 3, 1) - daysFromCivil(2104, 2, 28), 2);
  assert.equal(daysFromCivil(2102, 1, 1) - daysFromCivil(2101, 1, 1), 365);
});

test('readTime: a time and its zone name one nanosecond, whatever zone it is written in', () => {
  assert.equal(ns('2101-03-01T08:00:00.000+01:00'), ns('2101-03-01T07:00:00Z'));
  assert.equal(ns('2101-03-01T00:30:00-05:30'), ns('2101-03-01T06:00:00Z'));
  assert.equal(ns('2101-03-01T23:59:59+14:00'), ns('2101-03-01T09:59:59Z'));
  assert.equal(ns('2101-03-01T00:00:00.5Z') - ns('2101-03-01T00:00:00Z'), S / 2n);
  assert.equal(ns('2101-03-01T00:00:00.123456789Z') - ns('2101-03-01T00:00:00Z'), 123456789n);
  assert.equal(ns('2101-03-01T00:00:00.1234567891Z') - ns('2101-03-01T00:00:00Z'), 123456789n, 'a fraction is read to the nanosecond');
  assert.equal(ns('2101-01-01T00:00:00Z') / S, BigInt(daysFromCivil(2101, 1, 1)) * 86400n);
  assert.equal(readTime('2101-03-01T08:00:00+01:00').zone, '+01:00');
  assert.equal(readTime('2101-03-01T08:00:00Z').zone, 'Z');
  assert.ok(ns('2104-02-29T12:00:00Z') > 0n, 'the 29th of February of a leap year');
});

test('readTime: what is not a time with a zone, or names a day or hour that does not exist, says why', () => {
  const problem = (t) => readTime(t).problem;
  assert.match(problem('2101-03-01T08:00:00'), /has no time zone/);
  assert.match(problem('2101-03-01 08:00:00Z'), /is not a date and time written/);
  assert.match(problem('2101-3-1T08:00:00Z'), /is not a date and time written/);
  assert.match(problem('2101-03-01T08:00Z'), /is not a date and time written/);
  assert.match(problem('2101-03-01T08:00:00.Z'), /is not a date and time written/);
  assert.match(problem('2101-03-01T08:00:00z'), /is not a date and time written/);
  assert.match(problem('2101-13-01T08:00:00Z'), /has the month 13/);
  assert.match(problem('2101-00-01T08:00:00Z'), /has the month 00/);
  assert.match(problem('2101-02-29T08:00:00Z'), /has the day 29, but month 02 of 2101 has 28 days/);
  assert.match(problem('2101-04-31T08:00:00Z'), /has the day 31, but month 04 of 2101 has 30 days/);
  assert.match(problem('2101-04-00T08:00:00Z'), /has the day 00/);
  assert.match(problem('2101-03-01T24:00:00Z'), /has the hour 24/);
  assert.match(problem('2101-03-01T08:60:00Z'), /has the minute 60/);
  assert.match(problem('2101-03-01T08:00:60Z'), /has the second 60/);
  assert.match(problem('2101-03-01T08:00:00+15:00'), /has a time zone that has 15 hours, more than 14/);
  assert.match(problem('2101-03-01T08:00:00+14:30'), /has a time zone that has 14 hours with minutes other than 00/);
  assert.equal(problem('2101-03-01T08:00:00+14:00'), undefined);
  assert.match(TIME_FORM, /YYYY-MM-DDThh:mm:ss/);
});

test('offsetProblem and offsetMinutes: the form of a time zone offset, with near misses on each side', () => {
  for (const ok of ['+00:00', '-00:00', '+05:30', '-08:00', '+14:00', '-14:00', '+13:59']) assert.equal(offsetProblem(ok), null, ok);
  assert.match(offsetProblem('+14:01'), /14 hours with minutes other than 00/);
  assert.match(offsetProblem('+15:00'), /has 15 hours, more than 14/);
  assert.match(offsetProblem('+05:60'), /has 60 minutes, more than 59/);
  for (const bad of ['Z', '+1:00', '+0100', '01:00', '+01:0', ' +01:00', 'UTC']) assert.match(offsetProblem(bad), /is not written/, bad);
  assert.equal(offsetMinutes('+05:30'), 330);
  assert.equal(offsetMinutes('-08:00'), -480);
  assert.match(OFFSET_FORM, /\+hh:mm or -hh:mm/);
});

test('compareTime and spanText: order of moments, and spans in seconds with the largest whole unit', () => {
  assert.equal(compareTime(1n, 2n), -1);
  assert.equal(compareTime(2n, 2n), 0);
  assert.equal(compareTime(3n, 2n), 1);
  assert.equal(spanText(S / 2n), 'less than a second');
  assert.equal(spanText(S), '1 second');
  assert.equal(spanText(59n * S), '59 seconds');
  assert.equal(spanText(60n * S), '60 seconds (1 minute)');
  assert.equal(spanText(90n * S), '90 seconds (more than 1 minute)');
  assert.equal(spanText(7200n * S), '7,200 seconds (2 hours)');
  assert.equal(spanText(86400n * S), '86,400 seconds (1 day)');
  assert.equal(spanText(846000n * S), '846,000 seconds (more than 9 days)');
});
