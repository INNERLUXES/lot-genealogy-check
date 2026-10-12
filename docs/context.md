# Context

The tool checks the records in a file, not whether they are true, and it is not a certification of any kind. There is no
regulation behind any of its checks. Each one is a best practice of the tool: a thing that is useful to look at in a
spreadsheet of production and custody events before the records go on a shared ledger, into a database or to a customer.
This document says where the ideas meet words that other work uses, and only that. It quotes no law and no standard, and it
does not say that a file meets any of them.

## Why a shared ledger makes the check worth running

A shared ledger is good at keeping what is written to it. That is the reason to read the records first. A lot that was
consumed without ever being received, a serial number that was made twice, or a loop in the genealogy is cheap to correct
in a spreadsheet and hard to take back from a record that many parties hold. The tool reads one file and contacts nothing, so
it can run on every export, in a pipeline or by hand, before anything is written.

## GS1 EPCIS

GS1 EPCIS is a standard for sharing events about objects, lots and places in a supply chain. It has an event type for an
event that takes input items or lots and makes output items or lots. A `produce` or `assemble` row with `input_lots` is the
same idea in a spreadsheet, and the checks of input lots, mass balance and genealogy loops look at exactly the relation that
such an event records. A `ship` and a `receive` of one lot are the movement of it between parties.

This tool does not read EPCIS, does not check that a file conforms to it, and does not claim that its columns map onto it
without loss. If you hold EPCIS events, the sibling tool epcis-event-check, from the same project, reads that format.

## Digital product passports

Work on digital product passports in the European Union speaks of data at the level of a batch or of an item. A genealogy of
lots and serial numbers that holds together is useful input to that work: which batches went into which items, which party
held a lot at which time. The tool checks no passport, does not say what a passport must contain, and does not claim that a
file that passes is fit for any passport. Read the text that applies to your product before you decide what to record.

## What each idea is for

| Idea | What the check is for |
| --- | --- |
| Input lots must exist first (`input-lot-not-available`) | A lot that appears out of nowhere cannot be traced back |
| A mass balance (`mass-balance-exceeded`) | An event that makes more than it uses has an input that was not written down |
| A party cannot give more than it holds (`lot-overdrawn`) | A quantity that left a lot without being in it points at a missing row or a wrong quantity |
| One unit, one serial number (`serial-born-twice`, `serial-on-two-lots`) | A serial number names one unit; if it names two, a trace of an item is wrong |
| Custody is a chain (`custody-gap`, `custody-time-reversed`) | A lot cannot change hands without a record or arrive before it is sent |
| No loops (`genealogy-loop`) | A trace backward from a lot in a loop never ends |

## Not a certification

A clean run is not a certificate of origin, of conformance or of compliance, and the tool's output is not one. It is a list of
what does not hold together in a file, with the line to look at. The decision about what is true, and what has to be kept,
shown or provided to anyone, stays with the people who keep the records.
