# lot-genealogy-check: examples/bad/events.csv

- File: examples/bad/events.csv \(CSV, 40 lines, 3,205 bytes\)
- Rows: 38 \(5 receive, 17 produce, 7 ship, 5 assemble, 2 scrap and 1 no known kind\); 1 row left out as malformed
- Columns: 15 in the header, 13 read, 1 not read
- Lots: 21 lots, 3 parties, 4 serial numbers
- Event times: from 2101-02-01T07:00:00Z to 2101-04-20T08:00:00Z
- Now: 2101-03-10T12:00:00Z, from --now
- Yield tolerance: 0 percent
- Findings: 28 \(18 error, 6 warning, 4 info\)
- Result: **FAIL - 18 findings at or above error \(18 error, 6 warning, 4 info\)**

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | column-missing | examples/bad/events.csv:1 | The header has no "product" column, but the rows of produce, assemble and receive need it; 27 rows are affected and none of them is reported for it one by one. Fix: Add the column named to the spreadsheet and fill it for the rows that need it; docs/inputs.md lists every column. |
| error | column-duplicate | examples/bad/events.csv:1 | The column "Event Time" has the same name as column 3 once case and separators are ignored; only the first is read. Fix: Keep one column of each name. |
| error | input-lot-not-available | examples/bad/events.csv:6 | Row 5 \(assemble\) uses the input lot GHOST-9, which no receive or produce row of the file holds. Fix: Add the receive or produce row of the lot, correct the lot code, or correct the times; a lot has to exist before it is used. |
| error | input-lot-not-available | examples/bad/events.csv:7 | Row 6 \(assemble\) uses the input lot LATE-1 at 2101-02-04T09:00:00Z, but the first row that receives or makes it, row 7, is dated 2101-02-10T08:00:00Z. Fix: Add the receive or produce row of the lot, correct the lot code, or correct the times; a lot has to exist before it is used. |
| error | lot-overdrawn | examples/bad/events.csv:10 | By row 9 \(ship\) 150 kg of the lot OVR-1 have been shipped, scrapped or used by Acme Mill, but Acme Mill received or made only 100 kg of it. Fix: Check the quantities of the row named, and whether a receive or produce row of the lot is missing from the file. |
| error | serial-born-twice | examples/bad/events.csv:14 | The serial SN-77 is made by row 13 \(assemble\) and was already made by row 12, on line 13; a serial number names one unit and is made once. Fix: Give each unit its own serial number, or delete the repeated row. |
| error | serial-on-two-lots | examples/bad/events.csv:17 | The serial SN-88 is on the lot SER-3 at row 16, but on the lot SER-2 at row 14; one serial number names one unit. Fix: Correct the lot or the product of the row named, or give the units different serial numbers. |
| error | custody-time-reversed | examples/bad/events.csv:28 | Row 27 \(receive\) takes in the lot TR-1 at 2101-02-07T10:00:00Z, before row 26 \(ship\) sends it at 2101-02-08T10:00:00Z. Fix: Correct the time of the row named; a lot cannot arrive before it is sent. |
| error | genealogy-loop | examples/bad/events.csv:30 | The lot LOOP-A is made from LOOP-B, which is made from LOOP-A again. Row 29 \(produce\) closes the loop; a lot cannot be made from itself. Fix: Correct the input\_lots of the row named; a lot is made from lots that existed before it. |
| error | row-malformed | examples/bad/events.csv:33 | Row 32 has 4 cells but the header has 15; the row was left out of every other check. A cell that holds a comma, a tab or a line end must be in double quotes. Fix: Put a cell that holds a comma, a tab or a line end in double quotes, and write a quote inside it as two quotes. |
| error | event-type-unknown | examples/bad/events.csv:34 | The event\_type of row 33, "Recieve", is not one of receive, produce, ship, assemble, scrap. Did you mean receive? The row was not checked. Fix: Write one of "receive", "produce", "ship", "assemble" or "scrap" in the event\_type column. |
| error | event-incomplete | examples/bad/events.csv:35 | Row 34 \(ship\) has no value in the cell under "to\_party", which a ship row needs. Fix: Fill the cell named from the business record the row comes from; docs/inputs.md says what each kind of event needs. |
| error | quantity-not-positive | examples/bad/events.csv:36 | The quantity of row 35 \(scrap\) is zero; a quantity must be above zero. Fix: Write the quantity as a plain number above zero, such as 25 or 12.5, with no unit in the cell. |
| error | unit-missing | examples/bad/events.csv:37 | The quantity of row 36 \(scrap\), 3, has no unit in the unit column. Fix: Give the unit with the quantity, such as kg, pieces or litres. |
| error | input-lots-unreadable | examples/bad/events.csv:38 | The input\_lots of row 37 \(produce\): entry 1, "RM-2:5", is not written lot:quantity:unit. Write each as lot:quantity:unit and separate the entries with semicolons. Fix: Write each input as lot:quantity:unit and separate the entries with semicolons, such as RM-1:5:kg;RM-2:2:kg. |
| error | date-invalid | examples/bad/events.csv:39 | The event\_time of row 38 \(produce\), "2101-02-30T10:00:00Z", has the day 30, but month 02 of 2101 has 28 days. Fix: Write the time as YYYY-MM-DD, or as YYYY-MM-DDThh:mm:ss with a time zone, Z or \+hh:mm. |
| error | secret-in-file | examples/bad/events.csv:39 | A cell of the column "site" is shaped like a mnemonic. The tool never reads a seed or a key, and the value is not shown. Fix: Remove the value from the file and from wherever the file was copied, treat it as exposed and move what it controls to a new key. A record of lots names lots, parties and quantities, never the key of an account. |
| error | future-date | examples/bad/events.csv:40 | The event\_time of row 39 \(produce\), 2101-04-20T08:00:00Z, is after the moment given with --now. Fix: Correct the time or the clock of the system that wrote it; an event cannot be recorded before it took place. |
| warning | column-unknown | examples/bad/events.csv:1 | The column "documentref" is not a column the tool reads, so the values under it are not checked. Did you mean document\_ref? Fix: Correct the name to a column of docs/inputs.md, or leave the column in if it is for your own use. |
| warning | mass-balance-exceeded | examples/bad/events.csv:4 | By row 3 the produce event B-03 makes 120 kg in total, more than the 100 kg of its inputs. Fix: Check the quantities against the work order, name the inputs that were left out, or set --yield-tolerance if a gain such as added water is expected. |
| warning | custody-gap | examples/bad/events.csv:21 | Row 20 \(receive\) is by Yard Logistics, but row 19 \(ship\) sends the lot CG-1 to Zenith Foods. Fix: Add the missing receive or ship row, or correct the party in the row named. |
| warning | custody-gap | examples/bad/events.csv:24 | Row 23 \(ship\): Zenith Foods ships the lot CG-2, but row 22 \(ship\) only sends it to Zenith Foods and no receive by Zenith Foods follows. Fix: Add the missing receive or ship row, or correct the party in the row named. |
| warning | event-id-repeated | examples/bad/events.csv:31 | The event\_id of row 30, B-01, is also the event\_id of row 1, on line 2, and the two rows are not one event; give each event its own identifier. Fix: Give each event its own event\_id. |
| warning | duplicate-row | examples/bad/events.csv:32 | Row 31 has the same cells as row 7, on line 8, so one event is counted twice. It was left out of the other checks. Fix: Delete the repeated row, or correct the cell that should differ. |
| info | units-not-comparable | examples/bad/events.csv:5 | The produce event B-04 has inputs in kg and outputs in pieces, so the tool cannot compare what it makes with what it uses; it compares in one unit only. Fix: Use one unit for the lot and for the event, or accept that this event and this lot are not checked for quantity. |
| info | ship-without-receive | examples/bad/events.csv:20 | Row 19 \(ship\) sends the lot CG-1 to Zenith Foods, but no receive row of the file takes it in there. Fix: If the file is meant to hold both sides of every move, add the receive row; if it holds one party, no change is needed. |
| info | ship-without-receive | examples/bad/events.csv:27 | Row 26 \(ship\) sends the lot TR-1 to Zenith Foods, but no receive row of the file takes it in there. Fix: If the file is meant to hold both sides of every move, add the receive row; if it holds one party, no change is needed. |
| info | receive-without-ship | examples/bad/events.csv:28 | Row 27 \(receive\) takes in the lot TR-1 at Zenith Foods, but no ship row of the file sends it there. Fix: If the file is meant to hold both sides of every move, add the ship row; if it holds one party, no change is needed. |

