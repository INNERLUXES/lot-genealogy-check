import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_SHOWN, TRACE_LIMITS, TraceError, buildGraph, checkText, findLoops, lotInfo, prepareTrace, reach, traceFile, traceLot } from '../src/index.js';
import { ARGS, DEPOT, MILL, assemble, cli, produce, receive, run, ship, table, withFiles } from './helpers.js';

// A genealogy: RM-1 and RM-2 are made at the mill; PART-1 is made from both; FIN-1 and FIN-2 are made from PART-1 and a
// second raw lot; FIN-1 goes to the depot with two serial numbers.
const rows = () => [
  produce({ event_id: 'P-1', lot: 'RM-1', product: 'Resin', quantity: '100' }),
  produce({ event_id: 'P-2', lot: 'RM-2', product: 'Dye', quantity: '20' }),
  produce({ event_id: 'P-3', lot: 'PART-1', product: 'Housing', quantity: '90', input_lots: 'RM-1:80:kg;RM-2:10:kg', event_time: '2101-02-02T08:00:00Z' }),
  assemble({ event_id: 'A-1', party: MILL, lot: 'FIN-1', serial: 'SN-1', product: 'Sensor', quantity: '1', input_lots: 'PART-1:1:kg', event_time: '2101-02-03T08:00:00Z' }),
  assemble({ event_id: 'A-2', party: MILL, lot: 'FIN-1', serial: 'SN-2', product: 'Sensor', quantity: '1', input_lots: 'PART-1:1:kg', event_time: '2101-02-03T08:00:00Z' }),
  assemble({ event_id: 'A-3', party: MILL, lot: 'FIN-2', serial: 'SN-3', product: 'Sensor mini', quantity: '1', input_lots: 'PART-1:1:kg;RM-2:1:kg', event_time: '2101-02-04T08:00:00Z' }),
  ship({ event_id: 'S-1', lot: 'FIN-1', to_party: DEPOT, quantity: '2', event_time: '2101-02-05T08:00:00Z' }),
  receive({ event_id: 'R-1', lot: 'FIN-1', product: 'Sensor', quantity: '2', event_time: '2101-02-06T08:00:00Z' })
];
const model = () => checkText(table(rows())).model;

test('traceLot back: the lots a lot is made from, nearest first, each once, with products, parties and serial numbers', () => {
  const t = traceLot(model(), 'FIN-2', 'back');
  assert.deepEqual(t.lots.map((l) => [l.lot, l.depth]), [['FIN-2', 0], ['PART-1', 1], ['RM-2', 1], ['RM-1', 2]]);
  assert.equal(t.lotsReached, 3);
  assert.equal(t.depthReached, 2);
  assert.equal(t.stoppedAtDepth, false);
  assert.equal(t.lots[0].via, null);
  assert.deepEqual(t.lots[1].via, { event: 'A-3', row: 6, lot: 'FIN-2' });
  assert.deepEqual(t.lots[3].via, { event: 'P-3', row: 3, lot: 'PART-1' });
  assert.equal(t.lots[0].product, 'Sensor mini');
  assert.deepEqual(t.lots[0].serials, ['SN-3']);
  assert.deepEqual(t.parties, [MILL]);
  assert.deepEqual(t.serials, ['SN-3']);
});

test('traceLot forward: the lots made from a lot, the parties it went to and the serial numbers on the way', () => {
  const t = traceLot(model(), 'RM-2', 'forward');
  assert.deepEqual(t.lots.map((l) => [l.lot, l.depth]), [['RM-2', 0], ['PART-1', 1], ['FIN-2', 1], ['FIN-1', 2]]);
  assert.deepEqual(t.parties, [MILL, DEPOT]);
  assert.deepEqual(t.serials, ['SN-3', 'SN-1', 'SN-2']);
  assert.equal(t.serialsTotal, 3);
  assert.deepEqual(t.lots.find((l) => l.lot === 'FIN-1').parties, [MILL, DEPOT]);
  assert.equal(traceLot(model(), 'FIN-1', 'forward').lotsReached, 0);
  assert.equal(traceLot(model(), 'RM-1', 'back').lotsReached, 0);
});

