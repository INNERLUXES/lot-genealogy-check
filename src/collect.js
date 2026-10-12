// What every check shares: the findings with their line and column, kept at most FINDING_CAP for each check and counted
// past that, the notes, and the small helpers that read a cell.

import { safeText } from './text.js';

// A cell that says nothing is read as empty: these words, in any case.
export const PLACEHOLDERS = ['n/a', 'na', 'none', 'null', 'nil', 'tbd', 'unknown', '-', '--', '?'];

// How many findings of one check are kept; the rest are counted in omitted.
export const FINDING_CAP = 1000;

export const isPlaceholder = (t) => PLACEHOLDERS.includes(t.toLowerCase());

// Text from the input as a message shows it.
export const show = (t, max = 60) => safeText(t, max);

// A unit or a name compared without regard to case and runs of white space.
export const unitKey = (u) => u.toLowerCase().replace(/\s+/g, ' ');
export const nameKey = (t) => t.toLowerCase().replace(/\s+/g, ' ');

export const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// The place to collect findings: add(id, where, message, subject) keeps the first FINDING_CAP of each check.
export function createCollector() {
  const findings = [];
  const counts = new Map();
  const omitted = new Map();
  const notes = [];
  const add = (id, where, message, subject = null) => {
    const seen = (counts.get(id) ?? 0) + 1;
    counts.set(id, seen);
    if (seen > FINDING_CAP) omitted.set(id, (omitted.get(id) ?? 0) + 1);
    else findings.push({ id, line: where.line, column: where.column, message, subject });
  };
  return { findings, omitted, notes, add };
}
