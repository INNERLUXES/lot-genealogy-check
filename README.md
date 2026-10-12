# lot-genealogy-check

Lot genealogy check. A lot genealogy can be checked before it goes on a shared ledger: give it a spreadsheet of production
and custody events, as CSV or TSV, a header row and one row for each event (receive, produce, ship, assemble or scrap), and
it lists, with the line of the cell, input lots that were never received or made, or only later, outputs larger than their
inputs, lots that a party gives away more of than it holds, serial numbers made twice or on two lots, custody gaps and times
that go back along the chain, and lots that are their own input. It also traces a lot backward to the lots it is made from
or forward to the lots made from it, on request. Every finding has its id, level, message and line, and the run exits with a
code a pipeline can act on.

**The tool checks the records in a file, not whether they are true, and it is not a certification of any kind.** A clean
run means only that none of the problems of its checks were found in the cells of the file. Every check is a best practice
of this tool: there is no regulation behind any of them, and the reports say so. It reads one file only: it contacts nothing
over the network, runs nothing, needs no key, reads no clock and writes nothing, so it does not know whether a lot exists,
whether a party is who the file says, or what the rest of the records of a firm hold; the checks are a heuristic.

The holes in a genealogy tend to be the same: a component used and never received, an assembly that makes more than went into
it, a serial number made twice, a lot shipped to one party and taken in by another, a lot that is, through three others,
made from itself. They are cheap to correct in a spreadsheet and hard to take back from a record that many parties hold.
This tool reads the spreadsheet on every export and points at the cell, before anything is written.

- **One check per problem.** Twenty-six checks, each marked as a check of the file, of a row or across rows, each with what it
  looks at, what to change and why it is a check at all. Six are about the file, eight about a row and twelve across rows.
  Each message says what was found and where.
- **Mass balance with a tolerance.** The outputs of an event are added up and compared with its inputs in one unit, with exact
  arithmetic, and `--yield-tolerance` allows a share above them for an ingredient the file does not list.
- **Custody, party by party.** The events of a lot are walked in the order of time. A lot shipped from A to B must be taken in
  by B before B ships it, and a party cannot give away more of a lot than it received or made.
- **No pairwise comparison, no recursion.** Lots, serial numbers, parties and shipments are kept in maps. A loop in the
  genealogy is found with a stack of the tool's own, and a trace uses a queue, so a chain of a hundred thousand lots is read in
  good time.
- **A reader of its own.** The CSV and TSV reader keeps the line and column of every cell, follows quotes and line ends inside
  a cell, and refuses what it cannot follow instead of guessing. A row with the wrong number of cells is a finding and is
  left out of the other checks; it is never taken for a row that is fine.
- **Never a secret.** The tool needs no private key, no seed and no API key. A column named for a private key or a seed, and a
  cell shaped like a mnemonic, an extended private key, a private key in hex or a key in WIF, is an error, and the value is
  never shown in any report.
- **Times and quantities as written.** A time is read from its characters with a calendar worked out by hand, never through the
  clock or the locale of the machine. A quantity is read from its characters with BigInt, never through a floating point
  number, so lots add up exactly. The one moment the tool is given is the one of `--now`.
- Reports as text, markdown, JSON and SARIF, with an exit code for a pipeline: `0` no finding at or above the `--fail-on`
  level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 177
