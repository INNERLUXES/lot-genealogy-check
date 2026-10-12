import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, NOTICE, RULES, USAGE, VERSION, checkFile, listChecksJson, listChecksMarkdown, listChecksText, parseArgs, toJson, toMarkdown, toSarif, toText, toTraceJson, toTraceMarkdown, toTraceText, traceFile } from '../src/index.js';
import { ARGS, BAD, GOOD, NOW, assemble, clean, cli, produce, receive, run, scrap, ship, table, withFiles } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

test('parseArgs: every option, with the defaults when none is given', () => {
  const d = parseArgs(['events.csv']);
  assert.deepEqual(d.paths, ['events.csv']);
  assert.equal(d.format, 'text');
  for (const k of ['minSeverity', 'failOn', 'now', 'yieldTolerance', 'traceBack', 'traceForward', 'maxDepth']) assert.equal(d[k], null, k);
  assert.equal(d.tracing, false);
  const o = parseArgs(['events.csv', '--format', 'markdown', '--min-severity', 'warning', '--fail-on', 'info', '--now', NOW, '--yield-tolerance', '2.5', '--explain']);
  assert.deepEqual([o.format, o.minSeverity, o.failOn, o.now, o.yieldTolerance, o.explain], ['markdown', 'warning', 'info', NOW, '2.5', true]);
  assert.equal(parseArgs(['events.csv', '--json']).format, 'json');
  assert.equal(parseArgs(['events.csv', '--json', '--format', 'json']).format, 'json');
  assert.equal(parseArgs(['events.csv', '--trace-back', 'A', '--trace-forward', 'B', '--max-depth', '7']).tracing, true);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
  assert.equal(parseArgs(['--list-checks']).listChecks, true);
});

test('parseArgs: what is refused, each with a message that says why', () => {
  const refused = [
    [['--bogus', 'events.csv'], /unknown argument --bogus/],
    [['events.csv', '--format'], /--format needs a value/],
    [['events.csv', '--format', '--json'], /--format needs a value/],
    [['events.csv', '--format', 'xml'], /unknown format xml/],
    [['events.csv', '--json', '--format', 'sarif'], /ask for two formats/],
    [['events.csv', '--fail-on', 'high'], /--fail-on: unknown level high/],
    [['events.csv', '--min-severity', 'high'], /--min-severity: unknown level high/],
    [['events.csv', '--fail-on', 'error', '--fail-on', 'info'], /--fail-on was given twice/],
    [['events.csv', '--now', '10/03/2101'], /--now: 10\/03\/2101 is written like a date of the United States/],
    [['events.csv', '--now', '2101-02-30'], /--now: 2101-02-30 has the day 30/],
    [['events.csv', '--yield-tolerance', 'lots'], /not a plain number of percent from 0 to 1000/],
    [['events.csv', '--yield-tolerance', '-3'], /not a plain number of percent/],
    [['events.csv', '--yield-tolerance', '1001'], /not a plain number of percent/],
    [['events.csv', 'other.csv'], /give one events file/],
    [[], /give the events file/],
    [['-'], /reading from standard input is not supported/],
    [['events.csv', '--now', '-'], /reading from standard input is not supported/],
    [['https://example.com/events.csv'], /give a local path; the tool never fetches a URL/],
    [['events.csv', '--format', 'sarif', '--explain'], /the sarif format has no place for them/],
    [['--list-checks', '--format', 'sarif'], /--list-checks has no SARIF form/],
    [['events.csv', '--trace-back'], /--trace-back needs a value/],
    [['events.csv', '--trace-back', 'A', '--format', 'sarif'], /a trace has no SARIF form/],
    [['events.csv', '--trace-back', 'A', '--fail-on', 'info'], /--fail-on belongs to the checks and is not used by a trace/]
  ];
  for (const [argv, message] of refused) assert.throws(() => parseArgs(argv), message, argv.join(' '));
});

