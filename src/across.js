// The checks across rows. Every check works through maps built in one pass over the events, so one lot in a hundred
// thousand rows stays linear and no pair of rows is compared. Quantities are added with exact decimals and only in one
// unit; a lot counted in two units is reported as a note and not compared. The order of events along a lot is the order
// of their times, with the order of the file for equal times.

import { addDecimal, compareDecimal, formatDecimal, ZERO } from './decimal.js';
import { findLoops } from './graph.js';
import { isBefore } from './events.js';
import { nameKey, show } from './collect.js';

const SUPPLY = new Set(['receive', 'produce', 'assemble']);

const when = (ev) => show(ev.rec.val('event_time') ?? '', 40);
const lotText = (lot) => show(lot, 80);
const who = (name) => show(name, 60);

// The graph of the lots: each lot made by produce or assemble, with the lots it is made from. With reverse, each lot with
// the lots that are made from it.
export function buildGraph(model, { reverse = false } = {}) {
  const graph = new Map();
  const edge = (from, to, ev) => {
    const edges = graph.get(from);
    if (edges === undefined) graph.set(from, [{ lot: to, ev }]);
    else edges.push({ lot: to, ev });
  };
  for (const ev of model.events) {
    if (ev.lot === null) continue;
    for (const e of ev.inputs) {
      if (reverse) edge(e.lot, ev.lot, ev);
      else edge(ev.lot, e.lot, ev);
    }
  }
  return graph;
}