test('traceLot: the depth limit stops the walk and says so; a limit that is not reached does not', () => {
  const one = traceLot(model(), 'FIN-2', 'back', 1);
  assert.deepEqual(one.lots.map((l) => l.lot), ['FIN-2', 'PART-1', 'RM-2']);
  assert.equal(one.stoppedAtDepth, true);
  assert.equal(traceLot(model(), 'FIN-2', 'back', 2).stoppedAtDepth, false);
  assert.equal(traceLot(model(), 'FIN-2', 'back', 2).lotsReached, 3);
  assert.equal(traceLot(model(), 'FIN-2', 'back', 100).stoppedAtDepth, false);
});

test('traceLot: a loop in the file ends the walk, each lot once', () => {
  const loop = [produce({ event_id: 'E-1', lot: 'A', quantity: '1', input_lots: 'B:1:kg' }), produce({ event_id: 'E-2', lot: 'B', quantity: '1', input_lots: 'C:1:kg' }), produce({ event_id: 'E-3', lot: 'C', quantity: '1', input_lots: 'A:1:kg' })];
  const m = checkText(table(loop)).model;
  assert.deepEqual(traceLot(m, 'A', 'back').lots.map((l) => l.lot), ['A', 'B', 'C']);
  assert.deepEqual(traceLot(m, 'A', 'forward').lots.map((l) => l.lot), ['A', 'C', 'B']);
  const self = checkText(table([produce({ lot: 'A', quantity: '1', input_lots: 'A:1:kg' })])).model;
  assert.deepEqual(traceLot(self, 'A', 'back').lots.map((l) => l.lot), ['A']);
});

test('traceLot: a lot named only in an input_lots is reached and listed with nothing known about it', () => {
  const m = checkText(table([assemble({ lot: 'F', input_lots: 'GHOST-1:1:kg', quantity: '1' })])).model;
  const t = traceLot(m, 'F', 'back');
  assert.deepEqual(t.lots.map((l) => [l.lot, l.product, l.rows, l.partiesTotal]), [['F', 'Garden sensor', 1, 1], ['GHOST-1', null, 0, 0]]);
});

test('traceLot: a lot that is not in the file is an error that says so, and names the lot a serial number is on', () => {
  assert.throws(() => traceLot(model(), 'NOPE-1', 'back'), (e) => e instanceof TraceError && e.message === 'the lot NOPE-1 is not in the file.');
  assert.throws(() => traceLot(model(), 'SN-2', 'forward'), /the lot SN-2 is not in the file\. SN-2 is a serial number on the lot FIN-1; trace that lot\./);
  assert.throws(() => traceLot(model(), '__proto__', 'back'), /is not in the file/);
});

test('traceLot: long lists are cut and counted, and the prepared graphs give the same trace', () => {
  const many = Array.from({ length: 30 }, (_, i) => produce({ event_id: `E-${i}`, lot: 'ONE', serial: `SN-${i}`, party: `Party ${i}`, quantity: '1' }));
  const t = traceLot(checkText(table(many)).model, 'ONE', 'back');
  assert.equal(t.lots[0].serials.length, TRACE_LIMITS.listedItems);
  assert.equal(t.lots[0].serialsTotal, 30);
  assert.equal(t.lots[0].partiesTotal, 30);
  assert.equal(t.serials.length, 30);
  const m = model();
  assert.deepEqual(traceLot(m, 'FIN-2', 'back', 5, prepareTrace(m)), traceLot(m, 'FIN-2', 'back', 5));
  assert.ok(lotInfo(m).has('RM-1'));
});

