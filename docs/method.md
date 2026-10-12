# Method

This document says how the tool reads a spreadsheet of production and custody events and what each check looks at. The
tool checks the records in a file, not whether they are true, and it is not a certification of any kind. A clean run means
only that none of the problems below were found in the file.

Every check is a best practice of this tool. No regulation sets any of them, and the tool does not claim that a lot, a
product or a party is covered by one. Where an idea meets the vocabulary of GS1 EPCIS or of digital product passports,
[docs/context.md](context.md) says so as context.

## Why a genealogy check

A chain of lots is only as good as its weakest row. Before records go on a shared ledger, into a database or to a customer,
the same few holes turn up: a component that was used but never received, an assembly that makes more than went into it, a
serial number that was made twice, a lot that was shipped to one party and taken in by another, a lot that is, through
three others, made from itself. Once such a record is written to a ledger it is hard to take back. Most of the holes can be
seen in the file, so the tool reads the file on every export and points at the cell.

## Reading the file

1. The path is resolved against the folder the command runs in. A link, a folder, a device or a pipe is refused; a file
   over 16 MB is refused before it is read; a file with a null byte, or bytes that are not UTF-8 (or UTF-16 with a byte
   order mark), is refused with exit code `2` and no report.
2. The file goes to the reader of tables (`src/csv.js`), which keeps the line and column of every cell, follows quotes and
   line ends inside quoted cells, and picks a comma or a tab from the first line. A quote that is never closed, text after a
   closing quote, a quote inside a cell that does not start with one, a cell or a row over the limits, or semicolons between
   the cells is `file-unreadable`; so is a file with no text, no `event_type` column or a header and no rows.
3. Every column name and every cell of 47 characters or more is looked at for a key or a seed (`src/secrets.js`). A column
   named for a private key, a seed or a mnemonic, and a cell shaped like a mnemonic, an extended private key, a private key
   in hex or a key in WIF, is `secret-in-file`. The cell is marked and left out of everything that follows, and no report
   shows it. A cell of 64 hex digits in the `event_id`, `lot`, `serial` or `document_ref` column is read as the identifier
   it is meant to be, because a lot or a serial number may be a hash.
4. The header is read: columns are found by name, an unknown column is `column-unknown`, a name written twice is
   `column-duplicate`, and a column the rows need that the header lacks is reported once, at the header, as
   `column-missing`.
5. Each row is read on its own: a row written twice is `duplicate-row` and goes no further; a row of the wrong width is
   `row-malformed`; its kind of event, its cells, its time, its quantity and its input lots are read, with the findings of
   the row. Then the rows are checked together.

## The order of events

The checks across rows put the events of one lot in the order of their times, and break ties by the order of the file. A
file does not have to be sorted. A time with a time zone is compared to the nanosecond; a day alone is compared with a time
by the day, so an event on the same day as another is never "before" it. A row whose time cannot be read is left out of every
check that needs an order and keeps its own finding.

## Checks of the file

- `file-unreadable`: the file is not a table the reader can follow, has no `event_type` column or has no rows. Nothing was
  checked, and the default run fails.
- `column-missing`: the rows of a kind of event need a column the header does not have. Reported once, with the number of
  rows it affects.
- `column-unknown`: a column the tool does not read, with the nearest column within two edits. A misspelt column would
  otherwise hide a cell.
- `column-duplicate`: two columns with one name once case and separators are ignored. Only the first is read.
- `row-malformed`: a row with more or fewer cells than the header. It is left out of the other checks, because every cell
  after the extra one would be read as another column.
- `secret-in-file`: a column named for, or a cell shaped like, a seed or a key. See [limits](limits.md) for the shapes.

## Checks of a row

- `event-type-unknown`: an `event_type` that is empty or none of the five; the nearest is suggested.
- `event-incomplete`: a cell the kind of event needs is empty or a placeholder: `event_id`, `event_time`, `party`, `lot` and
  `quantity` for every kind, `product` for `receive`, `produce` and `assemble`, `to_party` for `ship`, `input_lots` for
  `assemble`. Also a `ship` row whose `from_party` is given and is not its `party`.
- `quantity-not-positive`: a quantity that is zero, negative, has a sign, a separator, an exponent, text or more than 40
  digits.
- `unit-missing`: a quantity with no unit.
- `input-lots-unreadable`: an entry of `input_lots` not written `lot:quantity:unit`, or with a quantity that is not a plain
  number above zero. The event is not compared with its inputs.
