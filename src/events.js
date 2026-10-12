// Reads the table into events. The header is read first (which column is which), then each row on its own: its kind of
// event, its cells, its date, its quantity and its input lots, with the findings of the row. The result is the model that
// the checks across rows (src/across.js) and the trace (src/trace.js) work on. Nothing here reads a clock: the one moment
// is the one of --now, read by src/dates.js.

import { cellAt } from './csv.js';
import { addDecimal, compareDecimal, formatDecimal, isZero, mulDecimal, parseDecimal, percentOf, ZERO } from './decimal.js';
import { isFuture, readDate } from './dates.js';
import { ALWAYS, COLUMN_NAMES, EVENT_TYPES, nearest, normalizeName, typeOf } from './fields.js';
import { isPlaceholder, list, nameKey, show, unitKey } from './collect.js';

const DAY_NS = 86400n * 1000000000n;

// The moment of a read date as one BigInt, so that dates can be sorted: the nanosecond, or the start of the day for a day
// alone.
export const momentKey = (d) => d.ns ?? BigInt(d.day) * DAY_NS;

// Whether the read date a is before the read date b. Two dates with a time are compared to the nanosecond; when either is a
// day alone the days are compared, so that a day and a time on it are not out of order.
export const isBefore = (a, b) => (a.ns !== null && b.ns !== null ? a.ns < b.ns : a.day < b.day);

// One row of the table, read through the header. get(column) is the trimmed text of a cell, '' where the column is not in
// the file, and null where the cell holds a secret, which no check reads.
class Rec {
  constructor(raw, n, index, secretColumns) {
    this.raw = raw;
    this.n = n;
    this.line = raw.line;
    this.index = index;
    this.secretColumns = secretColumns;
  }

  get(column) {
    const i = this.index.get(column);
    if (i === undefined) return '';
    if (this.secretColumns.has(i) || this.raw.secrets?.has(i)) return null;
    return this.raw.cells[i].trim();
  }

  // The text of a cell that says something, else null (empty, a placeholder, a secret or no such column).
  val(column) {
    const v = this.get(column);
    return v === null || v === '' || isPlaceholder(v) ? null : v;
  }

  // Whether the cell says something: a secret does, because it was there but is not read.
  has(column) {
    const v = this.get(column);
    return v === null || (v !== '' && !isPlaceholder(v));
  }

  // The line and column of a cell of this row, or of the first cell when the column is not in the file.
  where(column) {
    const i = this.index.get(column);
    return cellAt(this.raw, i === undefined ? 0 : i);
  }
}

// The input lots of a produce or assemble row: "lot:quantity:unit" entries separated by semicolons. The unit and the
// quantity are taken from the right, so a lot code may hold a colon. Returns { entries, problems }.
export function readInputLots(text) {
  const entries = [];
  const problems = [];
  const segments = text.split(';');
  for (let k = 0; k < segments.length; k += 1) {
    const raw = segments[k].trim();
    if (raw === '') continue;
    const parts = raw.split(':');
    if (parts.length < 3) {
      problems.push(`entry ${k + 1}, "${show(raw)}", is not written lot:quantity:unit`);
      continue;
    }
    const unit = parts.pop().trim();
    const qtext = parts.pop().trim();
    const lot = parts.join(':').trim();
    if (lot === '') problems.push(`entry ${k + 1}, "${show(raw)}", has no lot before the quantity`);
    else if (unit === '') problems.push(`entry ${k + 1}, "${show(raw)}", has no unit after the quantity`);
    else {
      const qty = parseDecimal(qtext);
      if (qty === null || isZero(qty)) problems.push(`entry ${k + 1}, "${show(raw)}", has a quantity that is not a plain number above zero`);
      else entries.push({ lot, qty, unit: unitKey(unit), unitText: unit, text: raw });
    }
  }
  return { entries, problems };
}

// Whether two rows with one event_id are rows of one event: rows that make lots from the same inputs side by side.
const sameEvent = (a, b) => a.group !== null && a.group === b.group;

