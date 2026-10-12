import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_NAMES, FINDING_CAP, RULES, checkText, readTolerance } from '../src/index.js';
import { DEPOT, MILL, NOW, YARD, assemble, clean, findingsOf, idsOf, lineOf, ofCheck, produce, receive, scrap, ship, table } from './helpers.js';

// A check that fires on a row and stays quiet on the row next to it: each test below has the near miss on each side.

test('a clean table passes every check at every level, with and without --now', () => {
  assert.deepEqual(findingsOf(clean(), { now: NOW }), []);
  assert.deepEqual(findingsOf(clean()), []);
  assert.equal(checkText(table(clean())).notes.includes('no --now was given, so future-date did not run'), true);
  assert.equal(checkText(table(clean()), { now: NOW }).notes.length, 0);
});

test('the checks: every id is used by at least one test below, and each has a level, a kind, a fix and its reason', () => {
  assert.equal(RULES.length, 26);
  for (const r of RULES) {
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(['file', 'row', 'across rows'].includes(r.kind), r.id);
    assert.ok(r.summary.length > 20 && r.fix.length > 10, r.id);
    assert.match(r.own, /is a best practice of this tool; no regulation sets it/, r.id);
  }
});

test('event-type-unknown: an empty kind, a misspelt kind with the nearest, and a kind in any case that is fine', () => {
  const f = ofCheck([produce({ event_type: 'Recieve' })], 'event-type-unknown');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The event_type of row 1, "Recieve", is not one of receive, produce, ship, assemble, scrap\. Did you mean receive\? The row was not checked\.$/);
  assert.match(ofCheck([produce({ event_type: '' })], 'event-type-unknown')[0].message, /^Row 1 has no event_type/);
  assert.match(ofCheck([produce({ event_type: 'n/a' })], 'event-type-unknown')[0].message, /^Row 1 has no event_type/);
  assert.doesNotMatch(ofCheck([produce({ event_type: 'transfer' })], 'event-type-unknown')[0].message, /Did you mean/);
  for (const ok of ['SHIP', ' Produce ', 'Scrap', 'assemble', 'receive']) assert.deepEqual(ofCheck([produce({ event_type: ok })], 'event-type-unknown'), [], ok);
  assert.deepEqual(idsOf([produce({ event_type: 'bogus', quantity: '0' })]), ['event-type-unknown'], 'the row is not checked further');
});

test('event-incomplete: a cell the kind needs, empty or a placeholder, named in the message, and a cell it does not need', () => {
  for (const column of ['event_id', 'event_time', 'party', 'lot', 'quantity', 'product']) {
    const f = ofCheck([produce({ [column]: column === 'event_id' ? '' : undefined })].map((r) => (column === 'event_id' ? { ...r, event_id: '' } : r)), 'event-incomplete');
    assert.equal(f.length, 1, column);
    assert.match(f[0].message, new RegExp(`under "${column}"`), column);
  }
  assert.match(ofCheck([produce({ lot: 'n/a' })], 'event-incomplete')[0].message, /under "lot"/);
  assert.match(ofCheck([produce({ party: '  TBD ' })], 'event-incomplete')[0].message, /under "party"/);
  const several = ofCheck([produce({ lot: undefined, party: undefined })], 'event-incomplete');
  assert.equal(several.length, 1);
  assert.match(several[0].message, /the cells under "party" and "lot"/);
  assert.deepEqual(ofCheck([ship({ to_party: undefined })], 'event-incomplete').map((f) => f.message.includes('"to_party"')), [true]);
  assert.deepEqual(ofCheck([receive({ product: undefined })], 'event-incomplete').map((f) => f.message.includes('"product"')), [true]);
  assert.deepEqual(ofCheck([assemble({ input_lots: undefined })], 'event-incomplete').map((f) => f.message.includes('"input_lots"')), [true]);
  assert.deepEqual(ofCheck([produce({ input_lots: undefined })], 'event-incomplete'), [], 'a produce row without inputs starts a lot');
  assert.deepEqual(ofCheck([ship({ product: undefined })], 'event-incomplete'), [], 'a ship row needs no product');
  assert.deepEqual(ofCheck([scrap({ product: undefined, site: undefined })], 'event-incomplete'), []);
});

test('event-incomplete: a ship row whose from_party is not its party, compared without regard to case', () => {
  const f = ofCheck([ship({ from_party: YARD })], 'event-incomplete');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The from_party of row 1 \(ship\), "Yard Logistics", is not the party of the row, "Acme Mill"/);
  assert.deepEqual(ofCheck([ship({ from_party: 'ACME  mill' })], 'event-incomplete'), []);
  assert.deepEqual(ofCheck([ship({ from_party: undefined })], 'event-incomplete'), []);
});

