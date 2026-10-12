# 2. Read CSV with a reader of its own, and never show a secret

## Status

Accepted

## Context

A spreadsheet saved as CSV or TSV looks simple and is not. A split on commas breaks on a party name with a comma in it. A
split on lines breaks on a cell with a line end in it. A library that guesses (the delimiter, the quoting, a number from a
cell) turns a lot code such as `0012` into the number 12 and a quantity into a floating point number. None of them keeps the
line and the column of a cell, so a finding could not point at the cell to change.

A spreadsheet is also written by exports and by hand, next to the keys of the systems that make it, and a careless file can
hold a secret: the private key of an account pasted into a notes cell, a seed phrase in a product name. A file that is about
to go on a shared ledger project is more likely than most to sit next to wallets. A tool that reads such a file and echoes
its values in a report would copy the secret into a pipeline log, a pull request comment or a SARIF upload, where many more
people can read it.

A lot or a serial number of a firm that anchors its records on a ledger may also be a hash of 64 hex digits, which has the
shape the search for secrets of the sibling tools reads as a private key in hex.

A file that is not complete (a column the rows need that is missing, a misspelt column, a row with a cell too many) would
also be read as if it were, and a check could take a value it never saw for one that is fine.

## Decision

1. The file is read by `src/csv.js`, a reader of its own for RFC 4180 quoting with a comma or a tab as the delimiter, one
   character at a time with no recursion and no pattern built from the text. It keeps the line and the column of every cell
   and keeps every cell as the text it was written. It refuses what it cannot follow instead of guessing: a quote never
   closed, text after a closing quote, a quote inside a cell that does not start with one, a cell, a row or a file over the
   limits, and a first line separated by semicolons.
2. Quantities are read from the characters of the file with the decimal reader of the sibling tools (`src/decimal.js`, kept
   unchanged) into a whole number and a scale. A number past the limit is a finding, never rounded.
3. The tool never asks for a private key, a seed or an API key: it checks the records as written. Before anything else is
   read, `src/secrets.js` walks every column name and every long cell. Its shapes and its list of names of keys are those of
   the sibling tools, kept unchanged. A column named for a key or a seed, and a cell shaped like a mnemonic, an extended
   private key, a private key in hex or a key in WIF, is a `secret-in-file` error at its line. The cell is marked, the
   checks leave it out as if it were not there, and no report and no error message shows it, in any format.
4. A cell of 64 hex digits, with or without 0x, in the column `event_id`, `lot`, `serial` or `document_ref` is read as the
   identifier it is meant to be: `src/check.js` passes those columns to the search. The tool never shows such a cell as a
   secret, and it does not echo it either. In any other column the same value is still a `secret-in-file` error, and a
   mnemonic or a key in WIF in those columns is still one too.
5. Every column the rows need and the header does not give, every column the tool does not read and every row of the wrong
   width is returned with its line and shown as a finding. A check never takes a value it did not read for one that is fine.
6. The checks are a heuristic over the records as written, and every report says so; docs/method.md says what each check
   reads and docs/limits.md what it cannot see. The tool checks the records in a file, not whether they are true, and it is
   not a certification of any kind.

## Consequences

- The tool needs no install and no network, and the same file gives the same report on Linux, Windows and macOS.
- A finding points at the line and the column of the cell it is about.
- A secret in the file fails the run and is never copied into the output. The shapes are loose, so a cell that only looks like
  a secret, such as a note of twelve short lowercase words, is reported too; that is the safe side.
- A private key pasted into a column of identifiers cannot be told apart from a hash and is not reported; it is not shown
  either, and docs/limits.md says so.
