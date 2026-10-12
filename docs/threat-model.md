# Threat model

The tool checks the records in a file, not whether they are true, and it is not a certification of any kind. This document
is about the tool itself: what it touches, what a hostile or careless spreadsheet can try, and what stops it.

## What the tool touches

- It reads the one file named on the command line. Nothing else is opened, and no path, address or link written in a cell
  is looked up, opened or followed; a web address in `document_ref` is only text.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates nothing and
  reads no clock and no locale.

## What the input may hold

A spreadsheet comes from an export of a production or warehouse system, a partner, or a person who edits it by hand, and in
a pipeline that checks every pull request or every upload it may be written by whoever sent it. Through it, a person can try
to, or a careless change can:

- put a private key, a seed or a mnemonic in a cell or in a column name, so that the tool copies it into a pipeline log, a
  pull request comment or a code scanning upload;
- hide a private key in a column of identifiers, where a hash used as a lot code or a serial number belongs;
- make the tool read outside the file: a link named on the command line, a folder, an address given as the path;
- exhaust the memory, the stack or the time: a file of many megabytes, a hundred thousand rows, one lot in a hundred thousand
  rows, a chain of a hundred thousand lots each made from the one before, a loop of a hundred thousand lots, a lot shipped to
  thirty thousand parties, a cell of a million characters, a row of a million commas, quotes in long runs, numbers with
  thousands of digits;
- move the result: a column written twice so that two readers see two values, a misspelt column that hides a cell, a row
  with a cell too many that shifts every value after it, a quantity that a floating point number would read wrongly, a time
  that each reader turns into another day;
- slip in something that is not text: a spreadsheet saved as a binary file, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, escape sequences, direction controls and line separators in
  a cell, a lot, a party or a file name;
- hide markup in the markdown report: a link, a table separator or a tag in a cell;
- change how objects behave: a column, a kind of event, a lot, a party, a serial number or a unit named `__proto__`,
  `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A secret in the file is copied into the output | Every column name and every long cell is looked at for a key or a seed; each one found is a `secret-in-file` error, the cell is marked, the checks leave it out as if it were not there, and no message names it. Tests put each shape in several columns and check every format for the value |
| A hash used as an identifier is reported as a key | A cell of 64 hex digits in the `event_id`, `lot`, `serial` or `document_ref` column is read as an identifier; in any other column it is still a secret, and any other shape in those columns is still one |
| A link makes the tool read a file it was not given | The path is checked with `lstat` and a link is refused by name; the file is opened with `O_NOFOLLOW` where the system has it, and its type and size are taken from the open handle. A test puts a link in the folder |
| The tool reaches a server, fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, a cell is only text, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | The file has a size limit checked on the open handle before it is read; the reader keeps limits of rows, columns, cells and cell length and works through a loop with no recursion; the graph of lots, the loop search and the trace use maps, queues and an explicit stack, never recursion; lots, serial numbers, shipments and receipts are kept in maps and no pair of rows is compared; at most 1,000 findings of one check are listed and at most 2,500 lots of a trace. Tests with a hundred thousand rows and a chain and a loop of a hundred thousand lots check the time, with limits that widen under coverage only |
| A column written twice hides a value | A name written twice is a `column-duplicate` finding, and only the first column is read |
| A misspelt or missing column passes for one that is fine | A column the tool does not read is a `column-unknown` finding with the column it is probably meant to be; a column the rows need and the header lacks is `column-missing`; each with its line |
| A row of the wrong width shifts the cells | A row with more or fewer cells than the header is a `row-malformed` finding and is left out of every other check |
| Quantities or times are read wrongly | Quantities are read from the characters of the file with BigInt; a number past 40 digits is a finding, never rounded; sums are exact. Times are read from their characters with a calendar worked out by hand, a date written the American way is a finding, and a time with no zone is a finding |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes in UTF-16 and bytes that are not valid make the file an input error with exit code `2` and no report |
| Text from the file rewrites the terminal | Every text from the input goes through `safeText`, which replaces control, line separator and direction characters and caps the length. A test puts escapes and direction controls in a cell and a file name, in every format |
| Markup in a cell changes the markdown report | The markdown report escapes the characters markdown gives a meaning to. A test writes a link, a bar and a tag into a cell |
| `__proto__` changes how objects behave | Names of the file are compared with the names the tool reads and kept in `Map` and `Set` objects, and no object is built with a key from the file. A test uses `__proto__`, `constructor` and `toString` as columns, kinds of event, lots, parties and units |
| The time of the run changes the result | No clock is read; the one moment is the one of `--now`, so the same file and options give the same report on every day |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the records describe what happened, whether a lot is what the file says, the forms and secrets docs/limits.md says
the tool does not see, who may change or upload the file, and where your pipeline keeps the output.