test('quantity-not-positive: zero, negative, separators, exponents, text and too many digits are reported; plain numbers are not', () => {
  for (const q of ['0', '0.0', '-1', '+5', '1,000', '1e3', 'abc', '12 kg', '00.5', '.5', '5.', `${'9'.repeat(41)}`]) {
    const f = ofCheck([produce({ quantity: q })], 'quantity-not-positive');
    assert.equal(f.length, 1, q);
  }
  for (const q of ['1', '0.5', '12.250', '100', '9'.repeat(40)]) assert.deepEqual(ofCheck([produce({ quantity: q })], 'quantity-not-positive'), [], q);
  assert.match(ofCheck([produce({ quantity: '0' })], 'quantity-not-positive')[0].message, /is zero; a quantity must be above zero\.$/);
  assert.match(ofCheck([produce({ quantity: '-1' })], 'quantity-not-positive')[0].message, /at most 40 digits/);
  assert.deepEqual(ofCheck([produce({ quantity: '1,000' })], 'unit-missing'), []);
});

test('quantity-not-positive: a quantity in quotes with a comma is read as the text it is', () => {
  const text = table([produce({ quantity: '1,000' })]);
  assert.ok(text.includes('"1,000"'));
  assert.equal(checkText(text).findings.filter((f) => f.id === 'quantity-not-positive').length, 1);
});

test('unit-missing: a quantity with no unit is reported at the unit cell, a unit with no quantity is an incomplete row', () => {
  const f = ofCheck([produce({ unit: undefined })], 'unit-missing');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The quantity of row 1 \(produce\), 100, has no unit in the unit column\.$/);
  const row = table([produce({ unit: undefined })]).split('\n')[1];
  assert.equal(f[0].column, row.split(',').slice(0, COLUMN_NAMES.indexOf('unit')).join(',').length + 2, 'the column of the unit cell');
  assert.equal(f[0].line, 2);
  assert.equal(ofCheck([produce({ unit: 'n/a' })], 'unit-missing').length, 1);
  assert.deepEqual(ofCheck([produce({ quantity: undefined })], 'unit-missing'), []);
  assert.equal(ofCheck([produce({ quantity: undefined })], 'event-incomplete').length, 1);
  assert.deepEqual(ofCheck([produce({ quantity: 'abc', unit: undefined })], 'unit-missing').length, 1);
});

test('input-lots-unreadable: each way an entry can be wrong, the colon inside a lot, the empty entry and a trailing semicolon', () => {
  const bad = ['RM-1:5', 'RM-1', ':5:kg', 'RM-1:5:', 'RM-1:abc:kg', 'RM-1:0:kg', 'RM-1:-2:kg', 'RM-1:1e2:kg', 'RM-1:5:kg;RM-2:7'];
  for (const input of bad) assert.equal(ofCheck([assemble({ input_lots: input })], 'input-lots-unreadable').length, 1, input);
  for (const input of ['RM-1:5:kg', 'RM-1:5:kg;RM-2:2.5:kg', 'RM-1:5:kg;', ' RM-1 : 5 : kg ', 'urn:lot:id:7:5:kg', 'RM-1:5:kg;;RM-2:5:kg']) assert.deepEqual(ofCheck([assemble({ input_lots: input })], 'input-lots-unreadable'), [], input);
  const f = ofCheck([assemble({ input_lots: 'A:1:kg;B;C;D:0:kg' })], 'input-lots-unreadable');
  assert.match(f[0].message, /^The input_lots of row 1 \(assemble\): entry 2, "B", is not written lot:quantity:unit, and 2 more\./);
  assert.deepEqual(ofCheck([ship({ input_lots: 'garbage' })], 'input-lots-unreadable'), [], 'only produce and assemble rows read input_lots');
});

test('input-lots-unreadable: an event with an unreadable input is not compared with its inputs', () => {
  const ids = idsOf([produce(), assemble({ quantity: '5000', input_lots: 'RM-1:5:kg;RM-1:oops:kg' })]);
  assert.ok(ids.includes('input-lots-unreadable'));
  assert.ok(!ids.includes('mass-balance-exceeded'));
});

test('date-invalid: a day that does not exist, a month or hour that does not, a time with no zone and a date of the United States', () => {
  for (const t of ['2101-02-29', '2101-02-30', '2101-13-01', '2101-00-10', '2101-04-31', '2101-03-10T25:00:00Z', '2101-03-10T10:61:00Z', '2101-03-10T10:00:00', '03/04/2101', '10 March 2101', '2101-3-1', '2101-03-10T10:00:00+15:00']) {
    assert.equal(ofCheck([produce({ event_time: t })], 'date-invalid').length, 1, t);
  }
  const leapDay = ['2104', '02', '29'].join('-'); // a leap year, built from its parts so that no file holds a full date outside 2101
  for (const t of ['2101-02-28', leapDay, '2101-03-10T10:00:00Z', '2101-03-10T10:00:00.250+01:00', '2101-03-10T10:00:00-05:30']) assert.deepEqual(ofCheck([produce({ event_time: t })], 'date-invalid'), [], t);
  assert.match(ofCheck([produce({ event_time: '2101-02-30' })], 'date-invalid')[0].message, /^The event_time of row 1 \(produce\), "2101-02-30", has the day 30, but month 02 of 2101 has 28 days\.$/);
  assert.match(ofCheck([produce({ event_time: '03/04/2101' })], 'date-invalid')[0].message, /written like a date of the United States/);
});

