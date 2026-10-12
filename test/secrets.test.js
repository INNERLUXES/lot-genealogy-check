import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_NAMES, HEX_COLUMNS, SECRET_KEYS, cellAt, checkText, findSecrets, isSecretKey, readTable, secretShape } from '../src/index.js';
import { ARGS, clean, idsOf, lineOf, produce, run, ship, table } from './helpers.js';

// Shapes built from repeated characters, so that no file of the repository holds anything that could be a real seed or
// key.
const MNEMONIC = Array.from({ length: 12 }, () => 'lantern').join(' ');
const MNEMONIC_24 = Array.from({ length: 24 }, (_, i) => (i % 2 ? 'harbor' : 'lantern')).join(' ');
const XPRV = `x${'prv'}${'9'.repeat(107)}`;
const HEX = `0x${'ab'.repeat(32)}`;
const WIF = `5${'H'.repeat(50)}`;

test('secretShape: a mnemonic of 12 to 24 words, an extended private key, a key in hex and a key in WIF', () => {
  assert.equal(secretShape(MNEMONIC), 'a mnemonic');
  assert.equal(secretShape(MNEMONIC_24), 'a mnemonic');
  assert.equal(secretShape(`  ${MNEMONIC}  `), 'a mnemonic');
  assert.equal(secretShape(XPRV), 'an extended private key');
  assert.equal(secretShape(HEX), 'a private key in hex');
  assert.equal(secretShape(HEX.slice(2)), 'a private key in hex');
  assert.equal(secretShape(WIF), 'a private key in WIF');
  assert.equal(secretShape(`K${'z'.repeat(51)}`), 'a private key in WIF');
});

test('secretShape: lot codes, document numbers, dates, product names and other near misses of an event are not secrets', () => {
  for (const ok of ['LOT-A1', 'DN-1001', 'urn:uuid:00000000-0000-4000-8000-000000000001', '2101-03-04', 'Sensor housing, 3 count, film bag', Array.from({ length: 11 }, () => 'lantern').join(' '), Array.from({ length: 13 }, () => 'lantern').join(' '), `x${'pub'}${'9'.repeat(107)}`, '', 'ab'.repeat(31)]) assert.equal(secretShape(ok), null, ok);
});

test('isSecretKey: names of columns and keys in any case and with any separator, and near misses', () => {
  for (const k of ['privateKey', 'private_key', 'PRIVATE-KEY', 'mnemonic', 'seedPhrase', 'seed phrase', 'xprv', 'wif', 'secret', 'passphrase', 'password']) assert.ok(isSecretKey(k), k);
  for (const k of ['event_type', 'lot', 'document_ref', 'quantity', 'publicKey', 'serial']) assert.ok(!isSecretKey(k), k);
  assert.ok(SECRET_KEYS.includes('privatekey'));
});

test('secret-in-file: a column named for a seed, at its cell of the header, reported once and never shown in any format', async () => {
  const text = table([{ ...produce(), seed_phrase: MNEMONIC }], ['event_id', 'event_type', 'event_time', 'party', 'lot', 'quantity', 'unit', 'seed_phrase']);
  const r = checkText(text);
  const f = r.findings.filter((x) => x.id === 'secret-in-file');
  assert.equal(f.length, 1, 'the column is reported once, as a secret');
  assert.match(f[0].message, /^The file holds the column "seed_phrase", which names a seed, a mnemonic or a private key\. The tool never reads one, and the values under it are not shown\.$/);
  assert.equal(f[0].line, 1);
  assert.equal(f[0].column, text.split('\n')[0].indexOf('seed_phrase') + 1);
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const out = await run({ 'events.csv': text }, [...ARGS, '--format', format]);
    assert.ok(!out.out.includes('lantern'), format);
    assert.ok(!out.err.includes('lantern'), format);
  }
});

