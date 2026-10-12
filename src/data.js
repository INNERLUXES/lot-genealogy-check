// What every report says about itself. There is no regulation behind any check of this tool: each one is a best practice of
// the tool, and the reports and the documents say so plainly. docs/context.md says where the idea of each check meets the
// vocabulary of GS1 EPCIS and of digital product passports, as context only.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about the file itself, about one row, or across rows.
export const KINDS = ['file', 'row', 'across rows'];

export const NOT_A = 'checks the records in a file, not whether they are true, and it is not a certification of any kind';

export const NOTICE = `This report checks the records in the file, not whether they are true, and it is not a certification of any kind.`;

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no regulation sets it';

// Context for the checks that make new lots from input lots, and for the checks of serial numbers. It is context only: the
// tool checks no event, no passport and no standard.
export const CONTEXT = {
  inputs: 'GS1 EPCIS has an event type for an event that uses input items or lots and makes output items or lots, and a produce or assemble row with input_lots is the same idea in a spreadsheet; this tool does not read EPCIS and does not check conformance to it.',
  batch: 'Work on digital product passports speaks of data at the level of a batch or of an item, so a chain of lots and serial numbers that holds together is useful input to that work; this tool checks no passport and does not say what a passport needs.'
};