test('future-date: a time after --now, a day of room for a day alone, no check without --now', () => {
  const rows = (t) => [produce({ event_time: t })];
  assert.equal(ofCheck(rows('2101-03-10T12:00:01Z'), 'future-date', { now: NOW }).length, 1);
  assert.deepEqual(ofCheck(rows('2101-03-10T12:00:00Z'), 'future-date', { now: NOW }), []);
  assert.deepEqual(ofCheck(rows('2101-03-11'), 'future-date', { now: NOW }), [], 'one day of room');
  assert.equal(ofCheck(rows('2101-03-12'), 'future-date', { now: NOW }).length, 1);
  assert.deepEqual(ofCheck(rows('2101-03-12'), 'future-date'), [], 'without --now the check does not run');
  assert.equal(ofCheck(rows('2101-03-10T13:00:00+01:00'), 'future-date', { now: NOW }).length, 0, 'the same moment in another zone');
  assert.equal(ofCheck(rows('2101-03-10T12:30:00+00:00'), 'future-date', { now: NOW }).length, 1);
  assert.match(ofCheck(rows('2101-04-01'), 'future-date', { now: NOW })[0].message, /is after the moment given with --now\.$/);
  assert.ok(checkText(table(rows('2101-03-01')), { now: 'not a date' }).notes.includes('--now could not be read, so future-date did not run'));
});

test('mass-balance-exceeded: outputs above inputs in one unit, exact to the last digit, with a tolerance in percent', () => {
  const make = (out, inp) => [produce(), assemble({ quantity: out, input_lots: `RM-1:${inp}:kg` })];
  assert.deepEqual(ofCheck(make('10', '10'), 'mass-balance-exceeded'), []);
  assert.deepEqual(ofCheck(make('9.5', '10'), 'mass-balance-exceeded'), []);
  const f = ofCheck(make('10.000000000000000001', '10'), 'mass-balance-exceeded');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^By row 2 the assemble event E-2 makes 10\.000000000000000001 kg in total, more than the 10 kg of its inputs\.$/);
  assert.deepEqual(ofCheck(make('0.3', '0.3'), 'mass-balance-exceeded'), []);
  const sum = [produce(), assemble({ quantity: '0.3', input_lots: 'RM-1:0.1:kg;RM-1:0.2:kg' })];
  assert.deepEqual(ofCheck(sum, 'mass-balance-exceeded'), [], '0.1 and 0.2 add up to 0.3 exactly');
  assert.equal(ofCheck([produce(), assemble({ quantity: '0.31', input_lots: 'RM-1:0.1:kg;RM-1:0.2:kg' })], 'mass-balance-exceeded').length, 1);
});

test('mass-balance-exceeded: --yield-tolerance allows a share above the inputs, and no more', () => {
  const rows = [produce(), assemble({ quantity: '11', input_lots: 'RM-1:10:kg' })];
  assert.equal(ofCheck(rows, 'mass-balance-exceeded').length, 1);
  assert.deepEqual(ofCheck(rows, 'mass-balance-exceeded', { tolerance: readTolerance('10') }), []);
  assert.equal(ofCheck(rows, 'mass-balance-exceeded', { tolerance: readTolerance('9.99') }).length, 1);
  assert.match(ofCheck(rows, 'mass-balance-exceeded', { tolerance: readTolerance('9.99') })[0].message, /plus the yield tolerance of 9\.99 percent\.$/);
  assert.equal(readTolerance('abc'), null);
  assert.equal(readTolerance('-1'), null);
  assert.equal(readTolerance('1000.5'), null);
  assert.notEqual(readTolerance('1000'), null);
});

test('mass-balance-exceeded: the rows of one event_id, kind, party and time are one event; other rows are separate events', () => {
  const row = (id, lot, out, inputs, over = {}) => assemble({ event_id: id, lot, quantity: out, input_lots: inputs, ...over });
  // Two outputs of one event: the inputs of both rows are added up, and so are the outputs.
  assert.deepEqual(ofCheck([produce(), row('W-1', 'A', '6', 'RM-1:10:kg'), row('W-1', 'B', '5', 'RM-1:1:kg')], 'mass-balance-exceeded'), [], '11 against 11');
  const over = ofCheck([produce(), row('W-1', 'A', '6', 'RM-1:10:kg'), row('W-1', 'B', '6', 'RM-1:1:kg')], 'mass-balance-exceeded');
  assert.equal(over.length, 1, '12 against 11');
  assert.match(over[0].message, /^By row 3 the assemble event W-1 makes 12 kg in total, more than the 11 kg of its inputs\.$/);
  // Rows with other event ids are other events, each with its own inputs.
  assert.deepEqual(ofCheck([produce(), row('W-1', 'A', '6', 'RM-1:10:kg'), row('W-2', 'B', '5', 'RM-1:1:kg')], 'mass-balance-exceeded').map((f) => f.message.includes('W-2')), [true]);
  // The same id at another time is another event too.
  assert.equal(ofCheck([produce(), row('W-1', 'A', '6', 'RM-1:10:kg'), row('W-1', 'B', '5', 'RM-1:1:kg', { event_time: '2101-02-04T09:00:00Z' })], 'mass-balance-exceeded').length, 1);
});