export function checkAcross(model, add) {
  const { events } = model;

  // One pass: what each party receives or makes of each lot, what leaves it, and the events along each lot.
  const supply = new Map();
  const supplied = new Set();
  const first = new Map();
  const withdrawals = new Map();
  const chain = new Map();
  const consumed = [];
  const push = (map, lot, item) => {
    const list = map.get(lot);
    if (list === undefined) map.set(lot, [item]);
    else list.push(item);
  };
  let i = 0;
  for (const ev of events) {
    i += 1;
    const lot = ev.lot;
    if (lot !== null) {
      if (SUPPLY.has(ev.type)) {
        supplied.add(lot);
        if (ev.party !== null && ev.qty !== null && ev.unit !== null) {
          let parties = supply.get(lot);
          if (parties === undefined) {
            parties = new Map();
            supply.set(lot, parties);
          }
          const party = nameKey(ev.party);
          let units = parties.get(party);
          if (units === undefined) {
            units = new Map();
            parties.set(party, units);
          }
          const held = units.get(ev.unit);
          if (held === undefined) units.set(ev.unit, { sum: ev.qty, ev });
          else held.sum = addDecimal(held.sum, ev.qty);
        }
        if (ev.date !== null) {
          const earliest = first.get(lot);
          if (earliest === undefined || ev.key < earliest.key) first.set(lot, { key: ev.key, ev });
        }
      } else if (ev.qty !== null && ev.unit !== null) push(withdrawals, lot, { kind: ev.type, ev, qty: ev.qty, unit: ev.unit, unitText: ev.unitText });
      if (ev.party !== null && ev.key !== null) push(chain, lot, { kind: ev.type === 'assemble' ? 'produce' : ev.type, ev, party: ev.party, key: ev.key, i });
    }
    for (const e of ev.inputs) {
      consumed.push({ lot: e.lot, ev });
      push(withdrawals, e.lot, { kind: 'consume', ev, qty: e.qty, unit: e.unit, unitText: e.unitText });
      if (ev.party !== null && ev.key !== null) push(chain, e.lot, { kind: 'consume', ev, party: ev.party, key: ev.key, i });
    }
  }

  // An input lot that no row receives or makes, or that is received or made only after it is used.
  for (const { lot, ev } of consumed) {
    const earliest = first.get(lot);
    if (!supplied.has(lot)) {
      add('input-lot-not-available', ev.rec.where('input_lots'), `Row ${ev.n} (${ev.label}) uses the input lot ${lotText(lot)}, which no receive or produce row of the file holds.`, lotText(lot));
    } else if (ev.date !== null && earliest !== undefined && isBefore(ev.date, earliest.ev.date)) {
      add('input-lot-not-available', ev.rec.where('input_lots'), `Row ${ev.n} (${ev.label}) uses the input lot ${lotText(lot)} at ${when(ev)}, but the first row that receives or makes it, row ${earliest.ev.n}, is dated ${when(earliest.ev)}.`, lotText(lot));
    }
  }

  // A party that holds a lot in two units.
  for (const [lot, parties] of supply) {
    for (const units of parties.values()) {
      if (units.size < 2) continue;
      const [a, b] = [...units.values()];
      add('units-not-comparable', b.ev.rec.where('unit'), `${who(b.ev.party)} holds the lot ${lotText(lot)} in ${show(a.ev.unitText, 30)} at row ${a.ev.n} and in ${show(b.ev.unitText, 30)} at row ${b.ev.n}; the tool compares a lot in one unit at a time.`, lotText(lot));
    }
  }

  // A party whose lot leaves in a larger quantity than the party received or made. The sums are per lot, party and unit;
  // a party that holds none of the lot is left to custody-gap when another party holds it.
  for (const [lot, list] of withdrawals) {
    const parties = supply.get(lot);
    const taken = new Map();
    const done = new Set();
    for (const w of list) {
      if (w.ev.party === null) continue;
      const party = nameKey(w.ev.party);
      const units = parties?.get(party);
      let held = units?.get(w.unit);
      const key = `${party}\u0001${w.unit}`;
      if (held === undefined) {
        if (units !== undefined) {
          if (!done.has(key)) {
            done.add(key);
            add('units-not-comparable', w.ev.rec.where(w.kind === 'consume' ? 'input_lots' : 'unit'), `Row ${w.ev.n} (${w.ev.label}) takes the lot ${lotText(lot)} out in ${show(w.unitText, 30)}, but ${who(w.ev.party)} holds it in ${[...units.values()].map((h) => show(h.ev.unitText, 30)).join(' and ')}; the tool compares a lot in one unit at a time.`, lotText(lot));
          }
          continue;
        }
        if (supplied.has(lot) || w.kind === 'consume') continue;
        held = { sum: ZERO };
      }
      const total = addDecimal(taken.get(key) ?? ZERO, w.qty);
      taken.set(key, total);
      if (!done.has(key) && compareDecimal(total, held.sum) > 0) {
        done.add(key);
        const unit = show(w.unitText, 30);
        const has = held.ev === undefined ? 'the file receives or makes none of it' : `${who(w.ev.party)} received or made only ${formatDecimal(held.sum)} ${unit} of it`;
        add('lot-overdrawn', w.ev.rec.where(w.kind === 'consume' ? 'input_lots' : 'quantity'), `By row ${w.ev.n} (${w.ev.label}) ${formatDecimal(total)} ${unit} of the lot ${lotText(lot)} have been shipped, scrapped or used by ${who(w.ev.party)}, but ${has}.`, lotText(lot));
      }
    }
  }

  // A serial number born twice, and one on two lots or two products.
  const births = new Map();
  const seen = new Map();
  const mixed = new Set();
  for (const ev of events) {
    if (ev.serial === null) continue;
    if (ev.type === 'produce' || ev.type === 'assemble') {
      const earlier = births.get(ev.serial);
      if (earlier === undefined) births.set(ev.serial, ev);
      else add('serial-born-twice', ev.rec.where('serial'), `The serial ${show(ev.serial, 60)} is made by row ${ev.n} (${ev.label}) and was already made by row ${earlier.n}, on line ${earlier.line}; a serial number names one unit and is made once.`, ev.lot === null ? null : lotText(ev.lot));
    }
    const before = seen.get(ev.serial);
    if (before === undefined) seen.set(ev.serial, ev);
    else if (!mixed.has(ev.serial)) {
      const otherLot = ev.lot !== null && before.lot !== null && ev.lot !== before.lot;
      const otherProduct = ev.product !== null && before.product !== null && ev.product !== before.product;
      if (otherLot || otherProduct) {
        mixed.add(ev.serial);
        add('serial-on-two-lots', ev.rec.where('serial'), `The serial ${show(ev.serial, 60)} is on ${otherLot ? `the lot ${lotText(ev.lot)}` : `the product ${show(ev.product, 60)}`} at row ${ev.n}, but on ${otherLot ? `the lot ${lotText(before.lot)}` : `the product ${show(before.product, 60)}`} at row ${before.n}; one serial number names one unit.`, ev.lot === null ? null : lotText(ev.lot));
      }
    }
  }

  // The custody of each lot, in the order of time.
  for (const [lot, items] of chain) {
    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i));
    walkCustody(lot, items, add);
  }

  // A lot received before it was sent, and sent or scrapped before it was received or made.
  const shipQueue = new Map();
  const receiveQueue = new Map();
  const take = (map, key) => {
    const q = map.get(key);
    if (q === undefined || q.head >= q.items.length) return null;
    q.head += 1;
    return q.items[q.head - 1];
  };
  const hold = (map, key, ev) => {
    const q = map.get(key);
    if (q === undefined) map.set(key, { items: [ev], head: 0 });
    else q.items.push(ev);
  };
  for (const ev of events) {
    if (ev.lot === null || ev.date === null || ev.party === null) continue;
    if (ev.type === 'ship' && ev.to !== null) {
      const key = `${ev.lot}\u0001${nameKey(ev.to)}`;
      const r = take(receiveQueue, key);
      if (r === null) hold(shipQueue, key, ev);
      else reversed(r, ev, add);
    } else if (ev.type === 'receive') {
      const key = `${ev.lot}\u0001${nameKey(ev.party)}`;
      const s = take(shipQueue, key);
      if (s === null) hold(receiveQueue, key, ev);
      else reversed(ev, s, add);
    }
    if (ev.type === 'ship' || ev.type === 'scrap') {
      const earliest = first.get(ev.lot);
      if (earliest !== undefined && earliest.ev !== ev && isBefore(ev.date, earliest.ev.date)) {
        add('custody-time-reversed', ev.rec.where('event_time'), `Row ${ev.n} (${ev.label}) takes the lot ${lotText(ev.lot)} out at ${when(ev)}, before the first row that receives or makes it, row ${earliest.ev.n}, dated ${when(earliest.ev)}.`, lotText(ev.lot));
      }
    }
  }

  // A lot that is its own input, directly or through other lots.
  for (const loop of findLoops(buildGraph(model))) {
    const names = loop.lots.map(lotText);
    const text = loop.length === 1
      ? `The lot ${names[0]} is listed as one of its own inputs`
      : `The lot ${names[0]} is made from ${names.slice(1).join(', which is made from ')}${loop.length > names.length ? `, which is made from ${loop.length - names.length} more lots` : ''}, which is made from ${names[0]} again`;
    add('genealogy-loop', loop.edge.ev.rec.where('input_lots'), `${text}. Row ${loop.edge.ev.n} (${loop.edge.ev.label}) closes the loop; a lot cannot be made from itself.`, names[0]);
  }
}

