# Changes

## 1.0.0

First release.

- Reads a spreadsheet of production and custody events (CSV or TSV, a header row and one row for each event: `receive`,
  `produce`, `ship`, `assemble` or `scrap`) and lists with its line and column what does not hold together before the
  records go on a shared ledger. The tool checks the records in a file, not whether they are true, and it is not a
  certification of any kind. It reads the file, contacts nothing over the network, fetches nothing, opens no link, runs
  nothing, needs no key, follows no symbolic link, reads no clock and writes nothing to disk.
- Fourteen columns that the tool names itself (no regulation or standard fixes them), documented in docs/inputs.md: the
  event, its kind and time, the party, the site, the sender and the recipient, the lot, the serial number, the product, the
  quantity and unit, the input lots written `lot:quantity:unit`, and a document reference. A column is found by its name with
  case and separators ignored.
- A strict reader of CSV and TSV of its own, with no dependency and no recursion, with the line and column of every cell,
  quotes and line ends inside cells, a comma or a tab chosen from the first line, and limits of rows, columns, cells and cell
  length; the bounded reading of a file, the decimal reader and the calendar of the sibling tools. Quantities are read from the
  characters of the file with BigInt and added exactly, and times are read from their characters with a calendar worked out by
  hand.
- A search for keys and seeds in every column name and every long cell, with the shapes of the sibling tools: each one found is
  an error whose value is left out of every check and never shown. A cell of 64 hex digits in the `event_id`, `lot`, `serial`
  or `document_ref` column is read as an identifier.
- Twenty-six checks in three levels, each marked as a check of the file, of a row or across rows, each a best practice of the
  tool and saying so: six about the file (`file-unreadable`, `column-missing`, `column-unknown`, `column-duplicate`,
  `row-malformed`, `secret-in-file`); eight of a row (`event-type-unknown`, `event-incomplete`, `quantity-not-positive`,
  `unit-missing`, `input-lots-unreadable`, `date-invalid`, `future-date` and `mass-balance-exceeded` with
  `--yield-tolerance`); and twelve across rows (`units-not-comparable` as a note, `input-lot-not-available`, `lot-overdrawn`,
  `serial-born-twice`, `serial-on-two-lots`, `custody-gap`, `custody-time-reversed`, `receive-without-ship` and
  `ship-without-receive` as notes, `genealogy-loop`, `duplicate-row`, `event-id-repeated`).
- A trace of a lot: `--trace-back` lists the lots a lot is made from and `--trace-forward` the lots made from it, with the
  products, parties and serial numbers on each, by a breadth-first walk with a queue, a depth limit (`--max-depth`), no
  recursion and each lot listed once, in text, markdown and JSON.
- Loop search by a depth-first walk with a stack of its own, so a chain or a loop of a hundred thousand lots is read in
  good time with a small amount of stack.
- A table of the kinds of event with the rows and lots of each, in every format but SARIF.
- Reports as text, markdown, JSON and SARIF 2.1.0; every finding has its id, severity, kind, message, file, line, column and
  subject; `--min-severity`, `--fail-on`, `--now`, `--explain` with the reason and the context of each check, and
  `--list-checks`. Exit code `0` when no finding is at or above the fail-on level, `1` when one is, `2` for a usage or input
  error, with no result.
- Made-up examples in the year 2101: a chain that passes at every level and a file with a mistake of every check but
  `file-unreadable`, with their real output in all formats, the list of checks, and a trace back and a trace forward.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of
  the repository.
