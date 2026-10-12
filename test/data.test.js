import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALWAYS, BEST, COLUMNS, COLUMN_NAMES, CONTEXT, EVENT_TYPES, KINDS, LEVELS, NOTICE, NOT_A, PLACEHOLDERS, RULES, atOrAbove, createCollector, decide, editDistance, flat, grouped, isBefore, isPlaceholder, listText, momentKey, nameKey, nearest, normalizeName, plural, readDate, readInputLots, ruleById, safeText, typeOf, unitKey, FINDING_CAP } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');

test('the checks: unique ids, a level, a kind of file, row or across rows, a fix, a reason in the same words, and 26 in all', () => {
  assert.equal(RULES.length, 26);
  assert.equal(new Set(RULES.map((r) => r.id)).size, 26);
  assert.deepEqual(KINDS, ['file', 'row', 'across rows']);
  assert.deepEqual(['file', 'row', 'across rows'].map((k) => RULES.filter((r) => r.kind === k).length), [6, 8, 12]);
  assert.deepEqual(['error', 'warning', 'info'].map((l) => RULES.filter((r) => r.severity === l).length), [18, 5, 3]);
  for (const r of RULES) {
    assert.match(r.id, /^[a-z]+(?:-[a-z]+)*$/, r.id);
    assert.ok(r.own.includes(BEST), r.id);
    assert.ok(r.fix.endsWith('.'), r.id);
    assert.ok(!('basis' in r), `${r.id}: there is no regulation to rest on`);
  }
  assert.equal(ruleById('custody-gap').severity, 'warning');
  assert.equal(ruleById('nothing'), undefined);
  assert.deepEqual(RULES.filter((r) => r.context).map((r) => r.id), ['input-lots-unreadable', 'mass-balance-exceeded', 'input-lot-not-available', 'serial-born-twice', 'serial-on-two-lots', 'genealogy-loop']);
  for (const c of Object.values(CONTEXT)) assert.doesNotMatch(c, /regulation|law|directive/i, 'the context quotes no law');
  assert.match(CONTEXT.batch, /this tool checks no passport/);
  assert.match(CONTEXT.inputs, /does not check conformance to it/);
});

test('the columns and the kinds of event: fourteen columns, five kinds, and what each kind needs', () => {
  assert.equal(COLUMNS.length, 14);
  assert.deepEqual(COLUMN_NAMES, ['event_id', 'event_type', 'event_time', 'party', 'site', 'from_party', 'to_party', 'lot', 'serial', 'product', 'quantity', 'unit', 'input_lots', 'document_ref']);
  assert.deepEqual(EVENT_TYPES.map((t) => t.id), ['receive', 'produce', 'ship', 'assemble', 'scrap']);
  assert.deepEqual(ALWAYS, ['event_id', 'event_time', 'party', 'lot', 'quantity']);
  assert.deepEqual(typeOf('assemble').needs, ['product', 'input_lots']);
  assert.equal(typeOf('assemble').inputs, 'required');
  assert.equal(typeOf('produce').inputs, 'optional');
  assert.equal(typeOf('ship').inputs, undefined);
  assert.equal(typeOf('__proto__'), undefined);
  for (const c of COLUMNS) assert.ok(c.summary.length > 10, c.name);
});

test('the documents name every check, every column, every kind of event and every option of the command line', async () => {
  const method = await read('docs/method.md');
  for (const r of RULES) assert.ok(method.includes(`\`${r.id}\``), `docs/method.md: ${r.id}`);
  const inputs = await read('docs/inputs.md');
  for (const c of COLUMN_NAMES) assert.ok(inputs.includes(`| \`${c}\` |`), `docs/inputs.md: ${c}`);
  for (const t of EVENT_TYPES) assert.ok(inputs.includes(`| \`${t.id}\` |`), `docs/inputs.md: ${t.id}`);
  for (const option of ['--format', '--json', '--min-severity', '--fail-on', '--now', '--yield-tolerance', '--explain', '--trace-back', '--trace-forward', '--max-depth', '--list-checks']) assert.ok(inputs.includes(option), option);
  const changelog = await read('CHANGELOG.md');
  for (const r of RULES) assert.ok(changelog.includes(`\`${r.id}\``), `CHANGELOG.md: ${r.id}`);
  const readme = await read('README.md');
  for (const r of RULES) assert.ok(readme.includes(`| \`${r.id}\` | ${r.severity} | ${r.kind} |`), `README.md: ${r.id}`);
  const limits = await read('docs/limits.md');
  assert.ok(limits.includes('1,000'));
});