test('reach: breadth first with the depth of each lot, the edge it was reached by, and cycles that end the walk', () => {
  const graph = new Map([['a', [{ lot: 'b', ev: 1 }, { lot: 'c', ev: 2 }]], ['b', [{ lot: 'd', ev: 3 }]], ['c', [{ lot: 'd', ev: 4 }, { lot: 'a', ev: 5 }]], ['d', [{ lot: 'b', ev: 6 }]]]);
  const r = reach(graph, 'a', 10);
  assert.deepEqual(r.order, ['a', 'b', 'c', 'd']);
  assert.deepEqual([...r.depth], [['a', 0], ['b', 1], ['c', 1], ['d', 2]]);
  assert.deepEqual(r.parent.get('d'), { from: 'b', ev: 3 });
  assert.equal(r.truncated, false);
  const cut = reach(graph, 'a', 1);
  assert.deepEqual(cut.order, ['a', 'b', 'c']);
  assert.equal(cut.truncated, true);
  assert.deepEqual(reach(new Map(), 'x', 3).order, ['x']);
});

test('findLoops: loops by the edge that closes them, a self loop, loops that share a lot, and no loop in a diamond', () => {
  const g = (o) => new Map(Object.entries(o).map(([k, v]) => [k, v.map((lot) => ({ lot, ev: `${k}>${lot}` }))]));
  assert.deepEqual(findLoops(g({ a: ['a'] })).map((l) => [l.lots, l.length, l.edge.ev]), [[['a'], 1, 'a>a']]);
  assert.deepEqual(findLoops(g({ a: ['b'], b: ['c'], c: ['a'] })).map((l) => [l.lots, l.length, l.edge.ev]), [[['a', 'b', 'c'], 3, 'c>a']]);
  assert.deepEqual(findLoops(g({ a: ['b'], b: ['a', 'c'], c: ['b'] })).map((l) => l.edge.ev), ['b>a', 'c>b']);
  assert.deepEqual(findLoops(g({ d: ['b', 'c'], b: ['a'], c: ['a'], a: [] })), []);
  assert.deepEqual(findLoops(new Map()), []);
  const long = Object.fromEntries(Array.from({ length: LOOP_SHOWN + 4 }, (_, i) => [`l${i}`, [`l${(i + 1) % (LOOP_SHOWN + 4)}`]]));
  const [one] = findLoops(g(long));
  assert.equal(one.lots.length, LOOP_SHOWN);
  assert.equal(one.length, LOOP_SHOWN + 4);
});

test('buildGraph: edges from each output lot to its inputs, and the reverse', () => {
  const m = model();
  assert.deepEqual(buildGraph(m).get('PART-1').map((e) => e.lot), ['RM-1', 'RM-2']);
  assert.deepEqual(buildGraph(m, { reverse: true }).get('RM-2').map((e) => e.lot), ['PART-1', 'FIN-2']);
  assert.equal(buildGraph(m).has('RM-1'), false);
});