## Why

### column-missing

- Asking for these columns is a best practice of this tool; no regulation sets it; the columns and their names are the tool's own, because no regulation fixes them

### column-duplicate

- Refusing a column written twice is a best practice of this tool; no regulation sets it; two readers could see two values

### input-lot-not-available

- Following each input back to a row is a best practice of this tool; no regulation sets it; a lot that appears out of nowhere cannot be traced back
- Context: GS1 EPCIS has an event type for an event that uses input items or lots and makes output items or lots, and a produce or assemble row with input\_lots is the same idea in a spreadsheet; this tool does not read EPCIS and does not check conformance to it.

### lot-overdrawn

- Adding up what a party holds of a lot and what leaves it is a best practice of this tool; no regulation sets it; a party cannot give more than it has, and a file that holds only some of the rows can show this by mistake; the sums are kept for each party because a ship and its receive are one movement of the same material

### serial-born-twice

- Treating a serial number as unique in the file is a best practice of this tool; no regulation sets it; if your serial numbers repeat from one product to the next, put the product in front of them
- Context: Work on digital product passports speaks of data at the level of a batch or of an item, so a chain of lots and serial numbers that holds together is useful input to that work; this tool checks no passport and does not say what a passport needs.

### serial-on-two-lots

- Treating a serial number as one unit is a best practice of this tool; no regulation sets it; a unit is in one lot and is one product
- Context: Work on digital product passports speaks of data at the level of a batch or of an item, so a chain of lots and serial numbers that holds together is useful input to that work; this tool checks no passport and does not say what a passport needs.