- `date-invalid`: an `event_time` that is not a date, names a day that does not exist (a 30th of February), has a time with
  no zone, or is a date of the United States.
- `future-date`: an `event_time` after `--now`; a day alone is allowed one day more. Without `--now` the check does not run
  and the report says so.
- `mass-balance-exceeded`: the outputs of a `produce` or `assemble` event add up to more than its inputs, when all of them
  are in one unit. The rows of one `event_id`, kind, `party` and `event_time` are one event; its inputs are the
  `input_lots` of all its rows added up and its outputs the quantities of all its rows. `--yield-tolerance` allows a share
  above the inputs, in percent, with exact arithmetic. It is a warning, because a process may add an ingredient that the file
  does not list, such as water. An event with no inputs listed is not compared.

## Checks across rows

- `units-not-comparable`: a note. The inputs and outputs of an event are in different units, one party holds a lot in two
  units, or a lot is taken out in a unit it was never put in. Sums are made in one unit at a time, and the tool does not
  convert.
- `input-lot-not-available`: an input lot of a `produce` or `assemble` row that no `receive` or `produce` row holds, or that
  is held only later: the first row that receives or makes it is dated after the use.
- `lot-overdrawn`: the quantities of a lot that a party ships, scraps or uses add up to more than that party received or
  made of it, in one unit, with exact sums. The sums are kept for each party, because a ship and its receive are one
  movement of the same material and a receive must not make the shipper richer. The first row that crosses the line is
  reported, once for each party and unit. A lot that no row receives or makes, and that is shipped or scrapped, counts as
  held in a quantity of zero; a lot that is only used is left to `input-lot-not-available`, and a party that holds none of
  a lot that another party holds is left to `custody-gap`.
- `serial-born-twice`: one `serial` in two `produce` or `assemble` rows. The tool treats a serial number as unique in the
  file; if your serial numbers repeat from one product to the next, put the product in front of them.
- `serial-on-two-lots`: one `serial` on two different lots, or two different products when both are given. Reported once for
  each serial.
- `custody-gap`: the events of a lot are walked in time order. A `ship` puts the lot in transit to its `to_party`; the
  recipient's `receive` ends it. It is a gap when the next event on a lot is a receive by a party it was not shipped to, or by
  the right party but naming another sender in `from_party`; when the recipient ships, scraps or uses the lot with no
  receive; or when a party ships, scraps or uses a lot that another party last held. A lot shipped in parts to two
  recipients is fine. The first event the file shows on a lot has no history to disagree with. It is a warning, because a
  file that holds only some of the rows can show a gap by mistake.
- `custody-time-reversed`: a `receive` dated before the `ship` that sends it (the two are matched by lot and recipient, in
  the order of the file), or a `ship` or `scrap` dated before the first row that receives or makes the lot.
- `receive-without-ship`: a note. A `receive` that no `ship` of the file sends to that party. A file of one party holds the
  receipts of lots shipped by others, so this is not an error.
- `ship-without-receive`: a note. A `ship` that no `receive` of the file takes in. The recipient keeps its own records.
- `genealogy-loop`: a lot that is, directly or through other lots, one of its own inputs. The graph is built with maps from
  each lot to its inputs and walked with an explicit stack, so a loop of a hundred thousand lots is found without recursion;
  each edge that closes a loop is a finding that names the first lots of it and counts the rest.
- `duplicate-row`: a row with all its cells equal to an earlier row. It is left out of the other checks, so its quantities are
  not counted twice.
- `event-id-repeated`: one `event_id` on two rows that are not one event.

## The trace

The trace uses the same events as the checks, but no check is run and no finding is shown. `--trace-back` follows the
input lots of each lot to the lots they are made from, `--trace-forward` follows them to the lots made from each lot, with a
queue and a depth limit; a lot reached twice is listed once, so a loop in the file ends the walk. For each lot the report
gives its depth, the product of its latest row, the parties on its rows (the `party` and the `to_party`), its serial numbers
and the event that links it to the lot before it. At most 2,500 lots are listed; the number reached is always given.

## What a finding looks like

Every finding has its check, its level (`error`, `warning` or `info`), its kind (of the file, of a row or across rows), the
file, line and column of the cell, a message that says what was found, what to change and, with `--explain`, why the check
exists. At most 1,000 findings of one check are listed; the rest are counted and noted.