test('units-not-comparable: inputs and outputs in other units, or one party holding a lot in two units, are a note and not a comparison', () => {
  const f = ofCheck([produce(), assemble({ quantity: '5', unit: 'pieces', input_lots: 'RM-1:10:kg' })], 'units-not-comparable');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The assemble event E-2 has inputs in kg and outputs in pieces, so the tool cannot compare/);
  assert.deepEqual(ofCheck([produce(), assemble({ quantity: '5', unit: 'KG', input_lots: 'RM-1:10:kg' })], 'units-not-comparable'), [], 'units are compared without regard to case');
  const two = ofCheck([produce(), produce({ event_id: 'E-9', quantity: '10', unit: 'pieces' })], 'units-not-comparable');
  assert.equal(two.length, 1);
  assert.match(two[0].message, /^Acme Mill holds the lot RM-1 in kg at row 1 and in pieces at row 2;/);
  const out = ofCheck([produce(), scrap({ party: MILL, lot: 'RM-1', unit: 'pieces' })], 'units-not-comparable');
  assert.equal(out.length, 1);
  assert.match(out[0].message, /takes the lot RM-1 out in pieces, but Acme Mill holds it in kg/);
});

test('input-lot-not-available: a lot no row holds, a lot held only later, and the near misses: held at once, received, held earlier', () => {
  const never = ofCheck([assemble({ input_lots: 'GHOST-9:1:kg' })], 'input-lot-not-available');
  assert.equal(never.length, 1);
  assert.match(never[0].message, /^Row 1 \(assemble\) uses the input lot GHOST-9, which no receive or produce row of the file holds\.$/);
  const late = ofCheck([assemble({ event_time: '2101-01-01T08:00:00Z' }), produce(), ship(), receive()], 'input-lot-not-available');
  assert.equal(late.length, 1);
  assert.match(late[0].message, /but the first row that receives or makes it, row 2, is dated 2101-02-01T08:00:00Z\.$/);
  assert.deepEqual(ofCheck([produce(), assemble({ event_time: '2101-02-01T08:00:00Z', party: MILL })], 'input-lot-not-available'), [], 'at the same moment');
  assert.deepEqual(ofCheck([assemble({ event_time: '2101-02-01' }), produce()], 'input-lot-not-available'), [], 'a day alone and a time on that day');
  assert.equal(ofCheck([assemble({ event_time: '2101-01-31' }), produce()], 'input-lot-not-available').length, 1);
  assert.deepEqual(ofCheck([ship({ party: YARD, to_party: DEPOT, lot: 'RM-1' }), receive({ from_party: YARD }), assemble()], 'input-lot-not-available'), [], 'a lot that is only received is held');
  assert.deepEqual(ofCheck([assemble({ event_time: undefined })], 'input-lot-not-available').map((f) => f.message.includes('no receive or produce row')), [true], 'a row with no time is still checked for a lot that does not exist');
});

test('lot-overdrawn: a party gives more than it holds, with exact sums, in one unit, counted for each party', () => {
  const rows = (shipped) => [produce({ quantity: '100' }), ship({ quantity: shipped })];
  assert.deepEqual(ofCheck(rows('100'), 'lot-overdrawn'), []);
  const f = ofCheck(rows('100.0000000001'), 'lot-overdrawn');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^By row 2 \(ship\) 100\.0000000001 kg of the lot RM-1 have been shipped, scrapped or used by Acme Mill, but Acme Mill received or made only 100 kg of it\.$/);
  const exact = [produce({ quantity: '0.3' }), ship({ quantity: '0.1' }), scrap({ party: MILL, quantity: '0.2' })];
  assert.deepEqual(ofCheck(exact, 'lot-overdrawn'), [], '0.1 and 0.2 against 0.3');
  assert.equal(ofCheck([...exact, scrap({ event_id: 'S-2', party: MILL, quantity: '0.0001' })], 'lot-overdrawn').length, 1);
  const twice = ofCheck([produce({ quantity: '10' }), ship({ quantity: '6' }), ship({ event_id: 'E-9', quantity: '6' }), ship({ event_id: 'E-10', quantity: '6' })], 'lot-overdrawn');
  assert.equal(twice.length, 1, 'reported once, at the row that crosses the line');
  assert.match(twice[0].message, /^By row 3 /);
});

test('lot-overdrawn: a ship and its receive are one movement, so a receive does not make the shipper richer', () => {
  const rows = [produce({ quantity: '100' }), ship({ quantity: '150' }), receive({ quantity: '150' })];
  assert.equal(ofCheck(rows, 'lot-overdrawn').length, 1);
  const chain = [produce({ quantity: '100' }), ship(), receive(), assemble({ input_lots: 'RM-1:100:kg', quantity: '100' })];
  assert.deepEqual(ofCheck(chain, 'lot-overdrawn'), [], 'the depot uses exactly what it received');
  assert.equal(ofCheck([...chain, scrap({ quantity: '1' })], 'lot-overdrawn').length, 1);
});

