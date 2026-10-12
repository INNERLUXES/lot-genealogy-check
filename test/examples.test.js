import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/index.js';
import { BAD, EXPECTED, FORWARD_EXPECTED, GOOD, GOOD_EXPECTED, NOW, TRACE_BACK, TRACE_EXPECTED, TRACE_FORWARD, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const BAD_FILE = 'examples/bad/events.csv';
const GOOD_FILE = 'examples/good/events.csv';

test('examples: the bad file fails with the report that is saved in examples/output', async () => {
  const r = await run(BAD);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('bad.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the good file passes at error, warning and info level with the report that is saved', async () => {
  const r = await run(GOOD);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('good.txt'));
  for (const e of GOOD_EXPECTED) assert.ok(r.out.includes(e), e);
  assert.equal((await run([...GOOD, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run([...GOOD, '--fail-on', 'info'])).code, 0);
  assert.doesNotMatch(r.out, /ERROR {4}|WARNING {2}|INFO {5}/);
  assert.doesNotMatch(r.out, /\nnote: /);
  assert.equal(NOW, '2101-03-10T12:00:00Z');
});

test('examples: every output saved in examples/output is the real output, in all four formats for both files', async () => {
  const outputs = {
    'bad-explain.txt': [...BAD, '--explain'],
    'bad.md': [...BAD, '--format', 'markdown'],
    'bad-explain.md': [...BAD, '--format', 'markdown', '--explain'],
    'bad.json': [...BAD, '--json', '--explain'],
    'bad.sarif': [...BAD, '--format', 'sarif'],
    'good.md': [...GOOD, '--format', 'markdown'],
    'good.json': [...GOOD, '--json'],
    'good.sarif': [...GOOD, '--format', 'sarif'],
    'checks.txt': ['--list-checks'],
    'checks.json': ['--list-checks', '--format', 'json'],
    'trace-back.txt': TRACE_BACK,
    'trace-back.json': [...TRACE_BACK, '--json'],
    'trace-forward.txt': TRACE_FORWARD,
    'trace-forward.json': [...TRACE_FORWARD, '--json']
  };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the saved traces show the lots, the parties and the serial numbers, in both directions', async () => {
  const back = await run(TRACE_BACK);
  const forward = await run(TRACE_FORWARD);
  for (const e of TRACE_EXPECTED) assert.ok(back.out.includes(e), e);
  for (const e of FORWARD_EXPECTED) assert.ok(forward.out.includes(e), e);
  const json = JSON.parse(await saved('trace-back.json'));
  assert.deepEqual(json.traces[0].lots.map((l) => [l.lot, l.depth]), [['FIN-E1', 0], ['HSG-A1', 1], ['MOD-D1', 1], ['PCB-B1', 2], ['CBL-C1', 2]]);
  assert.deepEqual(json.traces[0].serials, ['SN-0001', 'SN-0002', 'SN-0003', 'SN-0004']);
  assert.equal(json.traces[0].partiesTotal, 6);
  const down = JSON.parse(await saved('trace-forward.json'));
  assert.deepEqual(down.traces[0].lots.map((l) => l.lot), ['PCB-B1', 'MOD-D1', 'FIN-E1']);
  assert.equal(down.traces[0].serialsTotal, 4);
});

test('examples: every check but file-unreadable fires on the bad file, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BAD, '--json'])).out);
  const lines = (await readFile(resolve(root, BAD_FILE), 'utf8')).split('\n');
  // The line of the n-th line that holds needle.
  const at = (needle, n = 1) => {
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle) && (seen += 1) === n) return `${BAD_FILE}:${i + 1}`;
    throw new Error(`${needle} x${n}`);
  };
  const where = (id) => report.findings.filter((f) => f.id === id).map((f) => f.at);
  assert.deepEqual(RULES.map((r) => r.id).filter((id) => where(id).length === 0), ['file-unreadable']);
  for (const id of ['column-missing', 'column-duplicate', 'column-unknown']) assert.deepEqual(where(id), [`${BAD_FILE}:1`], id);
  assert.deepEqual(where('row-malformed'), [at('B-31,')]);
  assert.deepEqual(where('secret-in-file'), [at('lantern')]);
  assert.deepEqual(where('event-type-unknown'), [at('Recieve')]);
  assert.deepEqual(where('event-incomplete'), [at('B-33,')]);
  assert.deepEqual(where('quantity-not-positive'), [at('B-34,')]);
  assert.deepEqual(where('unit-missing'), [at('B-35,')]);
  assert.deepEqual(where('input-lots-unreadable'), [at('RM-2:5')]);
  assert.deepEqual(where('date-invalid'), [at('2101-02-30')]);
  assert.deepEqual(where('future-date'), [at('2101-04-20')]);
  assert.deepEqual(where('mass-balance-exceeded'), [at('B-03,')]);
  assert.deepEqual(where('units-not-comparable'), [at('B-04,')]);
  assert.deepEqual(where('input-lot-not-available'), [at('GHOST-9'), at('LATE-1:1:pieces')]);
  assert.deepEqual(where('lot-overdrawn'), [at('B-09,')]);
  assert.deepEqual(where('serial-born-twice'), [at('SN-77', 2)]);
  assert.deepEqual(where('serial-on-two-lots'), [at('B-16,')]);
  assert.deepEqual(where('custody-gap'), [at('B-20,'), at('B-23,')]);
  assert.deepEqual(where('custody-time-reversed'), [at('B-27,')]);
  assert.deepEqual(where('receive-without-ship'), [at('B-27,')]);
  assert.deepEqual(where('ship-without-receive'), [at('B-19,'), at('B-26,')]);
  assert.deepEqual(where('genealogy-loop'), [at('B-29,')]);
  assert.deepEqual(where('duplicate-row'), [at('B-07,', 2)]);
  assert.deepEqual(where('event-id-repeated'), [at('B-01,', 2)]);
});

test('examples: the files are plain ASCII with LF line ends, in the made-up year, with no key and no number that reads like a year', async () => {
  for (const file of [BAD_FILE, GOOD_FILE]) {
    const text = await readFile(resolve(root, file), 'utf8');
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
    assert.ok(!text.includes('\r'), file);
    for (const m of text.matchAll(/\b(\d{4})-\d{2}-\d{2}\b/g)) assert.equal(m[1], '2101', `${file}: ${m[0]}`);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, file);
  }
  assert.doesNotMatch(await readFile(resolve(root, GOOD_FILE), 'utf8'), /lantern/);
});