test('trace on the command line: text, markdown and JSON, both directions at once, exit code 0 and no checks run', async () => {
  const files = { 'events.csv': table(rows()) };
  const text = await run(files, [...ARGS, '--trace-back', 'FIN-2']);
  assert.equal(text.code, 0, text.err);
  assert.match(text.out, /\ntrace back from the lot FIN-2: 3 lots upstream, 1 party, 1 serial number\n/);
  assert.match(text.out, /\n {2}1 {6}PART-1 +Housing +Acme Mill +- +A-3 \(used to make FIN-2\)\n/);
  assert.doesNotMatch(text.out, /RESULT|Findings|Checks \(/);
  const both = await run(files, [...ARGS, '--trace-back', 'FIN-2', '--trace-forward', 'RM-1', '--format', 'markdown']);
  assert.equal(both.code, 0);
  assert.match(both.out, /^## trace back from the lot FIN-2/m);
  assert.match(both.out, /^## trace forward from the lot RM-1: 3 lots downstream, 2 parties, 3 serial numbers/m);
  assert.match(both.out, /\| 1 \| PART-1 \| Housing \| Acme Mill \| - \| A-3 \\\(used to make FIN-2\\\) \|/);
  const json = JSON.parse((await run(files, [...ARGS, '--trace-forward', 'RM-2', '--json'])).out);
  assert.equal(json.tool, 'lot-genealogy-check');
  assert.equal(json.traces.length, 1);
  assert.equal(json.traces[0].direction, 'forward');
  assert.equal(json.traces[0].lotsReached, 3);
  assert.equal(json.findings, undefined);
});

test('trace on the command line: a lot that is not there, a file that cannot be read and options that belong to the checks are exit code 2', async () => {
  const files = { 'events.csv': table(rows()), 'nokind.csv': 'event_id,lot\nE-1,A\n' };
  const missing = await run(files, [...ARGS, '--trace-back', 'NOPE']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /^lot-genealogy-check: no trace, the lot NOPE is not in the file\.\n$/);
  assert.equal(missing.out, '');
  const unreadable = await run(files, ['nokind.csv', '--trace-back', 'A']);
  assert.equal(unreadable.code, 2);
  assert.match(unreadable.err, /nokind\.csv: The header has no event_type column/);
  for (const extra of [['--explain'], ['--fail-on', 'info'], ['--min-severity', 'error'], ['--now', '2101-03-01'], ['--yield-tolerance', '5'], ['--format', 'sarif']]) {
    const r = await run(files, [...ARGS, '--trace-back', 'FIN-1', ...extra]);
    assert.equal(r.code, 2, extra.join(' '));
    assert.match(r.err, /belongs to the checks and is not used by a trace|a trace has no SARIF form/, extra.join(' '));
  }
  const depth = await run(files, [...ARGS, '--max-depth', '5']);
  assert.equal(depth.code, 2);
  assert.match(depth.err, /--max-depth belongs to --trace-back and --trace-forward/);
  for (const bad of ['0', '-1', '1.5', 'abc', '1000001']) assert.equal((await run(files, [...ARGS, '--trace-back', 'FIN-1', '--max-depth', bad])).code, 2, bad);
  assert.equal((await run(files, [...ARGS, '--trace-back', 'FIN-1', '--max-depth', '1'])).code, 0);
  assert.equal((await run(files, [...ARGS, '--trace-back', 'A', '--trace-back', 'B'])).code, 2, 'an option given twice');
});

test('trace on the command line: rows that were left out are a note, and a trace of a depth limit says that it stopped', async () => {
  const text = `${table(rows())}E-99,produce\n`;
  const r = await run({ 'events.csv': text }, [...ARGS, '--trace-back', 'FIN-2', '--max-depth', '1']);
  assert.equal(r.code, 0);
  assert.match(r.out, /note: 1 row was left out as malformed/);
  assert.match(r.out, /the walk stopped at the depth limit and more lots lie beyond it/);
  const kind = await run({ 'events.csv': table([...rows(), { event_type: 'bogus', lot: 'X' }]) }, [...ARGS, '--trace-back', 'FIN-2']);
  assert.match(kind.out, /note: 1 row has no known kind of event and was left out/);
});

test('traceFile: the report object holds the file, the events read, the traces and the notice, and reads nothing but the file', async () => {
  await withFiles({ 'events.csv': table(rows()) }, async (dir) => {
    const r = await traceFile({ path: 'events.csv', back: 'FIN-1', forward: 'RM-1', maxDepth: 10, version: '0', base: dir });
    assert.deepEqual(r.traces.map((t) => t.direction), ['back', 'forward']);
    assert.equal(r.input.file, 'events.csv');
    assert.equal(r.events.rows, 8);
    assert.match(r.notice, /not a certification of any kind/);
    const out = await cli([...ARGS, '--trace-back', 'FIN-1', '--format', 'text'], dir);
    assert.equal(out.code, 0);
  });
});
