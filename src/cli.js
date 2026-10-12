// Command line: lot-genealogy-check <events.csv> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, TraceError, checkFile, readTolerance, traceFile } from './check.js';
import { DATE_FORM, readDate } from './dates.js';
import { LEVELS } from './data.js';
import { listChecksJson, listChecksMarkdown, listChecksText, toJson, toMarkdown, toSarif, toText, toTraceJson, toTraceMarkdown, toTraceText } from './report.js';
import { RULES } from './rules.js';
import { parseDecimal } from './decimal.js';
import { safeText } from './text.js';
import { TRACE_LIMITS } from './trace.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif };
const TRACES = { text: toTraceText, markdown: toTraceMarkdown, json: toTraceJson };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };

export const USAGE = `Usage: lot-genealogy-check <events.csv> [options]

Reads a spreadsheet of production and custody events (CSV, or TSV; a header row and one row for each event: receive,
produce, ship, assemble or scrap) and lists, with its line, what does not hold together before the records go on a shared
ledger: an input lot that was never received or made, or only later; the outputs of an event larger than its inputs; a lot
that gives more than it holds; a serial number made twice or on two lots; a custody gap or a time that goes back along the
chain; a lot that is its own input; and the mistakes of single rows. It can also trace a lot backward to the lots it is made
from or forward to the lots made from it. Every check is a best practice of this tool and no regulation sets any of them.
It checks the records in a file, not whether they are true, and it is not a certification of any kind. It contacts nothing
over the network, runs nothing, reads no clock and writes nothing to disk.

Options:
  --format <name>            text, markdown, json or sarif (default: text; a trace has no sarif form)
  --json                     the same as --format json
  --min-severity <level>     the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>          the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --now <date>               the moment to compare event times with, written
                             ${DATE_FORM}; without it future-date does not run
  --yield-tolerance <pct>    how many percent the outputs of an event may exceed its inputs (default: 0)
  --explain                  show why each finding's check exists, with context (text, markdown and JSON)
  --trace-back <lot>         list the lots, products, parties and serial numbers the lot is made from, and exit
  --trace-forward <lot>      list the lots made from the lot and the parties and serial numbers on them, and exit
  --max-depth <n>            how many steps a trace follows (default: ${TRACE_LIMITS.defaultDepth})
  --list-checks              list the checks with their level and kind, and exit
  --help                     show this text
  --version                  show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level (or a trace was made), 1 a finding at or above it, 2 usage or input
error (also a trace of a lot that is not in the file).
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { paths: [], format: null, json: false, minSeverity: null, failOn: null, now: null, yieldTolerance: null, explain: false, traceBack: null, traceForward: null, maxDepth: null, listChecks: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '--now') o.now = once(a, o.now, next());
    else if (a === '--yield-tolerance') o.yieldTolerance = once(a, o.yieldTolerance, next());
    else if (a === '--trace-back') o.traceBack = once(a, o.traceBack, next());
    else if (a === '--trace-forward') o.traceForward = once(a, o.traceForward, next());
    else if (a === '--max-depth') o.maxDepth = once(a, o.maxDepth, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.paths.length === 1) throw new Error('give one events file');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or sarif)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${v} (${LEVELS.join(', ')})`);
  if (o.now !== null) {
    const t = readDate(o.now);
    if (t.problem) throw new Error(`--now: ${o.now} ${t.problem}`);
  }
  if (o.yieldTolerance !== null && readTolerance(o.yieldTolerance) === null) throw new Error(`--yield-tolerance: ${o.yieldTolerance} is not a plain number of percent from 0 to 1000`);
  if (o.maxDepth !== null) {
    const d = parseDecimal(o.maxDepth);
    if (d === null || d.scale !== 0 || d.int < 1n || d.int > BigInt(TRACE_LIMITS.maxDepth)) throw new Error(`--max-depth: ${o.maxDepth} is not a whole number from 1 to ${TRACE_LIMITS.maxDepth}`);
  }
  o.tracing = o.traceBack !== null || o.traceForward !== null;
  if (o.listChecks && o.format === 'sarif') throw new Error('--list-checks has no SARIF form; use text, markdown or json');
  if (!o.help && !o.version && !o.listChecks) {
    if (o.paths.length !== 1) throw new Error('give the events file, such as lot-genealogy-check events.csv');
    if (isUrl(o.paths[0])) throw new Error('give a local path; the tool never fetches a URL');
    if (o.explain && o.format === 'sarif') throw new Error('--explain adds the reasons of the checks to the text, markdown and JSON reports; the sarif format has no place for them');
    if (o.tracing) {
      if (o.format === 'sarif') throw new Error('a trace has no SARIF form; use text, markdown or json');
      for (const [flag, v] of [['--explain', o.explain ? true : null], ['--min-severity', o.minSeverity], ['--fail-on', o.failOn], ['--now', o.now], ['--yield-tolerance', o.yieldTolerance]]) if (v !== null) throw new Error(`${flag} belongs to the checks and is not used by a trace`);
    } else if (o.maxDepth !== null) throw new Error('--max-depth belongs to --trace-back and --trace-forward');
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`lot-genealogy-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    if (o.tracing) {
      const report = await traceFile({ path: o.paths[0], back: o.traceBack, forward: o.traceForward, maxDepth: o.maxDepth === null ? TRACE_LIMITS.defaultDepth : Number(o.maxDepth), version: VERSION, limits: merged, base });
      io.out(TRACES[o.format](report));
      return 0;
    }
    const report = await checkFile({ path: o.paths[0], minSeverity: o.minSeverity ?? 'info', failOn: o.failOn ?? 'error', now: o.now, tolerance: o.yieldTolerance === null ? undefined : readTolerance(o.yieldTolerance), version: VERSION, limits: merged, base });
    io.out(FORMATS[o.format](report, { explain: o.explain }));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`lot-genealogy-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else if (error instanceof TraceError) io.err(`lot-genealogy-check: no trace, ${clean(error.message)}\n`);
    else io.err(`lot-genealogy-check: ${clean(error.message)}\n`);
    return 2;
  }
}