test('examples: the good file has a row of every kind of event and a chain from raw lots to serialised units', async () => {
  const good = JSON.parse((await run([...GOOD, '--json'])).out);
  assert.deepEqual(good.eventTypes.map((t) => t.id), ['receive', 'produce', 'ship', 'assemble', 'scrap']);
  assert.equal(good.events.rows, 25);
  assert.equal(good.events.serials, 4);
  assert.deepEqual(good.findings, []);
  assert.deepEqual(good.notes, []);
  const bad = JSON.parse((await run([...BAD, '--json'])).out);
  assert.equal(bad.totals.findings, 28);
  assert.equal(bad.events.skipped, 1);
  assert.deepEqual(bad.eventTypes.map((t) => t.id), ['receive', 'produce', 'ship', 'assemble', 'scrap', 'other']);
});

test('examples: the good file gives the same result with CRLF, with a byte order mark and as UTF-16, and as TSV', async () => {
  const text = await readFile(resolve(root, GOOD_FILE), 'utf8');
  const { withFiles, cli } = await import('./helpers.js');
  const variants = {
    'crlf.csv': text.replace(/\n/g, '\r\n'),
    'cr.csv': text.replace(/\n/g, '\r'),
    'utf16.csv': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    'bom.csv': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
    'tabs.tsv': text.split('\n').map((l) => l.split(',').join('\t')).join('\n')
  };
  await withFiles(variants, async (dir) => {
    for (const name of Object.keys(variants)) {
      const r = await cli([name, '--now', NOW], dir);
      assert.equal(r.code, 0, `${name}: ${r.out}`);
      assert.match(r.out, /\nfindings: 0\n/, name);
    }
  });
  const bad = await readFile(resolve(root, BAD_FILE), 'utf8');
  await withFiles({ 'crlf.csv': bad.replace(/\n/g, '\r\n') }, async (dir) => {
    const r = await cli(['crlf.csv', '--now', NOW, '--json'], dir);
    const ids = JSON.parse(r.out).findings.map((f) => `${f.id}:${f.line}`).sort();
    const original = JSON.parse((await run([...BAD, '--json'])).out).findings.map((f) => `${f.id}:${f.line}`).sort();
    assert.deepEqual(ids, original);
  });
});