// Reads the table. Returns { model, summary } or, when the file cannot be read as events, { model: null }.
export function readEvents(table, collector, { now = null, tolerance = ZERO } = {}) {
  const { add, notes } = collector;
  const { header, rows } = table;
  const secretColumns = table.secretColumns ?? new Set();
  const cell = (row, i) => cellAt(row, i);

  // The header: which column is which.
  const index = new Map();
  let unknown = 0;
  header.cells.forEach((raw, i) => {
    if (secretColumns.has(i)) return;
    const name = normalizeName(raw);
    if (name === '') {
      add('column-unknown', cell(header, i), `Column ${i + 1} of the header has no name, so the values under it are not read.`);
      unknown += 1;
    } else if (index.has(name)) {
      add('column-duplicate', cell(header, i), `The column "${show(raw)}" has the same name as column ${index.get(name) + 1} once case and separators are ignored; only the first is read.`);
    } else if (COLUMN_NAMES.includes(name)) index.set(name, i);
    else {
      const near = nearest(name, COLUMN_NAMES);
      add('column-unknown', cell(header, i), `The column "${show(raw)}" is not a column the tool reads, so the values under it are not checked.${near ? ` Did you mean ${near}?` : ''}`);
      unknown += 1;
    }
  });
  if (!index.has('event_type')) {
    add('file-unreadable', cell(header, 0), 'The header has no event_type column, so the kind of event of a row is not known. Nothing in the file was checked.');
    return { model: null };
  }

  const recs = [];
  rows.forEach((raw, k) => {
    if (raw.cells.length !== header.cells.length) {
      add('row-malformed', cell(raw, 0), `Row ${k + 1} has ${raw.cells.length} ${raw.cells.length === 1 ? 'cell' : 'cells'} but the header has ${header.cells.length}; the row was left out of every other check. A cell that holds a comma, a tab or a line end must be in double quotes.`);
      return;
    }
    recs.push(new Rec(raw, k + 1, index, secretColumns));
  });

  const nowDate = now === null ? null : readDate(now);
  const events = [];
  const groups = new Map();
  const typeRows = new Map(EVENT_TYPES.map((t) => [t.id, 0]));
  const typeLots = new Map(EVENT_TYPES.map((t) => [t.id, new Set()]));
  const absent = new Map();
  const lots = new Set();
  const parties = new Set();
  const serials = new Set();
  const seenRows = new Map();
  const ids = new Map();
  let otherRows = 0;
  let first = null;
  let last = null;
  const needColumn = (column, type) => {
    const entry = absent.get(column) ?? { types: new Set(), rows: 0 };
    entry.types.add(type.label);
    entry.rows += 1;
    absent.set(column, entry);
  };

  for (const rec of recs) {
    // A row written twice is reported and left out of everything else, so that its quantities are not counted twice.
    const rowKey = rec.raw.cells.map((c) => c.trim()).join('\u0001');
    const firstRow = seenRows.get(rowKey);
    if (firstRow !== undefined) {
      const lotOfRow = rec.val('lot');
      add('duplicate-row', cell(rec.raw, 0), `Row ${rec.n} has the same cells as row ${firstRow.n}, on line ${firstRow.line}, so one event is counted twice. It was left out of the other checks.`, lotOfRow === null ? null : show(lotOfRow, 80));
      continue;
    }
    seenRows.set(rowKey, rec);

    const kind = rec.get('event_type');
    const typeId = kind === null ? null : normalizeName(kind);
    const type = typeId === null ? null : typeOf(typeId) ?? null;
    if (type === null) {
      otherRows += 1;
      const blank = kind === null || typeId === '' || isPlaceholder(kind);
      const near = blank ? null : nearest(typeId, EVENT_TYPES.map((t) => t.id));
      add('event-type-unknown', rec.where('event_type'), blank
        ? `Row ${rec.n} has no event_type, so the kind of event is not known and the row was not checked.`
        : `The event_type of row ${rec.n}, "${show(kind)}", is not one of ${EVENT_TYPES.map((t) => t.id).join(', ')}.${near ? ` Did you mean ${near}?` : ''} The row was not checked.`);
      continue;
    }
    typeRows.set(type.id, typeRows.get(type.id) + 1);

    const ev = {
      n: rec.n, line: rec.line, rec, type: type.id, label: type.label,
      id: rec.val('event_id'), party: rec.val('party'), to: rec.val('to_party'), from: rec.val('from_party'), site: rec.val('site'),
      lot: rec.val('lot'), serial: rec.val('serial'), product: rec.val('product'),
      qty: null, unit: null, unitText: null, date: null, key: null, inputs: [], inputsBroken: false, group: null
    };
    const subject = ev.lot === null ? null : show(ev.lot, 80);
    const tag = `row ${rec.n} (${type.label})`;

    // Columns the rows need and the file does not have, once each; cells they need that are empty, row by row.
    const missing = [];
    for (const column of [...ALWAYS, ...type.needs]) {
      if (!index.has(column)) needColumn(column, type);
      else if (!rec.has(column)) missing.push(column);
    }
    if (!index.has('unit')) needColumn('unit', type);
    if (missing.length > 0) {
      const names = missing.map((c) => `"${c}"`);
      add('event-incomplete', rec.where(missing[0]), `Row ${rec.n} (${type.label}) has no value in ${missing.length > 1 ? 'the cells' : 'the cell'} under ${list(names)}, which a ${type.label} row needs.`, subject);
    }
    if (type.id === 'ship' && ev.from !== null && ev.party !== null && nameKey(ev.from) !== nameKey(ev.party)) {
      add('event-incomplete', rec.where('from_party'), `The from_party of row ${rec.n} (ship), "${show(ev.from)}", is not the party of the row, "${show(ev.party)}"; a ship row is written by the party that sends the lot.`, subject);
    }

    // The date.
    const timeText = rec.val('event_time');
    if (timeText !== null) {
      const d = readDate(timeText);
      if (d.problem) add('date-invalid', rec.where('event_time'), `The event_time of ${tag}, "${show(timeText)}", ${d.problem}.`, subject);
      else {
        ev.date = d;
        ev.key = momentKey(d);
        if (first === null || ev.key < first.key) first = { key: ev.key, text: timeText };
        if (last === null || ev.key > last.key) last = { key: ev.key, text: timeText };
        if (nowDate && !nowDate.problem && isFuture(d, nowDate)) add('future-date', rec.where('event_time'), `The event_time of ${tag}, ${show(timeText)}, is after the moment given with --now.`, subject);
      }
    }

    // The quantity and the unit.
    const qtext = rec.val('quantity');
    const utext = rec.val('unit');
    if (qtext !== null) {
      const q = parseDecimal(qtext);
      if (q === null) add('quantity-not-positive', rec.where('quantity'), `The quantity of ${tag}, "${show(qtext)}", is not a plain number above zero (no sign, separator, exponent or text, and at most 40 digits).`, subject);
      else if (isZero(q)) add('quantity-not-positive', rec.where('quantity'), `The quantity of ${tag} is zero; a quantity must be above zero.`, subject);
      else ev.qty = q;
      if (utext === null && index.has('unit')) add('unit-missing', rec.where('unit'), `The quantity of ${tag}, ${show(qtext)}, has no unit in the unit column.`, subject);
    }
    if (utext !== null) {
      ev.unit = unitKey(utext);
      ev.unitText = show(utext, 30);
    }

    // The input lots of produce and assemble.
    const itext = type.inputs ? rec.val('input_lots') : null;
    if (itext !== null) {
      const { entries, problems } = readInputLots(itext);
      ev.inputs = entries;
      if (problems.length > 0) {
        ev.inputsBroken = true;
        add('input-lots-unreadable', rec.where('input_lots'), `The input_lots of ${tag}: ${problems[0]}${problems.length > 1 ? `, and ${problems.length - 1} more` : ''}. Write each as lot:quantity:unit and separate the entries with semicolons.`, subject);
      }
    }

    // The group of rows of one event that makes lots: the same event_id, kind, party and time.
    if (type.inputs) {
      const gkey = `${ev.id ?? `row ${ev.n}`}\u0001${ev.type}\u0001${ev.party ?? ''}\u0001${timeText ?? ''}`;
      let group = groups.get(gkey);
      if (group === undefined) {
        group = { id: ev.id, type: ev.type, party: ev.party, evs: [], counted: [] };
        groups.set(gkey, group);
      }
      for (const e of ev.inputs) {
        e.ev = ev;
        group.counted.push(e);
      }
      group.evs.push(ev);
      ev.group = group;
    }

    // The same event_id on a row that is not a part of the same event.
    if (ev.id !== null) {
      const earlier = ids.get(ev.id);
      if (earlier === undefined) ids.set(ev.id, ev);
      else if (!sameEvent(earlier, ev)) add('event-id-repeated', rec.where('event_id'), `The event_id of row ${rec.n}, ${show(ev.id)}, is also the event_id of row ${earlier.n}, on line ${earlier.line}, and the two rows are not one event; give each event its own identifier.`, subject);
    }

    if (ev.lot !== null) {
      lots.add(ev.lot);
      typeLots.get(type.id).add(ev.lot);
    }
    if (ev.party !== null) parties.add(ev.party);
    if (ev.to !== null) parties.add(ev.to);
    if (ev.serial !== null) serials.add(ev.serial);
    events.push(ev);
  }

  for (const [column, entry] of absent) {
    add('column-missing', cell(header, 0), `The header has no "${column}" column, but the rows of ${list([...entry.types])} need it; ${entry.rows} ${entry.rows === 1 ? 'row is' : 'rows are'} affected and none of them is reported for it one by one.`);
  }

  // The mass balance of each event that makes lots: the outputs against the inputs, in one unit.
  for (const group of groups.values()) checkBalance(group, add, tolerance);

  if (now === null) notes.push('no --now was given, so future-date did not run');
  else if (nowDate.problem) notes.push('--now could not be read, so future-date did not run');

  const byType = EVENT_TYPES.map((t) => ({ id: t.id, label: t.label, rows: typeRows.get(t.id), lots: typeLots.get(t.id).size })).filter((t) => t.rows > 0);
  if (otherRows > 0) byType.push({ id: 'other', label: 'no known kind', rows: otherRows, lots: 0 });
  const summary = {
    rows: recs.length,
    skipped: rows.length - recs.length,
    columns: header.cells.length,
    read: index.size,
    unread: unknown + secretColumns.size,
    lots: lots.size,
    parties: parties.size,
    serials: serials.size,
    types: byType,
    firstTime: first ? show(first.text, 40) : null,
    lastTime: last ? show(last.text, 40) : null
  };
  return { model: { events, groups, lots, parties, serials }, summary };
}