### custody-time-reversed

- Reading the times along the custody chain is a best practice of this tool; no regulation sets it; events of one lot should not go back in time

### genealogy-loop

- Refusing a loop in the genealogy is a best practice of this tool; no regulation sets it; a trace backward from a lot in a loop never ends
- Context: GS1 EPCIS has an event type for an event that uses input items or lots and makes output items or lots, and a produce or assemble row with input\_lots is the same idea in a spreadsheet; this tool does not read EPCIS and does not check conformance to it.

### row-malformed

- Reporting a row of the wrong width is a best practice of this tool; no regulation sets it; every cell after the extra one would be shifted and read as another column

### event-type-unknown

- The list of five kinds of event is a best practice of this tool; no regulation sets it; the kinds and their names are the tool's own, kept small on purpose

### event-incomplete

- Asking for these cells is a best practice of this tool; no regulation sets it; a chain of lots cannot be followed through a row that does not say which lot, who or when

### quantity-not-positive

- Asking for a plain positive number is a best practice of this tool; no regulation sets it; a quantity of zero or one that is text cannot be added up or compared

### unit-missing

- Asking for the unit is a best practice of this tool; no regulation sets it; quantities are added up and compared only in one unit, so a quantity with no unit can be checked against nothing

### input-lots-unreadable

- The form lot:quantity:unit is a best practice of this tool; no regulation sets it; the tool needs the quantity of each input to compare an event with its inputs
- Context: GS1 EPCIS has an event type for an event that uses input items or lots and makes output items or lots, and a produce or assemble row with input\_lots is the same idea in a spreadsheet; this tool does not read EPCIS and does not check conformance to it.

### date-invalid

- Reading only dates written one way is a best practice of this tool; no regulation sets it; the order of month and day in other forms is ambiguous, and the order of events depends on the time

### secret-in-file

- Looking for keys and seeds is a best practice of this tool; no regulation sets it; a file that goes to a shared ledger project often sits next to wallets, and a report must never copy a secret into a log

### future-date

- Refusing a time from the future is a best practice of this tool; no regulation sets it; the tool reads no clock, so the moment is the one given with --now

### column-unknown

- Reporting a column that is not read is a best practice of this tool; no regulation sets it; a misspelt name would otherwise hide a cell from every check

### mass-balance-exceeded

- A mass balance is a best practice of this tool; no regulation sets it; a process that makes more than it uses has an input that is not written down, and a warning leaves room for added ingredients
- Context: GS1 EPCIS has an event type for an event that uses input items or lots and makes output items or lots, and a produce or assemble row with input\_lots is the same idea in a spreadsheet; this tool does not read EPCIS and does not check conformance to it.

### custody-gap

- Following a lot from party to party is a best practice of this tool; no regulation sets it; a lot that changes hands without a record cannot be traced through the gap, and a file that holds only some of the rows can show this by mistake

### event-id-repeated

- Asking for a unique event\_id is a best practice of this tool; no regulation sets it; an event that is named twice cannot be pointed at

### duplicate-row

- Looking for repeated rows is a best practice of this tool; no regulation sets it; a repeated row doubles the quantity of a lot

### units-not-comparable

- Comparing only in one unit is a best practice of this tool; no regulation sets it; a conversion between units belongs to a recipe or a product, which the file does not carry

### ship-without-receive

- Matching a ship with a receive is a best practice of this tool; no regulation sets it; the recipient keeps its own records, so this is a note

### receive-without-ship

- Matching a receive with a ship is a best practice of this tool; no regulation sets it; each party keeps its own records, so this is a note

## Event types (6)

| Event type | Rows | Lots |
| --- | --- | --- |
| receive | 5 | 5 |
| produce | 17 | 17 |
| ship | 7 | 6 |
| assemble | 5 | 4 |
| scrap | 2 | 1 |
| no known kind | 1 | 0 |

This report checks the records in the file, not whether they are true, and it is not a certification of any kind.