test('lot-overdrawn: a use of a lot is counted too; a lot nobody holds is shipped from nothing, and not used from nothing twice', () => {
  const use = ofCheck([produce({ quantity: '10' }), assemble({ party: MILL, input_lots: 'RM-1:11:kg', quantity: '5' })], 'lot-overdrawn');
  assert.equal(use.length, 1);
  assert.match(use[0].message, /^By row 2 \(assemble\) 11 kg of the lot RM-1/);
  const none = ofCheck([ship({ lot: 'NOBODY-1' })], 'lot-overdrawn');
  assert.equal(none.length, 1);
  assert.match(none[0].message, /but the file receives or makes none of it\.$/);
  assert.equal(ofCheck([scrap({ lot: 'NOBODY-1' })], 'lot-overdrawn').length, 1);
  const used = findingsOf([assemble({ input_lots: 'NOBODY-1:1:kg', quantity: '1' })]).map((f) => f.id);
  assert.ok(used.includes('input-lot-not-available') && !used.includes('lot-overdrawn'), 'an input that does not exist is reported once');
  assert.deepEqual(ofCheck([produce({ quantity: '5', unit: 'kg' }), ship({ quantity: '9', unit: 'pieces' })], 'lot-overdrawn'), [], 'another unit is a note, not a sum');
});

test('lot-overdrawn: a party that holds none of a lot another party holds is left to custody-gap', () => {
  const rows = [produce(), scrap({ party: YARD, lot: 'RM-1', quantity: '1' })];
  assert.deepEqual(ofCheck(rows, 'lot-overdrawn'), []);
  assert.equal(ofCheck(rows, 'custody-gap').length, 1);
});

test('serial-born-twice: two produce or assemble rows with one serial, and the near misses: a ship row with the serial, other serials', () => {
  const made = (id, serial, lot = 'FIN-1') => assemble({ event_id: id, serial, lot, quantity: '1', input_lots: 'RM-1:1:kg' });
  const f = ofCheck([produce(), made('A', 'SN-1'), made('B', 'SN-1')], 'serial-born-twice');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The serial SN-1 is made by row 3 \(assemble\) and was already made by row 2, on line 3;/);
  assert.deepEqual(ofCheck([produce(), made('A', 'SN-1'), made('B', 'SN-2')], 'serial-born-twice'), []);
  assert.equal(ofCheck([produce(), made('A', 'SN-1'), made('B', 'SN-1', 'FIN-2')], 'serial-born-twice').length, 1, 'two lots do not make it two births');
  assert.deepEqual(ofCheck([produce(), made('A', 'SN-1'), ship({ lot: 'FIN-1', party: DEPOT, serial: 'SN-1', quantity: '1' })], 'serial-born-twice'), [], 'a unit that is shipped was born once');
});

test('serial-on-two-lots: one serial on two lots or two products, reported once, and the same lot or product is fine', () => {
  const rows = (second) => [produce({ lot: 'L-1', serial: 'SN-9', product: 'Sensor' }), produce({ event_id: 'E-9', ...second })];
  assert.equal(ofCheck(rows({ lot: 'L-2', serial: 'SN-9', product: 'Sensor' }), 'serial-on-two-lots').length, 1);
  assert.equal(ofCheck(rows({ lot: 'L-1', serial: 'SN-9', product: 'Other' }), 'serial-on-two-lots').length, 1);
  assert.deepEqual(ofCheck(rows({ lot: 'L-1', serial: 'SN-9', product: 'Sensor' }), 'serial-on-two-lots'), []);
  assert.deepEqual(ofCheck(rows({ lot: 'L-1', serial: 'SN-9', product: undefined }), 'serial-on-two-lots'), [], 'no product is not another product');
  const three = ofCheck([...rows({ lot: 'L-2', serial: 'SN-9' }), produce({ event_id: 'E-10', lot: 'L-3', serial: 'SN-9' })], 'serial-on-two-lots');
  assert.equal(three.length, 1);
  assert.match(three[0].message, /^The serial SN-9 is on the lot L-2 at row 2, but on the lot L-1 at row 1;/);
});

test('custody-gap: the next event on a lot is by a party it was not shipped to, or the recipient ships without a receive', () => {
  const base = [produce(), ship()];
  const other = ofCheck([...base, receive({ party: YARD })], 'custody-gap');
  assert.equal(other.length, 1);
  assert.match(other[0].message, /^Row 3 \(receive\) is by Yard Logistics, but row 2 \(ship\) sends the lot RM-1 to Zenith Foods\.$/);
  const noReceive = ofCheck([...base, ship({ event_id: 'E-3', party: DEPOT, to_party: YARD, event_time: '2101-02-04T08:00:00Z' })], 'custody-gap');
  assert.equal(noReceive.length, 1);
  assert.match(noReceive[0].message, /^Row 3 \(ship\): Zenith Foods ships the lot RM-1, but row 2 \(ship\) only sends it to Zenith Foods and no receive by Zenith Foods follows\.$/);
  const scrapped = ofCheck([...base, scrap({ party: YARD })], 'custody-gap');
  assert.equal(scrapped.length, 1);
  assert.match(scrapped[0].message, /sent it to Zenith Foods, so the next event should be by Zenith Foods/);
  assert.deepEqual(ofCheck([...base, receive()], 'custody-gap'), []);
  assert.deepEqual(ofCheck([...base, receive(), scrap()], 'custody-gap'), []);
});

