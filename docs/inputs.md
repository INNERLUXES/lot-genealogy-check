# Inputs

The tool takes the path of one file: a spreadsheet of production and custody events, saved as CSV or TSV, with a header
row and one row for each event. There is no configuration file of the tool itself, no environment variable and no
standard input; the options are on the command line. The tool never asks for a private key, a seed, an API key or the
address of a server, and needs none. It is a check of the records in a file: it checks the records in a file, not whether
they are true, and it is not a certification of any kind.

The columns, the kinds of event and every check are this tool's own choice. No regulation sets any of them, and no
standard fixes the names of the columns of a spreadsheet. [docs/context.md](context.md) says where the ideas meet the
vocabulary of GS1 EPCIS and of digital product passports, as context only.

```
lot-genealogy-check <events.csv> [--format text|markdown|json|sarif] [--json] [--min-severity <level>]
                    [--fail-on <level>] [--now <date>] [--yield-tolerance <percent>] [--explain] [--list-checks]
lot-genealogy-check <events.csv> [--trace-back <lot>] [--trace-forward <lot>] [--max-depth <n>]
                    [--format text|markdown|json] [--json]
```

| Option | Meaning |
| --- | --- |
| `--format <name>` | `text` (default), `markdown`, `json` or `sarif`; a trace has no `sarif` form |
| `--json` | the same as `--format json` |
| `--min-severity <level>` | the lowest level shown: `info` (default), `warning` or `error` |
| `--fail-on <level>` | the lowest level that fails the run: `info`, `warning` or `error` (default) |
| `--now <date>` | the moment event times are compared with, written `YYYY-MM-DD` or `YYYY-MM-DDThh:mm:ss` with a time zone, such as `2101-03-10T12:00:00Z`; without it `future-date` does not run |
| `--yield-tolerance <percent>` | how many percent the outputs of an event may exceed its inputs before `mass-balance-exceeded` reports it; a plain number from 0 to 1000, default 0 |
| `--explain` | add why each check exists, and its context, to the text, markdown and JSON reports |
| `--trace-back <lot>` | list the lots, products, parties and serial numbers the lot is made from, and exit |
| `--trace-forward <lot>` | list the lots made from the lot, with their products, parties and serial numbers, and exit |
| `--max-depth <n>` | how many steps a trace follows, from 1 to 1,000,000; default 1,000 |
| `--list-checks` | list the checks with their level and kind, in text, markdown or JSON, and exit |
| `--help`, `--version` | the usage, the version |

Every option that takes a value takes it once. A value may not start with `--`. `-` (standard input) and an address such
as `https://...` are refused. A folder is refused: name the file. Two files are a usage error. A `--now` that is not a
date, or names a day that does not exist, is a usage error with exit code `2`. The options of the checks (`--explain`,
`--min-severity`, `--fail-on`, `--now`, `--yield-tolerance`) are refused together with a trace, and `--max-depth` is
refused without one.

## The file

The file is read as CSV, or as TSV when its first line has tabs and at least as many tabs as commas (outside quotes),
whatever its name. It is UTF-8, with or without a byte order mark, or UTF-16 with a byte order mark, with LF, CRLF or CR
line ends. A cell that holds a comma, a tab, a quote or a line end is written in double quotes, and a quote inside it as
two quotes. A line with nothing on it is skipped. A first line separated by semicolons is refused.

The first line is the header. A column is found by its name written in any case with any run of other characters in
place of the underscores, so `Event Time`, `event-time` and `event_time` are one column. A column the tool does not read
is reported and its values are left out; a name written twice is reported and only the first is read. The order of the
columns does not matter.

Every row after the header is one event. "Row 3" in a message is the third row after the header, and the line of its
cell is the one after the path. A row with more or fewer cells than the header is reported and left out of the other
checks.

A cell that is empty, or holds only `n/a`, `na`, `none`, `null`, `nil`, `tbd`, `unknown`, a dash, two dashes or a
question mark (in any case), says nothing, and is read as empty. White space around a cell is dropped.

## The columns