test('secret-in-file: a cell shaped like a key, at its line and column, left out of the checks and never echoed', () => {
  for (const [shape, value] of [['a mnemonic', MNEMONIC], ['an extended private key', XPRV], ['a private key in hex', HEX], ['a private key in WIF', WIF]]) {
    const text = table([produce({ product: value })]);
    const r = checkText(text);
    const secrets = r.findings.filter((f) => f.id === 'secret-in-file');
    assert.equal(secrets.length, 1, shape);
    assert.match(secrets[0].message, new RegExp(`^A cell of the column "product" is shaped like ${shape}\\. The tool never reads a seed or a key, and the value is not shown\\.$`));
    assert.equal(secrets[0].line, 2);
    assert.ok(!r.findings.some((f) => f.message.includes(value)), shape);
    assert.ok(!r.findings.some((f) => f.id === 'event-incomplete'), `${shape}: the cell is there, but not read, and not reported as missing`);
  }
});

test('secret-in-file: the value is not echoed by the other checks either: a time, a quantity, an event type, a lot, a unit, a party', () => {
  for (const column of ['event_time', 'quantity', 'event_type', 'lot', 'unit', 'party', 'to_party', 'serial', 'input_lots']) {
    const text = table([ship({ [column]: MNEMONIC }), produce({ event_id: 'E-9', [column]: MNEMONIC })]);
    const r = checkText(text);
    assert.ok(r.findings.some((f) => f.id === 'secret-in-file'), column);
    assert.ok(!r.findings.some((f) => f.message.includes('lantern') || (f.subject ?? '').includes('lantern')), column);
    assert.ok(!r.notes.some((n) => n.includes('lantern')), column);
  }
});

test('secret-in-file: 64 hex digits in a column that holds identifiers is a hash used as one, and anywhere else is a key', () => {
  const hash = 'cd'.repeat(32);
  for (const column of HEX_COLUMNS) assert.deepEqual(checkText(table([produce({ [column]: hash })])).findings.filter((f) => f.id === 'secret-in-file'), [], column);
  assert.deepEqual(HEX_COLUMNS, ['event_id', 'lot', 'serial', 'document_ref']);
  for (const column of ['product', 'party', 'site', 'to_party', 'input_lots', 'unit']) assert.equal(checkText(table([produce({ [column]: hash })])).findings.filter((f) => f.id === 'secret-in-file').length, 1, column);
  assert.equal(checkText(table([produce({ lot: MNEMONIC })])).findings.filter((f) => f.id === 'secret-in-file').length, 1, 'only the hex shape is excused');
  assert.equal(checkText(table([produce({ lot: XPRV })])).findings.filter((f) => f.id === 'secret-in-file').length, 1);
});

test('secret-in-file: a hash used as a lot works as a lot in the checks', () => {
  const hash = 'cd'.repeat(32);
  const ids = idsOf([produce({ lot: hash }), ship({ lot: hash })]);
  assert.deepEqual(ids, ['ship-without-receive']);
});

test('findSecrets: a short cell is not looked at, a secret column hides its cells, and a long cell of a plain sentence is not a secret', () => {
  const t = readTable(`event_type,password,note\nship,${MNEMONIC},${'ab'.repeat(20)}\nship,${HEX},${'word '.repeat(20)}\n`);
  const found = findSecrets(t, cellAt);
  assert.equal(found.length, 1, 'only the column; its cells are not reported one by one');
  assert.deepEqual([...t.secretColumns], [1]);
  assert.equal(t.rows[0].secrets, undefined);
});

test('secret-in-file: a secret in a row does not hide a real mistake in the same row, and a clean table has none', () => {
  assert.ok(!idsOf(clean()).includes('secret-in-file'));
  const ids = idsOf([produce({ product: MNEMONIC, event_time: '2101-02-30' })]);
  assert.ok(ids.includes('secret-in-file') && ids.includes('date-invalid'));
  assert.equal(COLUMN_NAMES.includes('password'), false);
});

test('secret-in-file: the line of a cell after a quoted line end is the line it starts on', () => {
  const text = table([produce(), produce({ lot: 'RM-2', product: MNEMONIC })]).replace('Acme Mill', '"Acme\nMill"');
  const f = checkText(text).findings.find((x) => x.id === 'secret-in-file');
  assert.equal(f.line, lineOf(text, 'lantern'));
});