test('custody-gap: a party acts on a lot another party last held, a receive that names another sender, and a lot with no history', () => {
  const held = ofCheck([produce(), scrap({ party: YARD, lot: 'RM-1' })], 'custody-gap');
  assert.equal(held.length, 1);
  assert.match(held[0].message, /^Row 2 \(scrap\): Yard Logistics scraps the lot RM-1, but the last party the file shows holding it is Acme Mill\.$/);
  const sender = ofCheck([produce(), ship(), receive({ from_party: YARD })], 'custody-gap');
  assert.equal(sender.length, 1);
  assert.match(sender[0].message, /^Row 3 \(receive\) says the lot RM-1 came from Yard Logistics, but row 2 \(ship\) sends it from Acme Mill\.$/);
  assert.deepEqual(ofCheck([ship({ lot: 'ELSEWHERE-1' })], 'custody-gap'), [], 'the first event the file shows on a lot has no history to disagree with');
  assert.deepEqual(ofCheck([produce(), ship(), receive({ from_party: 'acme MILL' })], 'custody-gap'), []);
});

test('custody-gap: a lot split between two recipients, and a file whose rows are not in the order of time', () => {
  const split = [produce({ quantity: '100' }), ship({ quantity: '40' }), ship({ event_id: 'E-3', to_party: YARD, quantity: '60' }), receive({ quantity: '40' }), receive({ event_id: 'E-5', party: YARD, quantity: '60' })];
  assert.deepEqual(ofCheck(split, 'custody-gap'), []);
  assert.deepEqual(idsOf(split), []);
  const shuffled = [receive(), assemble(), produce(), scrap(), ship()];
  assert.deepEqual(ofCheck(shuffled, 'custody-gap'), []);
  assert.deepEqual(ofCheck(shuffled, 'custody-time-reversed'), []);
});

test('custody-time-reversed: a receive before its ship, a ship or scrap before the lot exists, and the same day is fine', () => {
  const f = ofCheck([produce(), ship({ event_time: '2101-02-05T08:00:00Z' }), receive({ event_time: '2101-02-04T08:00:00Z' })], 'custody-time-reversed');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^Row 3 \(receive\) takes in the lot RM-1 at 2101-02-04T08:00:00Z, before row 2 \(ship\) sends it at 2101-02-05T08:00:00Z\.$/);
  assert.equal(ofCheck([receive({ event_time: '2101-02-04T08:00:00Z' }), produce(), ship({ event_time: '2101-02-05T08:00:00Z' })], 'custody-time-reversed').length, 1, 'the receive comes first in the file');
  assert.deepEqual(ofCheck([produce(), ship({ event_time: '2101-02-05' }), receive({ event_time: '2101-02-05T01:00:00Z' })], 'custody-time-reversed'), [], 'a day and a time on it');
  assert.deepEqual(ofCheck([produce(), ship({ event_time: '2101-02-05T08:00:00Z' }), receive({ event_time: '2101-02-05T08:00:00Z' })], 'custody-time-reversed'), []);
  const early = ofCheck([produce({ event_time: '2101-02-10T08:00:00Z' }), ship({ event_time: '2101-02-09T08:00:00Z' })], 'custody-time-reversed');
  assert.equal(early.length, 1);
  assert.match(early[0].message, /^Row 2 \(ship\) takes the lot RM-1 out at 2101-02-09T08:00:00Z, before the first row that receives or makes it, row 1,/);
  assert.equal(ofCheck([produce({ event_time: '2101-02-10T08:00:00Z' }), scrap({ party: MILL, event_time: '2101-02-09T08:00:00Z' })], 'custody-time-reversed').length, 1);
});

test('receive-without-ship and ship-without-receive: notes for a receive nobody sent and a ship nobody took in', () => {
  const r = ofCheck([receive()], 'receive-without-ship');
  assert.equal(r.length, 1);
  assert.match(r[0].message, /^Row 1 \(receive\) takes in the lot RM-1 at Zenith Foods, but no ship row of the file sends it there\.$/);
  const s = ofCheck([produce(), ship()], 'ship-without-receive');
  assert.equal(s.length, 1);
  assert.match(s[0].message, /^Row 2 \(ship\) sends the lot RM-1 to Zenith Foods, but no receive row of the file takes it in there\.$/);
  assert.deepEqual(ofCheck([produce(), ship(), receive()], 'receive-without-ship'), []);
  assert.deepEqual(ofCheck([produce(), ship(), receive()], 'ship-without-receive'), []);
  assert.equal(ofCheck([produce(), ship(), ship({ event_id: 'E-3', to_party: YARD, quantity: '1' }), receive()], 'ship-without-receive').length, 1, 'one of two shipments is taken in');
  for (const id of ['receive-without-ship', 'ship-without-receive']) assert.equal(RULES.find((x) => x.id === id).severity, 'info');
});