// A receive dated before the ship that sends it (the receive row r and the ship row s).
function reversed(r, s, add) {
  if (!isBefore(r.date, s.date)) return;
  add('custody-time-reversed', r.rec.where('event_time'), `Row ${r.n} (receive) takes in the lot ${lotText(r.lot)} at ${when(r)}, before row ${s.n} (ship) sends it at ${when(s)}.`, lotText(r.lot));
}

// The events of one lot in the order of time. A ship puts the lot in transit to its recipient; the recipient's receive ends
// it. A party that is not the holder and is not the recipient of a shipment must not ship, scrap or use the lot.
function walkCustody(lot, items, add) {
  const holders = new Map();
  const pending = new Map();
  const all = [];
  let allHead = 0;
  let inTransit = 0;
  let last = null;
  const nextPending = (key) => {
    const q = pending.get(key);
    return q !== undefined && q.head < q.items.length ? q : null;
  };
  const earliestPending = () => {
    while (allHead < all.length && all[allHead].taken) allHead += 1;
    return all[allHead];
  };
  const take = (q) => {
    const p = q.items[q.head];
    q.head += 1;
    p.taken = true;
    inTransit -= 1;
    return p;
  };
  for (const it of items) {
    const ev = it.ev;
    const x = nameKey(it.party);
    if (it.kind === 'receive') {
      const q = nextPending(x);
      if (q !== null) {
        const p = take(q);
        if (ev.from !== null && nameKey(ev.from) !== nameKey(p.ev.party)) {
          add('custody-gap', ev.rec.where('from_party'), `Row ${ev.n} (receive) says the lot ${lotText(lot)} came from ${who(ev.from)}, but row ${p.ev.n} (ship) sends it from ${who(p.ev.party)}.`, lotText(lot));
        }
      } else if (inTransit > 0) {
        const p = earliestPending();
        add('custody-gap', ev.rec.where('party'), `Row ${ev.n} (receive) is by ${who(ev.party)}, but row ${p.ev.n} (ship) sends the lot ${lotText(lot)} to ${who(p.ev.to)}.`, lotText(lot));
      } else {
        add('receive-without-ship', ev.rec.where('party'), `Row ${ev.n} (receive) takes in the lot ${lotText(lot)} at ${who(ev.party)}, but no ship row of the file sends it there.`, lotText(lot));
      }
      holders.set(x, ev.party);
      last = ev.party;
      continue;
    }
    if (it.kind === 'produce') {
      if (!holders.has(x)) holders.set(x, ev.party);
      last = last ?? ev.party;
      continue;
    }
    // Ship, scrap and use.
    if (!holders.has(x)) {
      const q = nextPending(x);
      const verb = it.kind === 'ship' ? 'ships' : it.kind === 'scrap' ? 'scraps' : 'uses';
      if (q !== null) {
        const p = take(q);
        add('custody-gap', ev.rec.where('party'), `Row ${ev.n} (${ev.label}): ${who(ev.party)} ${verb} the lot ${lotText(lot)}, but row ${p.ev.n} (ship) only sends it to ${who(ev.party)} and no receive by ${who(ev.party)} follows.`, lotText(lot));
      } else if (inTransit > 0) {
        const p = earliestPending();
        add('custody-gap', ev.rec.where('party'), `Row ${ev.n} (${ev.label}): ${who(ev.party)} ${verb} the lot ${lotText(lot)}, but row ${p.ev.n} (ship) sent it to ${who(p.ev.to)}, so the next event should be by ${who(p.ev.to)}.`, lotText(lot));
      } else if (holders.size > 0) {
        add('custody-gap', ev.rec.where('party'), `Row ${ev.n} (${ev.label}): ${who(ev.party)} ${verb} the lot ${lotText(lot)}, but the last party the file shows holding it is ${who(last)}.`, lotText(lot));
      }
      holders.set(x, ev.party);
    }
    last = ev.party;
    if (it.kind === 'ship' && ev.to !== null) {
      const key = nameKey(ev.to);
      const q = pending.get(key);
      const entry = { ev, i: it.i, taken: false };
      all.push(entry);
      if (q === undefined) pending.set(key, { items: [entry], head: 0 });
      else q.items.push(entry);
      inTransit += 1;
    }
  }
  for (const q of pending.values()) {
    for (let k = q.head; k < q.items.length; k += 1) {
      const ev = q.items[k].ev;
      add('ship-without-receive', ev.rec.where('to_party'), `Row ${ev.n} (ship) sends the lot ${lotText(lot)} to ${who(ev.to)}, but no receive row of the file takes it in there.`, lotText(lot));
    }
  }
}
