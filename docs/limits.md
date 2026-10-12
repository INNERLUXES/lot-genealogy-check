# Limits

The tool checks the records in a file, not whether they are true, and it is not a certification of any kind. This document
says what that means: what the tool cannot see, where it can be wrong, and the limits of the work it does.

## What a clean result means

A run with no finding at or above the fail-on level means that none of the problems the checks look for were found in the
cells of the file. It does not mean that the lots exist, that the quantities were weighed, that the parties are who the file
says, that the product is what the file says, or that the file holds every event. A genealogy can be consistent and still
describe things that never happened. Nothing in the tool compares the file with a scale, a warehouse, a ledger or a
partner's records.

## What the tool cannot see

- **Whether the records are true.** The tool reads cells. It cannot tell a real delivery note from a made-up one, and it
  does not look up a lot, a party or a document number.
- **The rows that are not in the file.** The checks across rows see the rows of one file. A file that holds one party's
  records shows receipts of lots shipped by others, which is why `receive-without-ship` and `ship-without-receive` are
  notes, and why `custody-gap` is a warning: an export cut in the middle of a lot can show a gap that is not there.
- **Conversions between units.** The tool compares quantities in one unit at a time and does not convert. An event whose
  inputs are in kilograms and whose outputs are in pieces gets a note, not a comparison. A recipe that says how many pieces
  a kilogram makes belongs to a product, which the file does not carry.
- **Losses and additions that are not written down.** A mass balance of zero tolerance flags an event that makes more than it
  uses. A process may add an ingredient that is not listed, or gain weight from water, so the finding is a warning and
  `--yield-tolerance` exists. The tool does not flag an event that makes much less than it uses; a loss is normal.
- **Time zones of a day alone.** A day without a time is compared with other times by the day. An event on the same day as
  another is never "before" it, and a day alone is allowed one day more than `--now`.
- **Serial numbers that repeat by design.** The tool treats a serial number as unique in the file. A manufacturer that
  repeats serial numbers from one product to the next should put the product in front of them. A serial number is never
  compared with a format or a check digit.
- **Whether a party name is the same party.** Names are compared without regard to case and runs of white space, nothing
  more. `Acme Mill` and `Acme Mill Ltd` are two parties.
- **Quantities of a lot that is split.** A lot shipped in parts to several recipients is fine as long as each party's sums
  hold. The tool does not split a receive across shipments; it matches a receive to the next unmatched shipment to that
  party.
- **What a column means to you.** `site` and `document_ref` are kept and shown, not compared. Whether a `site` belongs to a
  `party` is not checked.

## Secrets

The search for keys and seeds is a heuristic with loose shapes (`src/secrets.js`): a mnemonic is 12, 15, 18, 21 or 24 words
of 3 to 8 lowercase letters; an extended private key starts with a letter and `prv` and holds 100 or more base58
characters; a private key in hex is 64 hex digits, with or without `0x`; a key in WIF is 51 or 52 base58 characters that
start with `5`, `K`, `L`, `c` or `9`. A column named for a seed or a key is reported by its name. A cell shorter than 47
characters is too short to be any of the shapes and is not looked at. A secret in another shape is not found.

A cell of 64 hex digits in the `event_id`, `lot`, `serial` or `document_ref` column is read as an identifier, because a hash
is a fair lot code or serial number. The tool does not show such a cell as a secret and does not echo it either. A private
key pasted into one of those four columns cannot be told from a hash and is not reported; the other shapes in those columns
are still reported.

## Work the tool does

The file is read whole, up to 16 MB, 250,000 rows, 200 columns, 3,000,000 cells and 20,000 characters in a cell; more rows
than the limit are left out with a note. A quantity has at most 40 digits before and after the point. At most 1,000
findings of one check are listed, and the rest are counted and noted. A trace lists at most 2,500 lots and follows at most
1,000,000 steps, 1,000 by default; the number of lots reached is always given.

The checks across rows use maps and sorts, never a comparison of every pair of rows, and no walk uses recursion, so a lot
with a hundred thousand rows or a chain of a hundred thousand lots finishes with the same small amount of stack as a short
one. Tests with those sizes check the time, with limits that widen when the runner collects coverage.

## What it does not do

It does not read EPCIS, JSON, XML, a ledger or a database; it reads a CSV or TSV file. It does not write, sign, submit or
send anything. It does not contact a server, run a program or evaluate what it reads. It does not read the clock, the time
zone or the locale of the machine. It is not a replacement for a conformance test of any standard, and it does not say
whether a record meets any law or any customer's requirement.
