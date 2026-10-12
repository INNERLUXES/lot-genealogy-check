// Shared test helpers: events built inline as CSV text, checked in memory or written into a temporary folder that is removed
// after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the reader does, so a test never holds
// a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every party,
// lot and product is made up, and every date is in the made-up year 2101.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { COLUMN_NAMES, checkText, main } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'lot-genealogy-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

// The moment the tests are checked at.
export const NOW = '2101-03-10T12:00:00Z';

export const MILL = 'Acme Mill';
export const DEPOT = 'Zenith Foods';
export const YARD = 'Yard Logistics';

const quote = (v) => (/[",\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// One line of text from an object of column -> value, for these columns.
export const lineOfRow = (row, columns = COLUMN_NAMES, delimiter = ',') => columns.map((c) => quote(row[c] ?? '')).join(delimiter);

// A table as text: the header and the rows, with LF line ends. A row without an event_id gets E-1, E-2 and so on. columns
// is the list of columns (default: all of them).
export const table = (rows, columns = COLUMN_NAMES, delimiter = ',') => `${[columns.join(delimiter), ...rows.map((r, i) => (typeof r === 'string' ? r : lineOfRow({ event_id: `E-${i + 1}`, ...r }, columns, delimiter)))].join('\n')}\n`;

// Rows of each kind of event that pass every check. over replaces cells; a cell set to undefined is left empty.
const make = (base) => (over = {}) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
};

export const produce = make({ event_type: 'produce', event_time: '2101-02-01T08:00:00Z', party: MILL, lot: 'RM-1', product: 'Resin', quantity: '100', unit: 'kg', document_ref: 'WO-1' });
export const ship = make({ event_type: 'ship', event_time: '2101-02-02T08:00:00Z', party: MILL, to_party: DEPOT, lot: 'RM-1', product: 'Resin', quantity: '100', unit: 'kg', document_ref: 'DN-1' });
export const receive = make({ event_type: 'receive', event_time: '2101-02-03T08:00:00Z', party: DEPOT, from_party: MILL, lot: 'RM-1', product: 'Resin', quantity: '100', unit: 'kg', document_ref: 'DN-1' });
export const assemble = make({ event_type: 'assemble', event_time: '2101-02-04T08:00:00Z', party: DEPOT, lot: 'FIN-1', product: 'Garden sensor', quantity: '10', unit: 'kg', input_lots: 'RM-1:10:kg', document_ref: 'WO-2' });
export const scrap = make({ event_type: 'scrap', event_time: '2101-02-05T08:00:00Z', party: DEPOT, lot: 'RM-1', quantity: '2', unit: 'kg', document_ref: 'SC-1' });

// A table with a row of each kind of event, which passes every check at every level: the mill makes RM-1 and ships it, the
// depot receives it, makes FIN-1 from 10 kg of it and scraps 2 kg.
export const clean = () => [produce(), ship(), receive(), assemble(), scrap()];

// The findings of a run in memory, for a text or for rows.
export const findingsOf = (p, options = {}) => checkText(typeof p === 'string' ? p : table(p), options).findings;

// The ids of the findings of a run.
export const idsOf = (p, options) => findingsOf(p, options).map((f) => f.id);

// The findings of one check.
export const ofCheck = (p, id, options) => findingsOf(p, options).filter((f) => f.id === id);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

// A clean file and one with a date that does not exist, for the command line tests.
export const GOOD = { 'events.csv': table(clean()) };
export const BAD = { 'events.csv': table([produce({ event_time: '2101-02-30' })]) };
export const ARGS = ['events.csv'];

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