pass 175
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic
link or a device (a link to an events file, and `/dev/null` named as a file); they are guarded with `process.platform`, run on
Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits
are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/lot-genealogy-check.git
cd lot-genealogy-check
node bin/lot-genealogy-check.js examples/bad/events.csv --now 2101-03-10T12:00:00Z
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/lot-genealogy-check events.csv --now 2101-03-10
```

Give `--now` the day or the moment the file is checked, such as the time your pipeline starts. A day is written `YYYY-MM-DD`;
a moment is written `YYYY-MM-DDThh:mm:ss` with a time zone, `Z` or `+hh:mm`.

To trace a lot:

```
node bin/lot-genealogy-check.js examples/good/events.csv --trace-back FIN-E1
node bin/lot-genealogy-check.js examples/good/events.csv --trace-forward PCB-B1 --json
```

`examples/` holds two made-up spreadsheets. Every party, lot and product in them is made up, and every date is in the made-up
year 2101, so no date in the repository reads as a day something happened. The bad file, in `examples/bad`, holds a mistake
of every check but `file-unreadable`, which fires only on a file the reader cannot follow: no `product` column, a column
`documentref` that is a misspelt `document_ref`, and the event time twice; a mixture of rows that are not whole (a row of four
cells, an event type "Recieve", a ship with no recipient, a quantity of zero, a quantity with no unit, an input written
without a unit, a day that does not exist, a time after `--now`, and a seed phrase in a site cell); an event that makes 120 kg
from 100 kg and one whose inputs and outputs are in different units; inputs that were never received and one received only
later; a lot shipped in a larger quantity than its party made; a serial number made twice and one on two lots; a lot received
by a party it was not shipped to, one shipped on by a party that never took it in, and one received before it was shipped; a
receive nobody sent and two ships nobody took in; two lots that are made from each other; a row written twice; and one event
identifier on two events. The good file, in `examples/good`, passes at error, warning and info level: housings, circuit boards
and cable sets made by three suppliers, shipped and received, made into modules, assembled into four serialised units with a
scrapped housing on the side, shipped to a distributor and received.

## Usage

```
lot-genealogy-check <events.csv> [options]
lot-genealogy-check <events.csv> --trace-back <lot> [--trace-forward <lot>] [--max-depth <n>]
```

```
--format <name>            text, markdown, json or sarif (default: text; a trace has no sarif form)
--json                     the same as --format json
--min-severity <level>     the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>          the lowest level of a finding that fails the run: info, warning, error (default: error)
--now <date>               the moment to compare event times with, written YYYY-MM-DD, or YYYY-MM-DDThh:mm:ss with a time
                           zone, Z or +hh:mm; without it future-date does not run
--yield-tolerance <pct>    how many percent the outputs of an event may exceed its inputs (default: 0)
--explain                  show why each finding's check exists, with context (text, markdown and JSON)
--trace-back <lot>         list the lots, products, parties and serial numbers the lot is made from, and exit
--trace-forward <lot>      list the lots made from the lot and the parties and serial numbers on them, and exit
--max-depth <n>            how many steps a trace follows (default: 1000)
--list-checks              list the checks with their level and kind, and exit
--help                     show the usage
--version                  show the version
```

[docs/inputs.md](docs/inputs.md) lists every column the tool reads, with the values of `event_type`, the form of `input_lots`
and a short file. The path in the report is relative to the folder you run the command in, with forward slashes on every
system, followed by the line. "Row 5" in a message is the fifth row after the header; the line of its cell is the one after
the path.

The report of the bad example starts with what was read, the findings in one line, and the checks with the number of findings
of each; then the findings, errors first, each with what to change:

```
lot-genealogy-check: examples/bad/events.csv
file: examples/bad/events.csv (CSV, 40 lines, 3,205 bytes)
rows: 38 (5 receive, 17 produce, 7 ship, 5 assemble, 2 scrap and 1 no known kind); 1 row left out as malformed
columns: 15 in the header, 13 read, 1 not read
lots: 21 lots, 3 parties, 4 serial numbers
event times: from 2101-02-01T07:00:00Z to 2101-04-20T08:00:00Z
now: 2101-03-10T12:00:00Z, from --now
yield tolerance: 0 percent
findings: 28 (18 error, 6 warning, 4 info)

Checks (26)

  check                    level    kind         findings
  file-unreadable          error    file         0
  column-missing           error    file         1
  column-unknown           warning  file         1
  column-duplicate         error    file         1
  row-malformed            error    file         1
  secret-in-file           error    file         1
  event-type-unknown       error    row          1
  event-incomplete         error    row          1
  quantity-not-positive    error    row          1
  unit-missing             error    row          1
  input-lots-unreadable    error    row          1
  date-invalid             error    row          1
  future-date              error    row          1
  mass-balance-exceeded    warning  row          1
  units-not-comparable     info     across rows  1
  input-lot-not-available  error    across rows  2
  lot-overdrawn            error    across rows  1
  serial-born-twice        error    across rows  1
  serial-on-two-lots       error    across rows  1
  custody-gap              warning  across rows  2
  custody-time-reversed    error    across rows  1
  receive-without-ship     info     across rows  1
  ship-without-receive     info     across rows  2
  genealogy-loop           error    across rows  1
  duplicate-row            warning  across rows  1
  event-id-repeated        warning  across rows  1

