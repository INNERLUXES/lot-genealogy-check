// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools and SARIF for code
// scanning, and the same three but SARIF for a trace. Every text that comes from the input (a file name, a cell, a lot) was
// cleaned by safeText before it reached the report object. The markdown format also escapes what markdown gives a meaning
// to, and the SARIF format is built as an object and written by JSON.stringify.

import { RULES } from './rules.js';
import { grouped, listText, plural } from './size.js';

const URI = 'https://github.com/INNERLUXES/lot-genealogy-check';

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (r) => `${r.input.file} (${r.input.format}, ${plural(r.input.lines, 'line')}, ${plural(r.input.bytes, 'byte')})`;

function rowsText(s) {
  const types = s.types.map((t) => `${grouped(t.rows)} ${t.label}`);
  const skipped = s.skipped ? `; ${plural(s.skipped, 'row')} left out as malformed` : '';
  return `${grouped(s.rows)}${types.length ? ` (${listText(types, 8)})` : ''}${skipped}`;
}

// What the file says, a line for each part.
function eventLines(r) {
  const s = r.events;
  if (!s) return [['events', 'not read']];
  const lines = [
    ['rows', rowsText(s)],
    ['columns', `${grouped(s.columns)} in the header, ${grouped(s.read)} read, ${grouped(s.unread)} not read`],
    ['lots', `${plural(s.lots, 'lot')}, ${plural(s.parties, 'party', 'parties')}, ${plural(s.serials, 'serial number')}`],
    ['event times', s.firstTime === null ? 'none read' : s.firstTime === s.lastTime ? s.firstTime : `from ${s.firstTime} to ${s.lastTime}`]
  ];
  if (r.options) {
    lines.push(['now', r.options.now === null ? 'not given, so future-date did not run' : `${r.options.now}, from --now`]);
    lines.push(['yield tolerance', `${r.options.yieldTolerance} percent`]);
  }
  return lines;
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const TYPE_HEAD = ['event type', 'rows', 'lots'];
const typeRows = (r) => r.eventTypes.map((t) => [t.label, grouped(t.rows), grouped(t.lots)]);

const PAD = ' '.repeat(11);

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`lot-genealogy-check: ${r.input.file}`);
  out.push(`file: ${fileLine(r)}`);
  for (const [k, v] of eventLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Checks (${grouped(r.rules.length)})`, '');
  out.push(...table(['check', 'level', 'kind', 'findings'], r.rules.map((x) => [x.id, x.level, x.kind, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    if (explain) {
      out.push(`${PAD}why: ${f.own}`);
      if (f.context) out.push(`${PAD}context: ${f.context}`);
    }
    out.push('');
  }
  if (r.eventTypes && r.eventTypes.length) out.push(`Event types (${grouped(r.eventTypes.length)})`, '', ...table(TYPE_HEAD, typeRows(r)), '');
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

export function toMarkdown(r, { explain = false } = {}) {
  const out = [];
  out.push(`# lot-genealogy-check: ${md(r.input.file)}`, '');
  out.push(`- File: ${md(fileLine(r))}`);
  for (const [k, v] of eventLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  if (explain) {
    out.push('## Why', '');
    const seen = new Set();
    for (const f of r.findings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(`### ${f.id}`, '', `- ${md(f.own)}`);
      if (f.context) out.push(`- Context: ${md(f.context)}`);
      out.push('');
    }
  }
  if (r.eventTypes && r.eventTypes.length) {
    out.push(`## Event types (${grouped(r.eventTypes.length)})`, '');
    out.push('| Event type | Rows | Lots |', '| --- | --- | --- |');
    for (const row of typeRows(r)) out.push(`| ${row.map(md).join(' | ')} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, own: undefined, context: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the events file as the artifact, and one result for each finding with its
// line and column. The table of event types has no place in SARIF and is left out.
export function toSarif(r) {
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'lot-genealogy-check',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: [{ location: { uri: r.input.file } }],
        results: r.findings.map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: 0 }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['lot-genealogy-check checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(11)}  ${x.summary}`);
  out.push('', 'Every check is a best practice of this tool; no regulation sets any of them. A check of the file is about the file itself, a check of a row is found from one row, and a check across rows puts rows side by side. The tool checks the records in a file, not whether they are true, and it is not a certification of any kind.', '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# lot-genealogy-check checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, context: x.context ?? null })), null, 2)}\n`;
}

// ---- the trace ----

function traceHead(t) {
  const way = t.direction === 'back' ? 'back from' : 'forward from';
  const noun = t.direction === 'back' ? 'upstream' : 'downstream';
  return `trace ${way} the lot ${t.lot}: ${plural(t.lotsReached, 'lot')} ${noun}, ${plural(t.partiesTotal, 'party', 'parties')}, ${plural(t.serialsTotal, 'serial number')}`;
}

const items = (list, total, max = 4) => {
  if (total === 0) return '-';
  const shown = list.slice(0, max);
  return total > shown.length ? `${shown.join(', ')} and ${grouped(total - shown.length)} more` : shown.join(', ');
};

function traceRows(t) {
  return t.lots.map((l) => [String(l.depth), l.lot, l.product ?? '-', items(l.parties, l.partiesTotal), items(l.serials, l.serialsTotal), l.via ? `${l.via.event} (${t.direction === 'back' ? 'used to make' : 'made from'} ${l.via.lot})` : 'the lot asked for']);
}

export function toTraceText(r) {
  const out = [`lot-genealogy-check: ${r.input.file}`, `file: ${fileLine(r)}`, ...eventLines(r).filter(([k]) => ['rows', 'columns', 'lots'].includes(k)).map(([k, v]) => `${k}: ${v}`), ''];
  for (const t of r.traces) {
    out.push(traceHead(t));
    out.push(`depth limit: ${grouped(t.maxDepth)}, depth reached: ${grouped(t.depthReached)}${t.stoppedAtDepth ? '; the walk stopped at the depth limit and more lots lie beyond it' : ''}`);
    out.push(`parties: ${items(t.parties, t.partiesTotal, 10)}`);
    out.push(`serial numbers: ${items(t.serials, t.serialsTotal, 10)}`, '');
    out.push(...table(['depth', 'lot', 'product', 'parties', 'serials', 'reached through'], traceRows(t)), '');
    if (t.lotsReached + 1 > t.listed) out.push(`  and ${grouped(t.lotsReached + 1 - t.listed)} more lots not listed`, '');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  out.push('', r.notice);
  return `${out.join('\n')}\n`;
}

export function toTraceMarkdown(r) {
  const out = [`# lot-genealogy-check: ${md(r.input.file)}`, '', `- File: ${md(fileLine(r))}`];
  for (const [k, v] of eventLines(r).filter(([key]) => ['rows', 'columns', 'lots'].includes(key))) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push('');
  for (const t of r.traces) {
    out.push(`## ${md(traceHead(t))}`, '');
    out.push(`- Depth limit: ${grouped(t.maxDepth)}, depth reached: ${grouped(t.depthReached)}${t.stoppedAtDepth ? '; the walk stopped at the depth limit and more lots lie beyond it' : ''}`);
    out.push(`- Parties: ${md(items(t.parties, t.partiesTotal, 10))}`);
    out.push(`- Serial numbers: ${md(items(t.serials, t.serialsTotal, 10))}`, '');
    out.push('| Depth | Lot | Product | Parties | Serials | Reached through |', '| --- | --- | --- | --- | --- | --- |');
    for (const row of traceRows(t)) out.push(`| ${row.map(md).join(' | ')} |`);
    out.push('');
    if (t.lotsReached + 1 > t.listed) out.push(`And ${grouped(t.lotsReached + 1 - t.listed)} more lots not listed.`, '');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(md(r.notice), '');
  return out.join('\n');
}

export function toTraceJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}