test('main: --help and --version print and exit with 0, a usage error prints the usage and exits with 2', async () => {
  const help = await cli(['--help'], root);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const id of RULES.map((r) => r.id)) assert.ok(USAGE.includes(id), id);
  for (const option of ['--format', '--json', '--min-severity', '--fail-on', '--now', '--yield-tolerance', '--explain', '--trace-back', '--trace-forward', '--max-depth', '--list-checks', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  const version = await cli(['--version'], root);
  assert.equal(version.out, `${VERSION}\n`);
  assert.equal(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version, VERSION);
  const wrong = await cli(['--nonsense'], root);
  assert.equal(wrong.code, 2);
  assert.match(wrong.err, /^lot-genealogy-check: unknown argument --nonsense\n\nUsage: lot-genealogy-check /);
  assert.equal(wrong.out, '');
});

test('main: exit codes 0, 1 and 2 follow --fail-on, and a finding below --min-severity is hidden but still counts', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  assert.equal((await run(BAD, ARGS)).code, 1);
  const warn = { 'events.csv': table([produce({ event_id: 'E-1' }), produce({ event_id: 'E-1', lot: 'RM-2', event_time: '2101-02-02T08:00:00Z' })]) };
  const quiet = await run(warn, ARGS);
  assert.equal(quiet.code, 0, 'a warning does not fail the default run');
  assert.match(quiet.out, /RESULT: PASS - no finding at or above error \(1 warning\)/);
  assert.equal((await run(warn, [...ARGS, '--fail-on', 'warning'])).code, 1);
  const hidden = await run(warn, [...ARGS, '--min-severity', 'error', '--fail-on', 'warning']);
  assert.equal(hidden.code, 1, 'the hidden warning still counts');
  assert.match(hidden.out, /findings: 0; 1 below error not shown/);
  assert.doesNotMatch(hidden.out, /WARNING /);
  const info = { 'events.csv': table([produce(), ship()]) };
  assert.equal((await run(info, ARGS)).code, 0);
  assert.equal((await run(info, [...ARGS, '--fail-on', 'info'])).code, 1);
  assert.equal((await run({}, ['nothing.csv'])).code, 2);
});

test('main: an absolute path, a path with a folder and a --now before the last time', async () => {
  await withFiles({ 'in/events.csv': table(clean()) }, async (dir) => {
    const absolute = await cli([resolve(dir, 'in/events.csv'), '--now', NOW], process.cwd());
    assert.equal(absolute.code, 0, absolute.err);
    const relative = await cli(['in/events.csv', '--now', '2101-02-03'], dir);
    assert.equal(relative.code, 1);
    assert.match(relative.out, /ERROR {4}future-date +in\/events\.csv:\d+/);
  });
});

test('main: --yield-tolerance lets a gain through up to the percent given', async () => {
  const files = { 'events.csv': table([produce(), assemble({ quantity: '11', input_lots: 'RM-1:10:kg' })]) };
  assert.match((await run(files, ARGS)).out, /WARNING {2}mass-balance-exceeded/);
  const ok = await run(files, [...ARGS, '--yield-tolerance', '10']);
  assert.doesNotMatch(ok.out, /mass-balance-exceeded +events/);
  assert.match(ok.out, /\nyield tolerance: 10 percent\n/);
});

test('the text report: the head, the table of checks, the findings with their fix, the table of event types and the result', async () => {
  const r = await run(BAD, [...ARGS, '--now', NOW]);
  const lines = r.out.split('\n');
  assert.equal(lines[0], 'lot-genealogy-check: events.csv');
  assert.match(lines[1], /^file: events\.csv \(CSV, 2 lines, [\d,]+ bytes\)$/);
  assert.ok(lines.includes('rows: 1 (1 produce)'));
  assert.ok(lines.includes('findings: 1 (1 error)'));
  assert.ok(lines.some((l) => /^ {2}date-invalid +error +row +1$/.test(l)), 'the table of checks');
  assert.match(r.out, /\n {2}ERROR {4}date-invalid +events\.csv:2\n {11}The event_time of row 1 \(produce\)/);
  assert.match(r.out, /\n {11}fix: Write the time as YYYY-MM-DD/);
  assert.match(r.out, /\nEvent types \(1\)\n\n {2}event type +rows +lots\n {2}produce +1 +1\n/);
  assert.ok(r.out.endsWith('\nRESULT: FAIL - 1 finding at or above error (1 error)\n'));
  assert.ok(r.out.includes(NOTICE));
  assert.ok(r.out.includes('note: no --now was given, so future-date did not run') === false);
  assert.ok((await run(BAD, ARGS)).out.includes('note: no --now was given, so future-date did not run'));
});