```

With `--explain` a finding also says why its check exists, and where the idea meets a vocabulary that other work uses, as
context only:

```
  WARNING  custody-gap              examples/bad/events.csv:21
           Row 20 (receive) is by Yard Logistics, but row 19 (ship) sends the lot CG-1 to Zenith Foods.
           fix: Add the missing receive or ship row, or correct the party in the row named.
           why: Following a lot from party to party is a best practice of this tool; no regulation sets it; a lot that changes hands without a record cannot be traced through the gap, and a file that holds only some of the rows can show this by mistake

```

After the findings comes the table of event types, with the rows and the lots of each:

```
Event types (6)

  event type     rows  lots
  receive        5     5
  produce        17    17
  ship           7     6
  assemble       5     4
  scrap          2     1
  no known kind  1     0

```

The end of the report holds the notes, if any, the notice and the result:

```
This report checks the records in the file, not whether they are true, and it is not a certification of any kind.

RESULT: FAIL - 18 findings at or above error (18 error, 6 warning, 4 info)

```

The good example passes:

```

Event types (5)

  event type  rows  lots
  receive     8     5
  produce     4     4
  ship        8     5
  assemble    4     1
  scrap       1     1

This report checks the records in the file, not whether they are true, and it is not a certification of any kind.

RESULT: PASS - no finding at or above error

```

A trace lists each lot once, nearest first, with its depth, product, the parties on its rows, its serial numbers and the event
that links it to the lot before it. This is the start of the trace back of the finished lot of the good example, which
reaches the components, the raw lots and four parties:

```

trace back from the lot FIN-E1: 4 lots upstream, 6 parties, 4 serial numbers
depth limit: 1,000, depth reached: 2
parties: Eastside Assembly Plant, Fairview Distribution, Alder Plastics Ltd, Delta Module Works, Birch Circuits Co, Cedar Cable Works
serial numbers: SN-0001, SN-0002, SN-0003, SN-0004

  depth  lot     product         parties                                         serials                             reached through
  0      FIN-E1  Garden sensor   Eastside Assembly Plant, Fairview Distribution  SN-0001, SN-0002, SN-0003, SN-0004  the lot asked for
  1      HSG-A1  Sensor housing  Alder Plastics Ltd, Eastside Assembly Plant     -                                   E-013 (used to make FIN-E1)
  1      MOD-D1  Sensor module   Delta Module Works, Eastside Assembly Plant     -                                   E-013 (used to make FIN-E1)
