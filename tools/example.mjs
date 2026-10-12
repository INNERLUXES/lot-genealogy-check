// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// spreadsheets and the two traces to examples/output. CI runs it and then fails if those files changed, so the example output
// in the repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The moment the examples are checked at, in the made-up year of their dates; every path is relative to the root of the
// repository.
export const NOW = '2101-03-10T12:00:00Z';
export const BAD = ['examples/bad/events.csv', '--now', NOW];
export const GOOD = ['examples/good/events.csv', '--now', NOW];
export const TRACE_BACK = ['examples/good/events.csv', '--trace-back', 'FIN-E1'];
export const TRACE_FORWARD = ['examples/good/events.csv', '--trace-forward', 'PCB-B1'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad file: the counts, a finding of every check but one, and the result.
export const EXPECTED = [
  'rows: 38 (5 receive, 17 produce, 7 ship, 5 assemble, 2 scrap and 1 no known kind); 1 row left out as malformed',
  'columns: 15 in the header, 13 read, 1 not read',
  'findings: 28 (18 error, 6 warning, 4 info)',
  'The header has no "product" column, but the rows of produce, assemble and receive need it',
  'The column "Event Time" has the same name as column 3 once case and separators are ignored; only the first is read.',
  'The column "documentref" is not a column the tool reads, so the values under it are not checked. Did you mean document_ref?',
  'Row 32 has 4 cells but the header has 15; the row was left out of every other check.',
  'A cell of the column "site" is shaped like a mnemonic. The tool never reads a seed or a key, and the value is not shown.',
  'The event_type of row 33, "Recieve", is not one of receive, produce, ship, assemble, scrap. Did you mean receive?',
  'Row 34 (ship) has no value in the cell under "to_party", which a ship row needs.',
  'The quantity of row 35 (scrap) is zero; a quantity must be above zero.',
  'The quantity of row 36 (scrap), 3, has no unit in the unit column.',
  'The input_lots of row 37 (produce): entry 1, "RM-2:5", is not written lot:quantity:unit.',
  'The event_time of row 38 (produce), "2101-02-30T10:00:00Z", has the day 30, but month 02 of 2101 has 28 days.',
  'The event_time of row 39 (produce), 2101-04-20T08:00:00Z, is after the moment given with --now.',
  'By row 3 the produce event B-03 makes 120 kg in total, more than the 100 kg of its inputs.',
  'The produce event B-04 has inputs in kg and outputs in pieces, so the tool cannot compare what it makes with what it uses',
  'Row 5 (assemble) uses the input lot GHOST-9, which no receive or produce row of the file holds.',
  'Row 6 (assemble) uses the input lot LATE-1 at 2101-02-04T09:00:00Z, but the first row that receives or makes it, row 7, is dated 2101-02-10T08:00:00Z.',
  'By row 9 (ship) 150 kg of the lot OVR-1 have been shipped, scrapped or used by Acme Mill, but Acme Mill received or made only 100 kg of it.',
  'The serial SN-77 is made by row 13 (assemble) and was already made by row 12, on line 13',
  'The serial SN-88 is on the lot SER-3 at row 16, but on the lot SER-2 at row 14',
  'Row 20 (receive) is by Yard Logistics, but row 19 (ship) sends the lot CG-1 to Zenith Foods.',
  'Row 23 (ship): Zenith Foods ships the lot CG-2, but row 22 (ship) only sends it to Zenith Foods and no receive by Zenith Foods follows.',
  'Row 27 (receive) takes in the lot TR-1 at 2101-02-07T10:00:00Z, before row 26 (ship) sends it at 2101-02-08T10:00:00Z.',
  'Row 27 (receive) takes in the lot TR-1 at Zenith Foods, but no ship row of the file sends it there.',
  'Row 19 (ship) sends the lot CG-1 to Zenith Foods, but no receive row of the file takes it in there.',
  'The lot LOOP-A is made from LOOP-B, which is made from LOOP-A again.',
  'Row 31 has the same cells as row 7, on line 8, so one event is counted twice.',
  'The event_id of row 30, B-01, is also the event_id of row 1, on line 2',
  'This report checks the records in the file, not whether they are true, and it is not a certification of any kind.',
  'RESULT: FAIL - 18 findings at or above error (18 error, 6 warning, 4 info)'
];
// What must not be reported: the check the bad file cannot hold, the seed, and a pass.
export const UNWANTED = ['ERROR    file-unreadable', 'lantern', 'RESULT: PASS'];

// What the README says of the good file: no finding.
export const GOOD_EXPECTED = [
  'rows: 25 (8 receive, 4 produce, 8 ship, 4 assemble and 1 scrap)',
  'findings: 0',
  'RESULT: PASS - no finding at or above error'
];

// What the README says of the traces of the good file.
export const TRACE_EXPECTED = [
  'trace back from the lot FIN-E1: 4 lots upstream, 6 parties, 4 serial numbers',
  'E-013 (used to make FIN-E1)',
  'E-010 (used to make MOD-D1)'
];
export const FORWARD_EXPECTED = [
  'trace forward from the lot PCB-B1: 2 lots downstream, 4 parties, 4 serial numbers',
  'E-010 (made from PCB-B1)',
  'E-013 (made from MOD-D1)'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad file', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good file', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  // The good file also passes when warnings and notes fail the run.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // Without --now the good file still passes, and the report says that future-date did not run.
  expect('good, no --now', await run(['examples/good/events.csv']), 0, ['now: not given, so future-date did not run', 'note: no --now was given, so future-date did not run'], []);
  // A --now before the last time makes the good file fail.
  expect('good, earlier --now', await run(['examples/good/events.csv', '--now', '2101-01-15']), 1, ['ERROR    future-date', 'is after the moment given with --now.'], []);
  // The bad file with only the errors shown still counts the rest.
  expect('bad, errors only', await run([...BAD, '--min-severity', 'error']), 1, ['findings: 18 (18 error); 10 below error not shown'], ['WARNING  ', 'INFO     ']);
  // A yield tolerance of 20 percent lets the event that makes 120 kg from 100 kg pass.
  expect('bad, yield tolerance', await run([...BAD, '--yield-tolerance', '20']), 1, ['findings: 27 (18 error, 5 warning, 4 info)'], ['ERROR    mass-balance-exceeded', 'WARNING  mass-balance-exceeded']);
  // A file that is not there stops the run with no report, and so does a --now that is not a date and a lot that is not there.
  expect('missing file', await run(['examples/none/events.csv']), 2, ['examples/none/events.csv: does not exist'], [], 'err');
  expect('now that is not a date', await run([...GOOD.slice(0, 1), '--now', '10/03/2101']), 2, ['--now: 10/03/2101 is written like a date of the United States'], [], 'err');
  expect('lot that is not there', await run([...TRACE_BACK.slice(0, 1), '--trace-back', 'NOPE-1']), 2, ['the lot NOPE-1 is not in the file.'], [], 'err');

  const back = await run(TRACE_BACK);
  expect('trace back', back, 0, TRACE_EXPECTED, ['RESULT:']);
  const forward = await run(TRACE_FORWARD);
  expect('trace forward', forward, 0, FORWARD_EXPECTED, ['RESULT:']);

  // The README shows the head of the report of the bad file with its table of checks, one finding with its reason, the
  // table of event types and the end of the report, the end of the report of the good file and the trace back.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l.startsWith('Findings ('))).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad file differs from a real run');
  const explained = (await run([...BAD, '--explain'])).out.split('\n');
  const at = explained.findIndex((l) => l.includes('custody-gap') && l.includes('examples/bad/events.csv:21'));
  const sample = explained.slice(at, at + 5).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the sample finding of the custody gap differs from a real run');
  const t = lines.findIndex((l) => l.startsWith('Event types ('));
  const table = lines.slice(t, t + 10).join('\n');
  if (t < 0 || !readme.includes(table)) problems.push('README: the table of event types of the bad file differs from a real run');
  const tail = lines.slice(-4).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad file differs from a real run');
  const goodTail = good.out.split('\n').slice(-14).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good file differs from a real run');
  const traceBody = back.out.split('\n').slice(5, 15).join('\n');
  if (!readme.includes(traceBody)) problems.push('README: the sample trace back differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/bad.txt'), bad.out);
  await writeFile(resolve(root, 'examples/output/good.txt'), good.out);
  const outputs = [
    ['bad-explain.txt', [...BAD, '--explain'], 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad-explain.md', [...BAD, '--format', 'markdown', '--explain'], 1],
    ['bad.json', [...BAD, '--json', '--explain'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['trace-back.txt', TRACE_BACK, 0],
    ['trace-back.json', [...TRACE_BACK, '--json'], 0],
    ['trace-forward.txt', TRACE_FORWARD, 0],
    ['trace-forward.json', [...TRACE_FORWARD, '--json'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