test('--explain adds why each check exists and its context to the text, markdown and JSON reports', async () => {
  const files = { 'events.csv': table([produce(), assemble({ lot: 'LOOP', input_lots: 'LOOP:1:kg', quantity: '1', party: 'Acme Mill' })]) };
  const text = await run(files, [...ARGS, '--explain']);
  assert.match(text.out, /\n {11}why: Refusing a loop in the genealogy is a best practice of this tool; no regulation sets it; a trace backward from a lot in a loop never ends\n/);
  assert.match(text.out, /\n {11}context: GS1 EPCIS has an event type for an event that uses input items or lots and makes output items or lots/);
  assert.doesNotMatch((await run(files, ARGS)).out, /why: /);
  const md = await run(files, [...ARGS, '--format', 'markdown', '--explain']);
  assert.match(md.out, /\n## Why\n\n### genealogy-loop\n\n- Refusing a loop/);
  const json = JSON.parse((await run(files, [...ARGS, '--json', '--explain'])).out);
  assert.match(json.findings.find((f) => f.id === 'genealogy-loop').own, /best practice of this tool/);
  assert.equal(JSON.parse((await run(files, [...ARGS, '--json'])).out).findings[0].own, undefined);
});

test('the JSON report: the tool, the file, the events read, the totals, every check, every finding and the result', async () => {
  const r = JSON.parse((await run(BAD, [...ARGS, '--json'])).out);
  assert.equal(r.tool, 'lot-genealogy-check');
  assert.equal(r.version, VERSION);
  assert.deepEqual(Object.keys(r.input), ['file', 'format', 'bytes', 'lines']);
  assert.equal(r.events.rows, 1);
  assert.deepEqual(r.totals, { findings: 1, byLevel: { error: 1, warning: 0, info: 0 }, hidden: 0 });
  assert.equal(r.rules.length, RULES.length);
  assert.deepEqual(r.rules.find((x) => x.id === 'date-invalid'), { id: 'date-invalid', level: 'error', kind: 'row', findings: 1 });
  const f = r.findings[0];
  assert.deepEqual(Object.keys(f).sort(), ['at', 'column', 'file', 'fix', 'id', 'kind', 'line', 'message', 'severity', 'subject']);
  assert.equal(f.at, 'events.csv:2');
  assert.equal(f.subject, 'RM-1');
  assert.equal(r.options.now, null);
  assert.equal(r.result.pass, false);
  assert.equal(r.notice, NOTICE);
});

test('the SARIF report: the checks as rules, one result for each finding with its line and column, levels note, warning and error', async () => {
  const files = { 'events.csv': table([produce({ event_time: '2101-02-30' }), produce({ event_id: 'E-1', lot: 'RM-2' }), ship({ event_id: 'S-1', lot: 'RM-2' })]) };
  const s = JSON.parse((await run(files, [...ARGS, '--format', 'sarif'])).out);
  assert.equal(s.version, '2.1.0');
  const [runOne] = s.runs;
  assert.equal(runOne.tool.driver.name, 'lot-genealogy-check');
  assert.equal(runOne.tool.driver.informationUri, 'https://github.com/INNERLUXES/lot-genealogy-check');
  assert.deepEqual(runOne.tool.driver.rules.map((r) => r.id), RULES.map((r) => r.id));
  const byRule = new Map(runOne.results.map((r) => [r.ruleId, r]));
  assert.equal(byRule.get('date-invalid').level, 'error');
  assert.equal(byRule.get('event-id-repeated').level, 'warning');
  assert.equal(byRule.get('ship-without-receive').level, 'note');
  const where = byRule.get('date-invalid').locations[0].physicalLocation;
  assert.equal(where.region.startLine, 2);
  assert.equal(where.artifactLocation.uri, 'events.csv');
  assert.equal(runOne.tool.driver.rules[runOne.results[0].ruleIndex].id, runOne.results[0].ruleId);
});

test('the markdown report: a table of findings with the cells escaped, so a cell cannot add a link, a row or a tag', async () => {
  const nasty = '[x](http://example.invalid) | `code` <b>bold</b> * _under_';
  const files = { 'events.csv': table([produce({ event_time: nasty })]) };
  const r = await run(files, [...ARGS, '--format', 'markdown']);
  const row = r.out.split('\n').find((l) => l.startsWith('| error | date-invalid'));
  assert.ok(row);
  const bare = row.replace(/\\./g, '');
  assert.equal(bare.split('|').length - 1, 5, 'a bar in a cell does not add a column');
  assert.doesNotMatch(bare, /[[\]<>()`*_#!~{}]/, 'nothing markdown acts on is left bare');
  assert.ok(row.includes('\\[x\\]\\(http://example.invalid\\)'));
  assert.ok(!r.out.includes('<b>'));
  assert.match(r.out, /^# lot-genealogy-check: events\.csv\n/);
  assert.match(r.out, /\n- Result: \*\*FAIL - 1 finding at or above error \\\(1 error\\\)\*\*\n/);
});

test('text from the file never reaches the output as a control, line separator or direction character', async () => {
  // Built from code points, so that this file holds only ASCII.
  const unsafe = [0x1b, 0x202e, 0x2028, 0x2029, 0x85, 0x200f, 0x2066].map((c) => String.fromCharCode(c)).join('');
  const bad = `Acme${unsafe} Mill`;
  const files = { 'events.csv': table([produce({ event_time: bad })]) };
  const pattern = [0x00, 0x08, 0x0b, 0x1f, 0x7f, 0x9f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069, 0x200e, 0x200f].map((c) => String.fromCharCode(c));
  const found = (text) => [...text.replace(/\n/g, '')].some((ch) => {
    const c = ch.charCodeAt(0);
    return c <= 8 || (c >= 0x0b && c <= 0x1f) || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x200e || c === 0x200f;
  });
  assert.equal(pattern.length, 14);
  assert.ok(found(`a${String.fromCharCode(0x202e)}b`), 'the detector sees a direction character');
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const r = await run(files, [...ARGS, '--format', format]);
    assert.ok(!found(r.out), format);
  }
  const name = `events${String.fromCharCode(0x202e)}.csv`;
  const r = await run({ [name]: table(clean()) }, [name]);
  assert.ok(!found(r.out));
  assert.match(r.out, /^lot-genealogy-check: events\s?\.csv\n/);
});

test('the list of checks in text, markdown and JSON names every check once', async () => {
  const text = (await cli(['--list-checks'], root)).out;
  const md = (await cli(['--list-checks', '--format', 'markdown'], root)).out;
  const json = JSON.parse((await cli(['--list-checks', '--json'], root)).out);
  assert.deepEqual(json.map((x) => x.id), RULES.map((r) => r.id));
  for (const r of RULES) {
    assert.equal(text.split(`  ${r.id} `).length - 1, 1, r.id);
    assert.ok(md.includes(`| ${r.id} | ${r.severity} | ${r.kind} |`), r.id);
  }
  assert.match(text, /Every check is a best practice of this tool; no regulation sets any of them\./);
  assert.ok(json.every((x) => x.own && x.fix && x.summary));
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
});

test('the report of a run with no finding says so in every format, and a scrap and a receive count as rows', async () => {
  const files = { 'events.csv': table([produce(), ship(), receive(), scrap()]) };
  const text = await run(files, [...ARGS, '--now', NOW]);
  assert.equal(text.code, 0);
  assert.match(text.out, /\nrows: 4 \(1 receive, 1 produce, 1 ship and 1 scrap\)\n/);
  assert.match(text.out, /\nFindings \(0\)\n\n {2}none\n/);
  assert.match((await run(files, [...ARGS, '--format', 'markdown'])).out, /\n## Findings\n\nNone\.\n/);
  assert.deepEqual(JSON.parse((await run(files, [...ARGS, '--json'])).out).findings, []);
  assert.deepEqual(JSON.parse((await run(files, [...ARGS, '--format', 'sarif'])).out).runs[0].results, []);
});

test('the formats are functions of the report object: the same report gives text, markdown, JSON and SARIF, and a trace gives text, markdown and JSON', async () => {
  await withFiles(BAD, async (dir) => {
    const report = await checkFile({ path: 'events.csv', version: '9.9.9', base: dir });
    assert.ok(toText(report).startsWith('lot-genealogy-check: events.csv\n'));
    assert.ok(toMarkdown(report).startsWith('# lot-genealogy-check: events.csv\n'));
    assert.equal(JSON.parse(toJson(report)).version, '9.9.9');
    assert.equal(JSON.parse(toSarif(report)).runs[0].tool.driver.version, '9.9.9');
    assert.ok(listChecksText().includes('date-invalid'));
    assert.ok(listChecksMarkdown().startsWith('# lot-genealogy-check checks\n'));
    assert.equal(JSON.parse(listChecksJson()).length, RULES.length);
  });
  await withFiles(GOOD, async (dir) => {
    const trace = await traceFile({ path: 'events.csv', back: 'FIN-1', version: '9.9.9', base: dir });
    assert.ok(toTraceText(trace).includes('trace back from the lot FIN-1: 1 lot upstream, 2 parties, 0 serial numbers'));
    assert.ok(toTraceMarkdown(trace).includes('## trace back from the lot FIN-1'));
    assert.equal(JSON.parse(toTraceJson(trace)).traces[0].lot, 'FIN-1');
  });
});