test('every document says what the tool is, in the same words', async () => {
  for (const file of ['README.md', 'docs/limits.md', 'docs/method.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'docs/inputs.md', 'docs/context.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/decisions/0002-read-csv-with-a-reader-of-its-own-and-never-show-a-secret.md']) {
    assert.ok((await read(file)).replace(/\s+/g, ' ').includes(NOT_A), file);
  }
  assert.match(NOTICE, /not whether they are true, and it is not a certification of any kind\.$/);
});

test('decide: the result of a run follows the fail-on level and counts every level at or above it', () => {
  assert.deepEqual(decide({ error: 0, warning: 0, info: 0 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
  assert.equal(decide({ error: 0, warning: 2, info: 1 }, 'error').text, 'PASS - no finding at or above error (2 warning, 1 info)');
  assert.equal(decide({ error: 0, warning: 2, info: 1 }, 'warning').text, 'FAIL - 2 findings at or above warning (2 warning, 1 info)');
  assert.equal(decide({ error: 1, warning: 0, info: 0 }, 'error').text, 'FAIL - 1 finding at or above error (1 error)');
  assert.equal(decide({ error: 0, warning: 0, info: 3 }, 'info').pass, false);
  assert.ok(atOrAbove('error', 'warning') && atOrAbove('warning', 'warning') && !atOrAbove('info', 'warning'));
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
});

test('names, units and placeholders: compared without regard to case or runs of white space', () => {
  assert.equal(normalizeName(' Event  Time '), 'event_time');
  assert.equal(normalizeName('--Input.Lots--'), 'input_lots');
  assert.equal(normalizeName('***'), '');
  assert.equal(unitKey('  KG  '.trim()), 'kg');
  assert.equal(unitKey('Cubic   Metres'), 'cubic metres');
  assert.equal(nameKey('Acme   MILL'), 'acme mill');
  for (const p of PLACEHOLDERS) assert.ok(isPlaceholder(p.toUpperCase()), p);
  assert.ok(!isPlaceholder('n/a-1') && !isPlaceholder(''));
});

test('editDistance and nearest: within two edits, the first of equals, and nothing beyond', () => {
  assert.equal(editDistance('serials', 'serial'), 1);
  assert.equal(editDistance('recieve', 'receive'), 2);
  assert.equal(editDistance('', 'ship'), 4);
  assert.equal(nearest('serials', COLUMN_NAMES), 'serial');
  assert.equal(nearest('documentref', COLUMN_NAMES), 'document_ref');
  assert.equal(nearest('remark', COLUMN_NAMES), null);
  assert.equal(nearest('shp', EVENT_TYPES.map((t) => t.id)), 'ship');
});

test('readInputLots: the quantity and the unit are read from the right, and each problem names its entry', () => {
  assert.deepEqual(readInputLots('A:1:kg;B:2.50:kg').entries.map((e) => [e.lot, e.unit, e.qty.int.toString(), e.qty.scale]), [['A', 'kg', '1', 0], ['B', 'kg', '250', 2]]);
  assert.equal(readInputLots('urn:lot:id:7:5:KG').entries[0].lot, 'urn:lot:id:7');
  assert.equal(readInputLots('urn:lot:id:7:5:KG').entries[0].unit, 'kg');
  assert.equal(readInputLots('urn:lot:id:7:5:KG').entries[0].unitText, 'KG');
  assert.deepEqual(readInputLots(' ; ;').entries, []);
  const r = readInputLots('A:1:kg;B;:3:kg;C:2:;D:0:kg;E:x:kg');
  assert.equal(r.entries.length, 1);
  assert.deepEqual(r.problems.map((p) => p.split(',')[0]), ['entry 2', 'entry 3', 'entry 4', 'entry 5', 'entry 6']);
});

test('momentKey and isBefore: a day alone and a time on that day are not out of order; two times are compared to the nanosecond', () => {
  const d = (t) => readDate(t);
  assert.ok(momentKey(d('2101-03-04')) < momentKey(d('2101-03-04T00:00:01Z')));
  assert.ok(momentKey(d('2101-03-04T01:00:00+01:00')) === momentKey(d('2101-03-04T00:00:00Z')));
  assert.ok(!isBefore(d('2101-03-04'), d('2101-03-04T10:00:00Z')));
  assert.ok(!isBefore(d('2101-03-04T10:00:00Z'), d('2101-03-04')));
  assert.ok(isBefore(d('2101-03-03T23:59:59Z'), d('2101-03-04')));
  assert.ok(isBefore(d('2101-03-04T10:00:00Z'), d('2101-03-04T10:00:00.000000001Z')));
  assert.ok(!isBefore(d('2101-03-04T10:00:00Z'), d('2101-03-04T10:00:00Z')));
});

test('createCollector: the first FINDING_CAP of each check are kept and the rest counted, by check', () => {
  const c = createCollector();
  for (let i = 0; i < FINDING_CAP + 3; i += 1) c.add('a', { line: i + 1, column: 1 }, 'm');
  c.add('b', { line: 1, column: 2 }, 'm', 'S');
  assert.equal(c.findings.filter((f) => f.id === 'a').length, FINDING_CAP);
  assert.equal(c.omitted.get('a'), 3);
  assert.equal(c.omitted.get('b'), undefined);
  assert.deepEqual(c.findings.at(-1), { id: 'b', line: 1, column: 2, message: 'm', subject: 'S' });
});

test('numbers, lists and text from the input: grouped, plural, listText, safeText and flat', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'lot'), '1 lot');
  assert.equal(plural(2, 'party', 'parties'), '2 parties');
  assert.equal(plural(1500, 'byte'), '1,500 bytes');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more');
  assert.equal(safeText('a\u0007b'), 'a b');
  assert.equal(safeText('x'.repeat(50), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n b  '), 'a b');
});
