// A run: read the file as a table, look for keys and seeds in it, read the events, run the checks and build the report object
// that the formats write; or, for a trace, build the trace report from the same events.

import { checkAcross } from './across.js';
import { CSV_LIMITS, CsvError, cellAt, readTable } from './csv.js';
import { NOTICE } from './data.js';
import { formatDecimal, parseDecimal, ZERO } from './decimal.js';
import { readEvents } from './events.js';
import { FILE_LIMITS, InputError, displayPath, locateInput, readInputText } from './files.js';
import { createCollector } from './collect.js';
import { normalizeName } from './fields.js';
import { LEVELS } from './data.js';
import { RULES, decide, ruleById } from './rules.js';
import { findSecrets } from './secrets.js';
import { safeText } from './text.js';
import { TraceError, prepareTrace, traceLot } from './trace.js';

export const LIMITS = { ...FILE_LIMITS, ...CSV_LIMITS };

export { InputError, TraceError };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };

// The columns that hold identifiers. A cell of 64 hex digits in one of them is a hash used as an identifier, and is read as
// one and not as a private key in hex (docs/limits.md).
export const HEX_COLUMNS = ['event_id', 'lot', 'serial', 'document_ref'];

// The yield tolerance given as a percent: a plain decimal of at most 1,000, as a decimal; null when it is not one.
export function readTolerance(text) {
  const d = parseDecimal(text);
  if (d === null) return null;
  return d.int > 1000n * 10n ** BigInt(d.scale) ? null : d;
}

// The events of the text of a file, with no file system. Returns { table, model, summary, findings, notes, omitted }; model is
// null when the file cannot be read as events.
function read(text, { now, limits, tolerance }) {
  let table;
  try {
    table = readTable(text, { limits });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    return { table: null, model: null, summary: null, findings: [{ id: 'file-unreadable', line: error.line, column: error.column, message: `The file is not a table the reader can follow: ${error.message}. Nothing in the file was checked.`, subject: null }], notes: ['the file was not checked, because it is not a table the reader can follow'], omitted: new Map() };
  }
  if (table.rows.length === 0) {
    return { table, model: null, summary: null, findings: [{ id: 'file-unreadable', line: 1, column: 1, message: 'The file holds a header and no rows, so there is no event to check. Nothing in the file was checked.', subject: null }], notes: ['the file was not checked, because it holds no rows'], omitted: new Map() };
  }
  const hexColumns = new Set(table.header.cells.map((c, i) => (HEX_COLUMNS.includes(normalizeName(c)) ? i : -1)).filter((i) => i >= 0));
  const secrets = findSecrets(table, cellAt, hexColumns);
  const collector = createCollector();
  const { model, summary } = readEvents(table, collector, { now, tolerance });
  if (model !== null) checkAcross(model, collector.add);
  const notes = model === null ? ['the file was not checked, because it has no event_type column'] : [...table.notes, ...collector.notes];
  return { table, model, summary: summary ?? null, findings: [...secrets, ...collector.findings], notes, omitted: collector.omitted };
}

// The findings of the text of a events file, with no file system. Returns { table, model, analysis, findings, notes }.
export function checkText(text, { now = null, limits = CSV_LIMITS, tolerance = ZERO } = {}) {
  const r = read(text, { now, limits, tolerance });
  return { table: r.table, model: r.model, analysis: { findings: r.findings, notes: r.notes, summary: r.summary, omitted: r.omitted }, findings: r.findings, notes: r.notes };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// The report object for the findings of the file. file is { file, format, bytes, lines }.
export function buildReport({ file, checked, version, minSeverity = 'info', failOn = 'error', now = null, tolerance = ZERO }) {
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file: file.file,
      line: f.line,
      column: f.column,
      at: `${file.file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind,
      own: rule.own,
      context: rule.context ?? null
    };
  });
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.line - b.line || a.column - b.column || a.id.localeCompare(b.id, 'en'));
  const omitted = checked.analysis.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const summary = checked.analysis.summary;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  return {
    tool: 'lot-genealogy-check',
    version,
    input: { file: file.file, format: file.format, bytes: file.bytes, lines: file.lines },
    events: summary,
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: { minSeverity, failOn, now, yieldTolerance: formatDecimal(tolerance) },
    findings: shown,
    eventTypes: summary ? summary.types : null,
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

// Reads the events file and builds the report.
export async function checkFile({ path, minSeverity = 'info', failOn = 'error', now = null, tolerance = ZERO, version, limits = LIMITS, base = process.cwd() }) {
  const { text, file } = await load({ path, limits, base });
  const checked = checkText(text, { now, limits, tolerance });
  const format = checked.table ? (checked.table.delimiter === '\t' ? 'TSV' : 'CSV') : 'CSV';
  return buildReport({ file: { ...file, format }, checked, version, minSeverity, failOn, now, tolerance });
}

// Reads the events file and builds the report of a trace. back and forward are lots or null; at least one is given.
export async function traceFile({ path, back = null, forward = null, maxDepth, version, limits = LIMITS, base = process.cwd() }) {
  const { text, file } = await load({ path, limits, base });
  const r = read(text, { now: null, limits, tolerance: ZERO });
  if (r.model === null) throw new InputError([`${file.file}: ${r.findings[0].message}`]);
  const prepared = prepareTrace(r.model);
  const traces = [];
  if (back !== null) traces.push(traceLot(r.model, back, 'back', maxDepth, prepared));
  if (forward !== null) traces.push(traceLot(r.model, forward, 'forward', maxDepth, prepared));
  const notes = [];
  if (r.summary.skipped > 0) notes.push(`${r.summary.skipped} ${r.summary.skipped === 1 ? 'row was' : 'rows were'} left out as malformed`);
  const other = r.summary.types.find((t) => t.id === 'other');
  if (other) notes.push(`${other.rows} ${other.rows === 1 ? 'row has' : 'rows have'} no known kind of event and ${other.rows === 1 ? 'was' : 'were'} left out`);
  notes.push('the trace follows the input_lots of the produce and assemble rows; it does not run the checks, so use a normal run to see what is wrong in the file');
  return {
    tool: 'lot-genealogy-check',
    version,
    input: { file: file.file, format: r.table.delimiter === '\t' ? 'TSV' : 'CSV', bytes: file.bytes, lines: file.lines },
    events: r.summary,
    traces,
    notes: notes.map((n) => clean(n)),
    notice: NOTICE
  };
}
