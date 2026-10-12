# 3. Check the events on disk, and contact nothing

## Status

Accepted

## Context

Many facts about a row live elsewhere: whether a lot exists in a warehouse, whether a party is the party it says, whether a
delivery note was ever issued, what the partner's side of a shipment holds, whether the weight on the scale was the weight in
the cell. A check could call a registry, look up every party, open every web address in a document reference and ask a
partner's system for the other side of every move. That would need the network and often a key, would make the result depend
on the state of other people's services at the moment of the run, would send the names of a firm's suppliers and customers to
a third party, and would let a file in a pull request make the pipeline reach any address it names.

What a team needs first, before the records are written to a shared ledger, is a list of what is wrong in them and where: a
component used and never received, a serial number made twice, a lot that is its own input, a lot received before it was
shipped. The spreadsheet is a file, and can be checked the same way on every run.

## Decision

1. The tool reads the file it is given, and nothing else. It contacts nothing over the network, fetches nothing, opens no
   link, needs no key, runs no program and sends no data anywhere. It cannot write, submit or endorse a record.
2. The checks work from the file alone. The checks across rows see the rows of the file, and docs/limits.md says that the rest
   of the records of a lot are not seen, which is why a receive with no ship is a note.
3. The five kinds of event and the columns that hold them are in the code, kept short and named in docs/inputs.md. They change
   in a release, never while the tool runs.
4. Every check is a best practice of this tool. No regulation is behind any of them, and the reports and the documents say so
   in plain words. Where an idea meets the vocabulary of GS1 EPCIS or of digital product passports, docs/context.md says so as
   context, quotes nothing, and claims no conformance.
5. The tool lists what to look at and what to change; it changes nothing and sends nothing.

## Consequences

- The result depends only on the file and the options, and a run needs no network access and no secret.
- A spreadsheet that is fine on its own may still disagree with the records of a partner; the partner, or a later check with
  both sides, has to catch that.
- A party, a lot or a document number is checked for being there and for agreeing with the other rows, never looked up.