test('genealogy-loop: a lot that is its own input, a loop of two and of three, and the near misses: a diamond and a chain', () => {
  const mk = (lot, inputs, id) => produce({ event_id: id, lot, quantity: '1', input_lots: inputs });
  const self = ofCheck([mk('A', 'A:1:kg', 'E-1')], 'genealogy-loop');
  assert.equal(self.length, 1);
  assert.match(self[0].message, /^The lot A is listed as one of its own inputs\. Row 1 \(produce\) closes the loop;/);
  const two = ofCheck([mk('A', 'B:1:kg', 'E-1'), mk('B', 'A:1:kg', 'E-2')], 'genealogy-loop');
  assert.equal(two.length, 1);
  assert.match(two[0].message, /^The lot A is made from B, which is made from A again\. Row 2 \(produce\) closes the loop;/);
  const three = ofCheck([mk('A', 'B:1:kg', 'E-1'), mk('B', 'C:1:kg', 'E-2'), mk('C', 'A:1:kg', 'E-3')], 'genealogy-loop');
  assert.equal(three.length, 1);
  assert.match(three[0].message, /^The lot A is made from B, which is made from C, which is made from A again\./);
  const diamond = [mk('D', 'B:1:kg;C:1:kg', 'E-1'), mk('B', 'A:1:kg', 'E-2'), mk('C', 'A:1:kg', 'E-3'), mk('A', '', 'E-4')];
  assert.deepEqual(ofCheck(diamond, 'genealogy-loop'), []);
  assert.deepEqual(ofCheck([mk('A', 'B:1:kg', 'E-1'), mk('B', 'C:1:kg', 'E-2'), mk('C', '', 'E-3')], 'genealogy-loop'), []);
  assert.equal(ofCheck([mk('A', 'B:1:kg', 'E-1'), mk('B', 'A:1:kg', 'E-2'), mk('X', 'Y:1:kg', 'E-3'), mk('Y', 'X:1:kg', 'E-4')], 'genealogy-loop').length, 2);
});

test('genealogy-loop: a long loop names the first lots and counts the rest', () => {
  const n = 12;
  const rows = Array.from({ length: n }, (_, i) => produce({ event_id: `E-${i}`, lot: `L${i}`, quantity: '1', input_lots: `L${(i + 1) % n}:1:kg` }));
  const f = ofCheck(rows, 'genealogy-loop');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The lot L0 is made from L1, which is made from L2,.*, which is made from L7, which is made from 4 more lots, which is made from L0 again\./);
});

test('duplicate-row: a row written twice is reported once and left out of the other checks', () => {
  const row = produce({ event_id: 'E-1' });
  const text = table([row, row]);
  const r = checkText(text);
  assert.deepEqual(r.findings.map((f) => f.id), ['duplicate-row']);
  assert.equal(r.findings[0].line, 3);
  assert.match(r.findings[0].message, /^Row 2 has the same cells as row 1, on line 2, so one event is counted twice\./);
  assert.equal(r.analysis.summary.rows, 2);
  assert.deepEqual(idsOf([produce(), produce({ lot: 'RM-2' })]), [], 'a row that differs in one cell is another row');
  const once = ship({ event_id: 'S-1', quantity: '60' });
  assert.deepEqual(idsOf([produce({ quantity: '100' }), once, once]), ['duplicate-row', 'ship-without-receive'], 'the repeated ship does not count twice');
  assert.deepEqual(idsOf([produce({ quantity: '100' }), once, { ...once, event_id: 'S-2' }]).includes('lot-overdrawn'), true, 'a ship with another event_id is another ship');
});

test('event-id-repeated: one event_id on two rows that are not one event; rows of one event may share it', () => {
  const f = ofCheck([produce({ event_id: 'X-1' }), produce({ event_id: 'X-1', lot: 'RM-2', event_time: '2101-02-02T08:00:00Z' })], 'event-id-repeated');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The event_id of row 2, X-1, is also the event_id of row 1, on line 2, and the two rows are not one event;/);
  assert.equal(ofCheck([produce({ event_id: 'X-1' }), assemble({ event_id: 'X-1', lot: 'F-1', input_lots: 'RM-1:1:kg', quantity: '1' })], 'event-id-repeated').length, 1, 'a produce row and an assemble row are two events');
  assert.deepEqual(ofCheck([produce({ event_id: 'X-1' }), produce({ event_id: 'X-1', lot: 'RM-2' })], 'event-id-repeated'), [], 'two lots made by one event');
  assert.deepEqual(ofCheck([produce(), assemble({ event_id: 'W-1', lot: 'F-1', input_lots: 'RM-1:1:kg', quantity: '1' }), assemble({ event_id: 'W-1', lot: 'F-2', input_lots: 'RM-1:1:kg', quantity: '1' })], 'event-id-repeated'), []);
  assert.equal(ofCheck([produce(), assemble({ event_id: 'W-1', lot: 'F-1', input_lots: 'RM-1:1:kg', quantity: '1' }), assemble({ event_id: 'W-1', event_time: '2101-02-04T09:00:00Z', lot: 'F-2', input_lots: 'RM-1:1:kg', quantity: '1' })], 'event-id-repeated').length, 1, 'another time is another event');
});

