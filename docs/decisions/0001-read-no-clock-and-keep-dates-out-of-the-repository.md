# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

Every row of an events spreadsheet carries a time: when the lot was received, made, shipped, assembled or scrapped. The tool
has to read these times, put the events of a lot in order, compare them with each other and, where it is asked to, with the
day the file is checked. It does not need the clock of the machine to do so. The mistakes in the times are mistakes in the
file (a day that does not exist, a date written so that the month and the day swap, a lot received before it was shipped,
a lot used before it was made). The one check that needs a moment from outside, a time later than the day it is checked, can
be given that moment.

Reading the clock would make the same file give a different report on a different day. Reading the time zone or the locale
of the machine through the date functions of the platform would make the same text name another day on another machine, and
the order of month and day depends on the locale.

## Decision

1. The tool reads no clock, no time zone of the machine and no locale. It never prints the current time. The same file and
   the same options give the same output on every machine and on every day.
2. Times are read from their characters (`src/dates.js` on the calendar of `src/time.js`) into the day, and where a time and
   a zone are given the nanosecond, they name, with a calendar worked out by hand: the proleptic Gregorian calendar, counted
   from the start of the Unix epoch, with BigInt. The date functions of the platform are not used, and a test fails if src
   names them. A time is written `YYYY-MM-DD` or `YYYY-MM-DDThh:mm:ss` with a time zone; a date written the American way is
   refused, because it is ambiguous, and a time with no zone is refused, because it names no moment.
3. The one moment from outside is the one of `--now`, written by the person or the pipeline that runs the tool. Without it,
   `future-date` does not run, and the report says so in its head and in a note. A day alone is allowed one day more than the
   day of `--now`, because the time zones of the world span more than a day.
4. A time is shown as the file writes it, never in another zone or format.
5. No document, test or source file of this repository holds a date or a number that reads like a year in its prose: not the
   licence, not the changelog, not the documents, not the comments of the code. `npm run check` and a test fail on any word
   of four digits that starts with 19 or 20. The examples, the tests and the documents that show an event need dates, and
   every one of them is a made-up date in the year 2101, which the check passes over and no one reads as a day something
   happened; a test checks that every full date of the repository is in that year.
6. A version, a count, a number of seconds or the number of a standard is not a year and is not caught: 1.0.0, Node 22,
   SARIF 2.1.0 and NIST SP 800-218 hold no year. A test of test/repo.test.js runs the pattern over such values and checks
   that none of them is caught, and that a year in the same place still is.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change.
- A file can be checked again later with the `--now` of the first check and gives the same report.
- A pipeline that wants `future-date` passes its own time; the tool never decides what "now" is.
