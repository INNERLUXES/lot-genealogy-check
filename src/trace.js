// The trace of a lot: the lots it is made from (back) or the lots made from it (forward), with the products, the parties and
// the serial numbers on each. It follows the input_lots of the produce and assemble rows with a breadth-first walk (a queue,
// no recursion), keeps each lot once so a loop in the file ends the walk, and stops at a depth. A lot in the file that has
// no row of its own, only a mention in an input_lots, is reached and listed with nothing known about it.

import { buildGraph } from './across.js';
import { reach } from './graph.js';
import { nameKey, show } from './collect.js';

export const TRACE_LIMITS = { defaultDepth: 1000, maxDepth: 1000000, listedLots: 2500, listedItems: 20, listedTotals: 50 };

export class TraceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TraceError';
  }
}

// What the file says about each lot: its product, the parties that appear on its rows, its serial numbers and its rows.
export function lotInfo(model) {
  const info = new Map();
  const of = (lot) => {
    let entry = info.get(lot);
    if (entry === undefined) {
      entry = { product: null, parties: new Map(), serials: new Set(), events: 0 };
      info.set(lot, entry);
    }
    return entry;
  };
  for (const ev of model.events) {
    for (const e of ev.inputs) of(e.lot);
    if (ev.lot === null) continue;
    const entry = of(ev.lot);
    entry.events += 1;
    if (ev.product !== null) entry.product = ev.product;
    for (const p of [ev.party, ev.to]) if (p !== null && !entry.parties.has(nameKey(p))) entry.parties.set(nameKey(p), p);
    if (ev.serial !== null) entry.serials.add(ev.serial);
  }
  return info;
}

// The serial number given, if it is one of the file, with the lot it is on: for the message that says a name is not a lot.
function serialHint(model, name) {
  for (const ev of model.events) if (ev.serial === name && ev.lot !== null) return ` ${show(name, 80)} is a serial number on the lot ${show(ev.lot, 80)}; trace that lot.`;
  return '';
}

// The trace of one lot in one direction. direction is 'back' or 'forward'.
export function traceLot(model, lot, direction, maxDepth = TRACE_LIMITS.defaultDepth, prepared = null) {
  const info = prepared?.info ?? lotInfo(model);
  if (!info.has(lot)) throw new TraceError(`the lot ${show(lot, 80)} is not in the file.${serialHint(model, lot)}`);
  const graph = prepared?.graphs[direction] ?? buildGraph(model, { reverse: direction === 'forward' });
  const { order, depth, parent, truncated } = reach(graph, lot, maxDepth);
  const parties = new Map();
  const serials = new Set();
  let deepest = 0;
  const lots = [];
  for (const l of order) {
    const entry = info.get(l);
    const d = depth.get(l);
    if (d > deepest) deepest = d;
    for (const [k, p] of entry.parties) if (!parties.has(k)) parties.set(k, p);
    for (const s of entry.serials) serials.add(s);
    if (lots.length >= TRACE_LIMITS.listedLots) continue;
    const via = parent.get(l);
    lots.push({
      lot: show(l, 120),
      depth: d,
      product: entry.product === null ? null : show(entry.product, 80),
      parties: [...entry.parties.values()].slice(0, TRACE_LIMITS.listedItems).map((p) => show(p, 80)),
      partiesTotal: entry.parties.size,
      serials: [...entry.serials].slice(0, TRACE_LIMITS.listedItems).map((s) => show(s, 80)),
      serialsTotal: entry.serials.size,
      rows: entry.events,
      via: via === undefined ? null : { event: via.ev.id === null ? `row ${via.ev.n}` : show(via.ev.id, 60), row: via.ev.n, lot: show(via.from, 120) }
    });
  }
  return {
    direction,
    lot: show(lot, 120),
    maxDepth,
    depthReached: deepest,
    stoppedAtDepth: truncated,
    lotsReached: order.length - 1,
    listed: lots.length,
    partiesTotal: parties.size,
    parties: [...parties.values()].slice(0, TRACE_LIMITS.listedTotals).map((p) => show(p, 80)),
    serialsTotal: serials.size,
    serials: [...serials].slice(0, TRACE_LIMITS.listedTotals).map((s) => show(s, 80)),
    lots
  };
}

// The things both directions of a file share, built once.
export function prepareTrace(model) {
  return { info: lotInfo(model), graphs: { back: buildGraph(model), forward: buildGraph(model, { reverse: true }) } };
}