// The outputs of an event that makes lots against its inputs. The rows of one event_id, kind, party and time are one event;
// its inputs are the input_lots of all its rows added up, and its outputs are the quantities of all its rows.
function checkBalance(group, add, tolerance) {
  const outs = group.evs;
  if (group.counted.length === 0 || outs.some((e) => e.inputsBroken || e.qty === null || e.unit === null)) return;
  const unitsIn = new Set(group.counted.map((e) => e.unit));
  const unitsOut = new Set(outs.map((e) => e.unit));
  const head = outs[0];
  const what = `${head.label} event ${group.id === null ? `of row ${head.n}` : show(group.id, 40)}`;
  if (unitsIn.size !== 1 || unitsOut.size !== 1 || [...unitsIn][0] !== [...unitsOut][0]) {
    add('units-not-comparable', head.rec.where('quantity'), `The ${what} has inputs in ${list([...unitsIn].map((u) => show(u, 30)))} and outputs in ${list([...unitsOut].map((u) => show(u, 30)))}, so the tool cannot compare what it makes with what it uses; it compares in one unit only.`, head.lot === null ? null : show(head.lot, 80));
    return;
  }
  let inSum = ZERO;
  for (const e of group.counted) inSum = addDecimal(inSum, e.qty);
  const allowed = addDecimal(inSum, mulDecimal(inSum, percentOf(tolerance)));
  const unit = show([...unitsIn][0], 30);
  let outSum = ZERO;
  for (const e of outs) {
    outSum = addDecimal(outSum, e.qty);
    if (compareDecimal(outSum, allowed) > 0) {
      const margin = isZero(tolerance) ? '' : ` plus the yield tolerance of ${formatDecimal(tolerance)} percent`;
      add('mass-balance-exceeded', e.rec.where('quantity'), `By row ${e.n} the ${what} makes ${formatDecimal(outSum)} ${unit} in total, more than the ${formatDecimal(inSum)} ${unit} of its inputs${margin}.`, e.lot === null ? null : show(e.lot, 80));
      return;
    }
  }
}
