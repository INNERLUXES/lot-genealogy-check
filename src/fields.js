// The columns the tool reads, the five kinds of event and what each kind needs. The names and the order of the columns are
// this tool's own choice: no regulation fixes them. A column is found by its name with case and separators ignored.

export const normalizeName = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export const COLUMNS = [
  ['event_id', 'the identifier of the event; unique in the file'],
  ['event_type', 'the kind of event: receive, produce, ship, assemble or scrap'],
  ['event_time', 'when the event happened: YYYY-MM-DD, or YYYY-MM-DDThh:mm:ss with a time zone'],
  ['party', 'the party that records the event and holds the lot when it happens (the shipper for a ship)'],
  ['site', 'the place of the event, such as a plant or a warehouse; not compared'],
  ['from_party', 'receive: the party the lot came from, when the file names it; ship: the shipper, when given'],
  ['to_party', 'ship: the party the lot is sent to'],
  ['lot', 'the lot or batch the row is about; for produce and assemble the lot that is made'],
  ['serial', 'the serial number of one unit of the lot, when units are serialised'],
  ['product', 'the product of the lot'],
  ['quantity', 'how much of the lot the row moves, makes or scraps'],
  ['unit', 'the unit of the quantity'],
  ['input_lots', 'produce and assemble: the lots used, written lot:quantity:unit and separated by semicolons'],
  ['document_ref', 'the number of the delivery note, work order or other document of the row; not compared']
].map(([name, summary]) => ({ name, summary }));

export const COLUMN_NAMES = COLUMNS.map((c) => c.name);

// The five kinds of event. label is how a report names the kind; needs are the cells that must hold something besides the
// ones every row needs; inputs says whether the row lists input lots (required for assemble, allowed for produce).
export const EVENT_TYPES = [
  { id: 'receive', label: 'receive', needs: ['product'], summary: 'a party takes in a lot from outside, usually from another party that shipped it' },
  { id: 'produce', label: 'produce', needs: ['product'], inputs: 'optional', summary: 'a party makes a lot; with input_lots it is made from other lots, without them the lot starts in this file' },
  { id: 'ship', label: 'ship', needs: ['to_party'], summary: 'a party sends a lot to another party' },
  { id: 'assemble', label: 'assemble', needs: ['product', 'input_lots'], inputs: 'required', summary: 'a party makes a lot from components and must name them in input_lots' },
  { id: 'scrap', label: 'scrap', needs: [], summary: 'a party writes a quantity of a lot off' }
];

// What every row needs, besides the unit (which has a check of its own).
export const ALWAYS = ['event_id', 'event_time', 'party', 'lot', 'quantity'];

export const typeOf = (id) => EVENT_TYPES.find((t) => t.id === id);

// The number of edits (insert, delete, replace) between two short texts, capped.
export function editDistance(a, b) {
  const x = a.slice(0, 60);
  const y = b.slice(0, 60);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

// The name nearest to a text, within two edits, or null.
export function nearest(text, names) {
  let best = null;
  let bestDistance = 3;
  for (const n of names) {
    const d = editDistance(text, n);
    if (d < bestDistance) {
      best = n;
      bestDistance = d;
    }
  }
  return best;
}
