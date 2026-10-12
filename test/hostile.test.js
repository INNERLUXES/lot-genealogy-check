import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { COLUMN_NAMES, CSV_LIMITS, FINDING_CAP, checkText, prepareTrace, traceLot } from '../src/index.js';
import { ARGS, GOOD, allowed, cli, clean, lineOfRow, produce, run, ship, table, withFiles } from './helpers.js';

// Each test builds input meant to make the tool slow or to exhaust the stack or the memory, and checks that it ends with an
// answer in good time. The time allowed is four times as long under coverage (NODE_V8_COVERAGE is set only when coverage
// is on).

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

// A small header and a short row, for the tests that need many rows.
const SMALL = ['event_id', 'event_type', 'event_time', 'party', 'to_party', 'lot', 'product', 'quantity', 'unit', 'input_lots'];
const row = (o) => lineOfRow(o, SMALL);

test('a hundred thousand rows of one lot, shipped and received: the checks across rows stay linear and the sums are exact', () => {
  const rows = [row({ event_id: 'P', event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: 'LOT-1', product: 'x', quantity: '50000', unit: 'kg' })];
  for (let i = 0; i < 50000; i += 1) {
    rows.push(row({ event_id: `S-${i}`, event_type: 'ship', event_time: '2101-02-02', party: 'A', to_party: 'B', lot: 'LOT-1', quantity: '1', unit: 'kg' }));
    rows.push(row({ event_id: `R-${i}`, event_type: 'receive', event_time: '2101-02-03', party: 'B', lot: 'LOT-1', product: 'x', quantity: '1', unit: 'kg' }));
  }
  const text = `${SMALL.join(',')}\n${rows.join('\n')}\n`;
  const { value, ms } = timed(() => checkText(text, { now: '2101-03-10T12:00:00Z' }));
  assert.equal(value.analysis.summary.rows, 100001);
  assert.deepEqual(value.findings, [], 'exactly as much left as was held, and every ship is taken in');
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('one lot shipped one more kilogram than it holds, in a hundred thousand rows: one finding, at the row that crosses the line', () => {
  const rows = [row({ event_id: 'P', event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: 'LOT-1', product: 'x', quantity: '99999', unit: 'kg' })];
  for (let i = 0; i < 100000; i += 1) rows.push(row({ event_id: `S-${i}`, event_type: 'ship', event_time: '2101-02-02', party: 'A', to_party: `B${i % 7}`, lot: 'LOT-1', quantity: '1', unit: 'kg' }));
  const { value, ms } = timed(() => checkText(`${SMALL.join(',')}\n${rows.join('\n')}\n`));
  const over = value.findings.filter((f) => f.id === 'lot-overdrawn');
  assert.equal(over.length, 1);
  assert.match(over[0].message, /^By row 100001 /);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a hundred thousand rows with the same mistake: the first of each check are listed, the rest counted, in good time', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => row({ event_id: `E-${i}`, event_type: 'produce', event_time: '2101-02-30', party: 'A', lot: `LOT-${i}`, product: 'x', quantity: '1', unit: 'kg' }));
  const { value, ms } = timed(() => checkText(`${SMALL.join(',')}\n${rows.join('\n')}\n`));
  assert.equal(value.findings.filter((f) => f.id === 'date-invalid').length, FINDING_CAP);
  assert.equal(value.analysis.omitted.get('date-invalid'), 100000 - FINDING_CAP);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a chain of a hundred thousand lots, each made from the one before: no stack is used up, and the trace reaches the end of it', () => {
  const n = 100000;
  const rows = [row({ event_id: 'E-0', event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: 'L0', product: 'x', quantity: '1', unit: 'kg' })];
  for (let i = 1; i < n; i += 1) rows.push(row({ event_id: `E-${i}`, event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: `L${i}`, product: 'x', quantity: '1', unit: 'kg', input_lots: `L${i - 1}:1:kg` }));
  const text = `${SMALL.join(',')}\n${rows.join('\n')}\n`;
  const checked = timed(() => checkText(text));
  assert.deepEqual(checked.value.findings, []);
  assert.ok(checked.ms < allowed(30000), `took ${checked.ms} ms`);
  const model = checked.value.model;
  const prepared = prepareTrace(model);
  const back = timed(() => traceLot(model, `L${n - 1}`, 'back', 1000000, prepared));
  assert.equal(back.value.lotsReached, n - 1);
  assert.equal(back.value.depthReached, n - 1);
  assert.equal(back.value.listed, 2500);
  assert.equal(back.value.stoppedAtDepth, false);
  assert.ok(back.ms < allowed(10000), `took ${back.ms} ms`);
  const forward = timed(() => traceLot(model, 'L0', 'forward', 1000000, prepared));
  assert.equal(forward.value.lotsReached, n - 1);
  const shallow = traceLot(model, `L${n - 1}`, 'back', 50, prepared);
  assert.equal(shallow.lotsReached, 50);
  assert.equal(shallow.stoppedAtDepth, true);
});

test('the same chain closed into a loop of a hundred thousand lots: one loop found, with its length, and the trace ends', () => {
  const n = 100000;
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push(row({ event_id: `E-${i}`, event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: `L${i}`, product: 'x', quantity: '1', unit: 'kg', input_lots: `L${(i + 1) % n}:1:kg` }));
  const checked = timed(() => checkText(`${SMALL.join(',')}\n${rows.join('\n')}\n`));
  const loops = checked.value.findings.filter((f) => f.id === 'genealogy-loop');
  assert.equal(loops.length, 1);
  assert.match(loops[0].message, /which is made from 99992 more lots, which is made from L0 again\./);
  assert.ok(loops[0].message.length < 600);
  assert.ok(checked.ms < allowed(30000), `took ${checked.ms} ms`);
  const t = timed(() => traceLot(checked.value.model, 'L0', 'back', 1000000));
  assert.equal(t.value.lotsReached, n - 1);
  assert.ok(t.ms < allowed(10000), `took ${t.ms} ms`);
});

test('many loops that share lots: every closing edge is a finding, in good time, and the path is never copied whole', () => {
  const n = 20000;
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push(row({ event_id: `E-${i}`, event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: `L${i}`, product: 'x', quantity: '2', unit: 'kg', input_lots: `L${(i + 1) % n}:1:kg;L0:1:kg` }));
  const { value, ms } = timed(() => checkText(`${SMALL.join(',')}\n${rows.join('\n')}\n`));
  assert.ok(value.findings.filter((f) => f.id === 'genealogy-loop').length >= 2);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('one lot shipped to thirty thousand parties that each take it in, and the same with none taken in', () => {
  const n = 30000;
  const rows = [row({ event_id: 'P', event_type: 'produce', event_time: '2101-02-01', party: 'A', lot: 'LOT-1', product: 'x', quantity: String(n), unit: 'kg' })];
  for (let i = 0; i < n; i += 1) rows.push(row({ event_id: `S-${i}`, event_type: 'ship', event_time: '2101-02-02', party: 'A', to_party: `Party ${i}`, lot: 'LOT-1', quantity: '1', unit: 'kg' }));
  const text = `${SMALL.join(',')}\n${rows.join('\n')}\n`;
  const none = timed(() => checkText(text));
  assert.equal(none.value.analysis.omitted.get('ship-without-receive'), n - FINDING_CAP);
  assert.ok(none.ms < allowed(30000), `took ${none.ms} ms`);
  const wrong = rows.concat(Array.from({ length: n }, (_, i) => row({ event_id: `R-${i}`, event_type: 'receive', event_time: '2101-02-03', party: `Other ${i}`, lot: 'LOT-1', product: 'x', quantity: '1', unit: 'kg' })));
  const gaps = timed(() => checkText(`${SMALL.join(',')}\n${wrong.join('\n')}\n`));
  assert.equal(gaps.value.findings.filter((f) => f.id === 'custody-gap').length, FINDING_CAP);
  assert.ok(gaps.ms < allowed(30000), `took ${gaps.ms} ms`);
});

test('an input_lots cell of fifteen hundred entries and an event of a thousand rows are read in good time', () => {
  const inputs = Array.from({ length: 1500 }, (_, i) => `RM-${i}:1:kg`).join(';');
  const big = timed(() => checkText(table([produce({ lot: 'F', quantity: '1', input_lots: inputs })])));
  assert.equal(big.value.findings.filter((f) => f.id === 'input-lot-not-available').length, FINDING_CAP);
  assert.equal(big.value.analysis.omitted.get('input-lot-not-available'), 500);
  assert.ok(big.ms < allowed(5000), `took ${big.ms} ms`);
  const rows = Array.from({ length: 1000 }, (_, i) => produce({ event_id: 'W-1', lot: `F-${i}`, quantity: '1', input_lots: 'RM-1:1:kg' }));
  const event = timed(() => checkText(table([produce({ event_id: 'P-0', quantity: '1000' }), ...rows])));
  assert.deepEqual(event.value.findings, []);
  assert.ok(event.ms < allowed(5000), `took ${event.ms} ms`);
});

test('more rows than the limit: the first of the limit are read, with a note', () => {
  const rows = Array.from({ length: 1005 }, (_, i) => row({ event_id: `E-${i}`, event_type: 'receive', event_time: '2101-02-01', party: 'B', lot: `LOT-${i}`, product: 'x', quantity: '1', unit: 'kg' }));
  const { value } = timed(() => checkText(`${SMALL.join(',')}\n${rows.join('\n')}\n`, { limits: { ...CSV_LIMITS, maxRows: 1000 } }));
  assert.equal(value.analysis.summary.rows, 1000);
  assert.ok(value.notes.includes('the file holds more than 1000 rows; the tool read the first 1000 and left the rest out'));
});

test('a cell of a million characters, in quotes and out of them, ends with a file-unreadable finding at its place and not a hang', () => {
  for (const cell of ['x'.repeat(1000000), `"${'x'.repeat(1000000)}"`, `"${'""'.repeat(500000)}"`]) {
    const { value, ms } = timed(() => checkText(`${SMALL.join(',')}\nE-1,ship,2101-02-01,A,B,${cell},x,1,kg,\n`));
    assert.equal(value.findings[0].id, 'file-unreadable');
    assert.match(value.findings[0].message, new RegExp(`longer than ${CSV_LIMITS.maxCellLength} characters`));
    assert.equal(value.findings[0].line, 2);
    assert.ok(value.findings[0].message.length < 400);
    assert.ok(ms < allowed(3000), `took ${ms} ms`);
  }
});

test('a million commas, a million line ends and a header of a thousand columns are refused or skipped in good time', () => {
  const commas = timed(() => checkText(`${SMALL.join(',')}\nE-1${','.repeat(1000000)}\n`));
  assert.equal(commas.value.findings[0].id, 'file-unreadable');
  assert.match(commas.value.findings[0].message, new RegExp(`more than ${CSV_LIMITS.maxColumns} cells`));
  assert.ok(commas.ms < allowed(3000), `took ${commas.ms} ms`);
  const blank = timed(() => checkText(`${SMALL.join(',')}\n${'\n'.repeat(1000000)}${row({ event_id: 'E-1', event_type: 'receive', event_time: '2101-02-01', party: 'B', lot: 'L', product: 'x', quantity: '1', unit: 'kg' })}\n`));
  assert.equal(blank.value.analysis.summary.rows, 1);
  assert.ok(blank.ms < allowed(5000), `took ${blank.ms} ms`);
  const wide = timed(() => checkText(`${Array.from({ length: 1000 }, (_, i) => `c${i}`).join(',')}\n1\n`));
  assert.equal(wide.value.findings[0].id, 'file-unreadable');
  const cells = timed(() => checkText(`${COLUMN_NAMES.join(',')}\n${`${','.repeat(COLUMN_NAMES.length - 1)}\n`.repeat(100000)}`));
  assert.ok(cells.value.findings.some((f) => f.id === 'file-unreadable') || cells.value.analysis.summary !== null);
  assert.ok(cells.ms < allowed(10000), `took ${cells.ms} ms`);
});

test('numbers with thousands of digits are refused, not worked out, and the message stays short', () => {
  const huge = '1'.repeat(5000);
  const { value, ms } = timed(() => checkText(table([produce({ quantity: huge }), ship({ quantity: huge }), produce({ lot: 'F', input_lots: `RM-1:${huge}:kg` })])));
  assert.ok(value.findings.some((f) => f.id === 'quantity-not-positive' && /at most 40 digits/.test(f.message)));
  assert.ok(value.findings.some((f) => f.id === 'input-lots-unreadable'));
  assert.ok(value.findings.every((f) => f.message.length < 700));
  assert.ok(ms < allowed(3000), `took ${ms} ms`);
  const exp = checkText(table([produce({ quantity: '1e999999' })]));
  assert.ok(exp.findings.some((f) => f.id === 'quantity-not-positive'));
});

test('long strings in every column are read in good time, and the messages stay short', () => {
  const long = 'n'.repeat(15000);
  const base = Object.fromEntries(COLUMN_NAMES.map((c) => [c, long]));
  const { value, ms } = timed(() => checkText(table([{ ...base, event_type: 'produce' }, { ...base, event_type: 'assemble', event_id: 'other' }, { ...base, event_type: 'ship', event_id: 'third' }])));
  assert.ok(value.findings.length >= 4);
  assert.ok(value.findings.every((x) => x.message.length < 900), value.findings.map((x) => x.message.length).join());
  assert.ok(value.notes.every((n) => n.length < 900));
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
});

test('names such as __proto__, constructor and toString are only names: as columns, as kinds of event, as lots and as parties', () => {
  const header = '__proto__,constructor,hasOwnProperty,event_id,event_type,event_time,party,to_party,lot,product,quantity,unit';
  const r = timed(() => checkText(`${header}\n1,2,3,E-1,__proto__,2101-02-01,constructor,,constructor,x,1,kg\n1,2,3,E-2,produce,2101-02-01,__proto__,,__proto__,x,5,kg\n1,2,3,E-3,ship,2101-02-02,__proto__,toString,__proto__,x,5,kg\n1,2,3,E-4,receive,2101-02-03,toString,,__proto__,x,5,kg\n`));
  assert.equal({}.polluted, undefined);
  assert.equal(r.value.findings.filter((f) => f.id === 'column-unknown').length, 3);
  assert.equal(r.value.findings.filter((f) => f.id === 'event-type-unknown').length, 1);
  assert.deepEqual(r.value.findings.filter((f) => !['column-unknown', 'event-type-unknown'].includes(f.id)), [], 'a lot, a party and a unit of that name are matched like any other');
  for (const type of ['__proto__', 'constructor', 'toString']) assert.deepEqual(checkText(table([produce({ event_type: type })])).findings.map((f) => f.id), ['event-type-unknown'], type);
});

test('a clean table of ninety thousand rows (over a million cells) passes in good time', () => {
  const base = clean();
  const rows = [];
  for (let i = 0; i < 18000; i += 1) rows.push(...base.map((r, k) => ({ ...r, event_id: `E-${i}-${k}`, lot: `${r.lot}-${i}`, input_lots: r.input_lots ? r.input_lots.replace('RM-1', `RM-1-${i}`) : '', document_ref: `${r.document_ref}-${i}` })));
  const { value, ms } = timed(() => checkText(table(rows), { now: '2101-03-10T12:00:00Z' }));
  assert.equal(value.analysis.summary.rows, 90000);
  assert.deepEqual(value.findings, []);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a run leaves the folder as it was: the tool writes nothing', async () => {
  await withFiles(GOOD, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli([...ARGS, '--format', 'sarif'], dir);
    await cli([...ARGS, '--json', '--explain'], dir);
    await cli([...ARGS, '--trace-back', 'FIN-1'], dir);
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
  });
  assert.equal((await run(GOOD, ARGS)).code, 0);
});