| Column | What it holds |
| --- | --- |
| `event_id` | the identifier of the event; unique in the file, except that the rows of one produce or assemble event may share it |
| `event_type` | the kind of event: `receive`, `produce`, `ship`, `assemble` or `scrap` |
| `event_time` | when it happened: `YYYY-MM-DD`, or `YYYY-MM-DDThh:mm:ss` with an optional fraction of a second and a time zone, `Z` or `+hh:mm` |
| `party` | the party that records the event and holds the lot when it happens; for a `ship` the party that sends the lot |
| `site` | the place of the event, such as a plant or a warehouse; kept, not compared |
| `from_party` | `receive`: the party the lot came from, when the file names it; `ship`: the shipper, which must be the `party` when given |
| `to_party` | `ship`: the party the lot is sent to |
| `lot` | the lot or batch the row is about; for `produce` and `assemble` the lot that is made |
| `serial` | the serial number of one unit of the lot, when units are serialised |
| `product` | the product of the lot, a code or a name |
| `quantity` | how much of the lot the row moves, makes or scraps: a plain number above zero |
| `unit` | the unit of the quantity, such as `kg`, `pieces` or `litres`; compared without regard to case |
| `input_lots` | `produce` and `assemble`: the lots used, written `lot:quantity:unit` and separated by semicolons |
| `document_ref` | the number of the delivery note, work order or other document of the row; kept, not compared |

## The kinds of event

| `event_type` | What it records | Cells it needs besides `event_id`, `event_time`, `party`, `lot`, `quantity` and `unit` |
| --- | --- | --- |
| `receive` | a party takes in a lot, usually shipped by another party | `product` |
| `produce` | a party makes a lot; with `input_lots` from other lots, without them the lot starts in this file (a harvest, a bought-in lot, a first fabrication) | `product` |
| `ship` | a party sends a lot to another party | `to_party` |
| `assemble` | a party makes a lot from components and names them | `product`, `input_lots` |
| `scrap` | a party writes off a quantity of a lot | none |

The value is read in any case: `SHIP` and `ship` are one kind. A value that is none of the five is reported with the
nearest one, and its row is left out of the other checks.

## input_lots

`input_lots` lists the lots a `produce` or `assemble` row uses, each as `lot:quantity:unit`, separated by semicolons:
`RM-1:5:kg;RM-2:2.5:kg`. The quantity and the unit are read from the right, so a lot code may hold a colon, as in
`urn:lot:id:7:5:kg`. A semicolon cannot be part of a lot code. An empty entry, as in a trailing semicolon, is skipped. An
entry that is not in this form, or whose quantity is not a plain number above zero, is reported, and the event it belongs
to is not compared with its inputs. The other kinds of event do not read the column.

An event that makes several lots is written as several rows with the same `event_id`, kind, `party` and `event_time`. Its
inputs are the `input_lots` of all its rows added up, so list each input once, on the row of the lot it went into or on any
one row; its outputs are the quantities of all its rows. A serialised unit is one row with its own `serial` and a
`quantity` of 1.

## Times, quantities and units

A time is read from its characters with a calendar worked out by hand, never through the clock or the locale of the
machine. A day alone, `2101-03-04`, is a day; a time must carry a time zone. A date written the American way is refused
rather than guessed. A quantity is read from its characters into a whole number and a scale, never through a floating
point number: `0.1` and `0.2` add up to `0.3` exactly, and a number of more than 40 digits, a sign, a thousands
separator or an exponent is reported. Sums and comparisons are made in one unit at a time; a lot or an event in two units
is a note.

### A short file

This file passes every check at every level:

```csv
event_id,event_type,event_time,party,from_party,to_party,lot,serial,product,quantity,unit,input_lots
E-1,produce,2101-02-01T08:00:00Z,Acme Mill,,,RM-1,,Resin,100,kg,
E-2,ship,2101-02-02T08:00:00Z,Acme Mill,,Zenith Foods,RM-1,,Resin,100,kg,
E-3,receive,2101-02-03T08:00:00Z,Zenith Foods,Acme Mill,,RM-1,,Resin,100,kg,
E-4,assemble,2101-02-04T08:00:00Z,Zenith Foods,,,FIN-1,SN-1,Garden sensor,1,kg,RM-1:1:kg
```

`examples/good/events.csv` is a longer made-up chain that passes at error, warning and info level: raw lots received,
made into components, assembled into serialised units, shipped to a distributor and received. `examples/bad/events.csv`
holds a mistake of every check but `file-unreadable`.

## Tracing a lot

`--trace-back <lot>` follows the `input_lots` of the `produce` and `assemble` rows from the lot to the lots it is made
from, and from those to the lots they are made from, and so on. `--trace-forward <lot>` follows them the other way, to the
lots made from the lot. Each lot is listed once, nearest first, with its depth, product, the parties on its rows and its
serial numbers. The walk keeps a queue and no recursion, lists each lot once so that a loop in the file ends it, and stops
at `--max-depth`, saying so. Both options may be given in one run. A lot that is not in the file is an error with exit code
`2`, and if the name is a serial number the message says which lot it is on.