test('the header: a column missing is reported once at the header, an unknown column with the nearest, a name written twice, a nameless column', () => {
  const columns = COLUMN_NAMES.filter((c) => c !== 'product');
  const missing = checkText(table([produce(), ship(), receive()], columns)).findings.filter((f) => f.id === 'column-missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].line, 1);
  assert.match(missing[0].message, /^The header has no "product" column, but the rows of produce and receive need it; 2 rows are affected/);
  const unit = checkText(table([produce()], COLUMN_NAMES.filter((c) => c !== 'unit'))).findings;
  assert.deepEqual(unit.map((f) => f.id), ['column-missing']);
  const unknown = checkText(table([produce()], [...COLUMN_NAMES, 'serials', 'Remark'])).findings.filter((f) => f.id === 'column-unknown');
  assert.equal(unknown.length, 2);
  assert.match(unknown[0].message, /^The column "serials" is not a column the tool reads, so the values under it are not checked\. Did you mean serial\?$/);
  assert.doesNotMatch(unknown[1].message, /Did you mean/);
  const dup = checkText(table([produce()], [...COLUMN_NAMES, 'Event Type'])).findings.filter((f) => f.id === 'column-duplicate');
  assert.equal(dup.length, 1);
  assert.match(dup[0].message, /^The column "Event Type" has the same name as column 2 once case and separators are ignored; only the first is read\.$/);
  assert.equal(checkText(table([produce()], [...COLUMN_NAMES, ''])).findings.filter((f) => f.id === 'column-unknown').length, 1);
  const [head, ...body] = table(clean()).split('\n');
  const spaced = [COLUMN_NAMES.map((c) => c.toUpperCase().replace(/_/g, ' ')).join(','), ...body].join('\n');
  assert.notEqual(spaced, [head, ...body].join('\n'));
  assert.deepEqual(idsOf(spaced), [], 'names in any case with any separator are one column');
});

test('row-malformed: a row of the wrong width is reported and left out; the reader does not shift its cells', () => {
  const text = `${table([produce()])}E-2,ship,2101-02-02T08:00:00Z,Acme Mill\n`;
  const r = checkText(text);
  assert.deepEqual(r.findings.map((f) => f.id), ['row-malformed']);
  assert.equal(r.findings[0].line, 3);
  assert.equal(r.analysis.summary.skipped, 1);
  assert.match(r.findings[0].message, /^Row 2 has 4 cells but the header has 14;/);
  assert.equal(r.analysis.summary.rows, 1);
});

test('file-unreadable: no event_type column, no rows, an open quote and semicolons; nothing is checked and the file does not pass', () => {
  const noType = checkText('event_id,lot\nE-1,A\n');
  assert.deepEqual(noType.findings.map((f) => f.id), ['file-unreadable']);
  assert.match(noType.findings[0].message, /^The header has no event_type column/);
  assert.deepEqual(noType.notes, ['the file was not checked, because it has no event_type column']);
  assert.deepEqual(checkText('event_id,event_type\n').findings.map((f) => f.id), ['file-unreadable']);
  assert.deepEqual(checkText('').findings.map((f) => f.id), ['file-unreadable']);
  assert.deepEqual(checkText('event_type,lot\nship,"A\n').findings.map((f) => f.id), ['file-unreadable']);
  assert.match(checkText('event_type;lot\nship;A\n').findings[0].message, /semicolons/);
});

test('placeholders: n/a, none, tbd, a dash and a question mark in any case say nothing', () => {
  for (const p of ['n/a', 'N/A', 'na', 'none', 'NULL', 'nil', 'tbd', 'unknown', '-', '--', '?']) assert.equal(ofCheck([produce({ lot: p })], 'event-incomplete').length, 1, p);
  assert.deepEqual(ofCheck([produce({ lot: 'none-1' })], 'event-incomplete'), [], 'a lot that only starts with a placeholder');
});

test('findings are capped for each check, and the cap is a count that the report shows', () => {
  const rows = Array.from({ length: FINDING_CAP + 5 }, (_, i) => produce({ event_id: `E-${i}`, lot: `L${i}`, event_time: '2101-02-30' }));
  const r = checkText(table(rows));
  assert.equal(r.findings.filter((f) => f.id === 'date-invalid').length, FINDING_CAP);
  assert.equal(r.analysis.omitted.get('date-invalid'), 5);
});

test('prototype names are only names: as lots, parties, serials, event ids and units', () => {
  const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
  const rows = names.flatMap((n, i) => [produce({ event_id: `P-${i}`, lot: n, party: n, serial: n, quantity: '5', unit: n }), ship({ event_id: `S-${i}`, lot: n, party: n, to_party: n, quantity: '5', unit: n })]);
  const r = checkText(table(rows), { now: NOW });
  assert.equal({}.polluted, undefined);
  assert.deepEqual(r.findings.map((f) => f.id), ['ship-without-receive', 'ship-without-receive', 'ship-without-receive', 'ship-without-receive']);
  assert.equal(r.model.lots.size, 4);
});