```

The output of both examples in all formats, the list of checks, and a trace back and forward in text and JSON are saved in
`examples/output`.

## How the file is read

1. The path is resolved against the folder you run the command in. A link, a folder, a device or a file over 16 MB is
   refused, and so is a file that is not UTF-8 (or UTF-16 with a byte order mark) or holds a null byte, with exit code `2`
   and no report.
2. The file is read as CSV, or as TSV when the first line has tabs, whatever its name. The reader keeps the line and column
   of every cell, follows double quotes (a quote inside a cell is written as two) and a line end inside a quoted cell, and
   refuses a quote that is never closed, text after a closing quote, a cell over 20,000 characters and a file of more than
   3,000,000 cells. A first line separated by semicolons is refused with a message, not guessed at.
3. Every column name and every cell is looked at for a private key or a seed. One that is found is an error at its line, and
   its value is left out of everything that follows and never shown.
4. The header is read: a column is found by its name written in any case with any separators, so "Event Time" and
   `event_time` are one column. A column the tool does not read is a `column-unknown` finding, a name written twice is
   `column-duplicate`, and a column the rows need that is not there at all is reported once as `column-missing`.
5. Each row is checked on its own: its kind of event, its cells, its time, its quantity and its input lots. A cell that holds
   only `n/a`, `none`, `null`, `tbd`, `unknown`, a dash or a question mark is read as empty. Then the rows are checked
   together: input lots, the quantities a party holds of a lot, serial numbers, custody and the genealogy.

[docs/method.md](docs/method.md) says what each check reads, and [docs/inputs.md](docs/inputs.md) lists the columns.

## What it checks

| Check | Level | Kind | What it reports |
| --- | --- | --- | --- |
| `file-unreadable` | error | file | the file is not a table the reader can follow (a quote never closed, text after a closing quote, a cell too long, semicolons for commas), has no event_type column or has a header and no rows, so nothing in it was checked |
| `column-missing` | error | file | a column that the rows of a kind of event need is not in the header at all; it is reported once, at the header, and not for each row |
| `column-unknown` | warning | file | a column the tool does not read, often a misspelt name; nothing under it was checked |
| `column-duplicate` | error | file | two columns of the header have the same name once case and separators are ignored; only the first is read |
| `row-malformed` | error | file | a row with more or fewer cells than the header, which usually means a comma that is not in quotes; the row was left out of every other check |
| `secret-in-file` | error | file | the file holds a private key, a seed or a mnemonic, under a column named for one or as a cell shaped like one; the tool never reads it and never shows it |
| `event-type-unknown` | error | row | an event_type that is empty or is none of receive, produce, ship, assemble and scrap; the row was left out of the other checks |
| `event-incomplete` | error | row | a cell that the kind of event needs is empty or a placeholder such as n/a: event_id, event_time, party, lot and quantity for every kind, the product for receive, produce and assemble, to_party for ship, input_lots for assemble; also a ship row whose from_party is not its party |
| `quantity-not-positive` | error | row | a quantity that is not a plain positive number: zero, negative, with a thousands separator, with an exponent, text, or with more than 40 digits |
| `unit-missing` | error | row | a quantity with no unit in the unit column |
| `input-lots-unreadable` | error | row | an entry of input_lots that is not written lot:quantity:unit, with a quantity that is not a plain number above zero; the event is not compared with its inputs |
| `date-invalid` | error | row | an event_time that is not a date, names a day that does not exist, has a time with no time zone, or is written as a date of the United States |
| `future-date` | error | row | an event_time later than the moment given with --now (a day alone is allowed one day more, for the time zones of the world); without --now the check does not run |
| `mass-balance-exceeded` | warning | row | the outputs of a produce or assemble event add up to more than its inputs in the same unit, above the --yield-tolerance percent; the rows of one event_id, kind, party and time are one event |
| `units-not-comparable` | info | across rows | a note: the inputs and outputs of an event, or the quantities of one lot, are in different units, so the tool cannot compare them |
| `input-lot-not-available` | error | across rows | an input lot of a produce or assemble row that no receive or produce row of the file holds, or that is received or made only after it is used |
| `lot-overdrawn` | error | across rows | the quantities of a lot that a party ships, scraps or uses add up to more than that party received or made of it, in the same unit, with exact sums; a lot that no row receives or makes and that is shipped or scrapped counts as held in a quantity of zero |
| `serial-born-twice` | error | across rows | the same serial number in two produce or assemble rows; a serial number names one unit and is made once |
| `serial-on-two-lots` | error | across rows | the same serial number on two different lots or two different products |
| `custody-gap` | warning | across rows | a lot is shipped from A to B and the next event on it is by C, not B; or B ships, scraps or uses it without a receive; or a receive names another sender than the ship; or a party acts on a lot that another party last held |
| `custody-time-reversed` | error | across rows | a lot is received before it is shipped, or shipped or scrapped before the first row that receives or makes it |
| `receive-without-ship` | info | across rows | a note: a receive row for a lot that no ship row of the file sends to that party; a file of one party holds the receipts of lots shipped by others |
| `ship-without-receive` | info | across rows | a note: a ship row for a lot that no receive row of the file takes in at the party it is sent to; the recipient keeps its own records |
| `genealogy-loop` | error | across rows | a lot that is, directly or through other lots, one of its own inputs |
| `duplicate-row` | warning | across rows | a row whose cells are all the same as an earlier row, which counts one event twice; it is left out of the other checks |
| `event-id-repeated` | warning | across rows | the same event_id on two rows that are not one event; rows of one produce or assemble event with the same kind, party and time may share an event_id |

A check of the file is about the file itself, a check of a row is found from one row, and a check across rows puts rows side
by side. Each check is a best practice of this tool, says so in its reason (`--explain`), and has a level: errors are
impossible or unreadable records, warnings are things a file that holds only some of the rows can show by mistake, and notes
are things one party's file always shows. [docs/method.md](docs/method.md) describes every check with what it cannot see.

## What is not checked

- Whether the records are true. A clean report is not a statement that the lot is where the file says, or that the quantity
  was weighed.
- The rows of other parties. A file of one party holds its receipts and its shipments, not the other side of each, which is
  why a receive with no ship is a note and a custody gap is a warning.
- Conversions between units. Quantities are compared in one unit at a time, and an event or a lot in two units gets a note.
- Whether a party name, a lot code or a document number is real, or whether the document it names exists. A party is the
  same party if its name is the same without regard to case.
- Whether a file meets a standard or a law. The tool reads no EPCIS and checks no passport.

## Formats

`--format text` (the default) is for a terminal. `--format markdown` is for a job summary or a pull request and escapes what
markdown gives a meaning to. `--json` (or `--format json`) gives one object with the file, the events read, the totals, every
check with its number of findings, every finding with its id, level, kind, line, column, message, fix and subject, the notes and
the result; `--explain` adds the reason and the context of each finding. `--format sarif` gives SARIF 2.1.0 for code scanning,
with one result for each finding and its line and column. `--list-checks` lists the checks in text, markdown or JSON. A trace
comes as text, markdown or JSON.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no finding at or above the `--fail-on` level (default `error`), or a trace was made |
| `1` | a finding at or above the `--fail-on` level |
| `2` | a usage error, or an input the tool cannot read at all (no result), or a trace of a lot that is not in the file |

A finding below `--min-severity` is not shown but still counts for the result.

## Limits

The file is read whole, up to 16 MB, 250,000 rows, 200 columns, 3,000,000 cells and 20,000 characters in a cell; more rows than
the limit are left out with a note. At most 1,000 findings of one check are listed, and the rest are counted and noted. A trace
lists at most 2,500 lots and follows 1,000 steps unless `--max-depth` says more. The checks across rows use maps, and no walk
over the lots calls itself, so one lot in a hundred thousand rows or a chain of a hundred thousand lots stays linear and
shallow. [docs/limits.md](docs/limits.md) says what the tool cannot see.

## Architecture

| File | What it does |
| --- | --- |
| `src/files.js` | the bounded reading of the file: a regular file, no link, UTF-8 or UTF-16 |
| `src/csv.js` | the CSV and TSV reader with the line and column of every cell |
| `src/secrets.js` | the search for private keys and seeds in column names and cells |
| `src/fields.js` | the columns and the five kinds of event |
| `src/dates.js`, `src/time.js` | times read from their characters, with a calendar worked out by hand |
| `src/decimal.js` | exact decimal numbers with BigInt |
| `src/events.js` | the header, the rows and the checks of a row |
| `src/across.js` | the checks across rows: input lots, quantities, serial numbers, custody and the loop search |
| `src/graph.js` | the walks over the lots with a stack and a queue: loops and the reach of a trace |
| `src/trace.js` | the trace of a lot, backward or forward |
| `src/rules.js`, `src/data.js`, `src/collect.js` | the checks with their levels, fixes and reasons, the notice, and the findings |
| `src/check.js`, `src/report.js`, `src/cli.js` | a run, the formats and the command line |

## Where the ideas come from

No regulation sets any of these checks, and the tool quotes none. [docs/context.md](docs/context.md) says where the ideas meet
the vocabulary of GS1 EPCIS (an event that uses input lots and makes output lots) and of digital product passports (data at
the level of a batch or of an item), as context only, without a claim that a file that passes conforms to either.

## Background

This tool is one of the small open source checks that INNERLUXES publishes next to its work on traceability software. If you
are planning a system that records the provenance of lots and units, on a shared ledger or in a database, the page
[Blockchain Product Traceability and Provenance Solutions](https://innerluxes.dev/blockchain/traceability-provenance)
describes that work.

## License

MIT. See [LICENSE](LICENSE).
