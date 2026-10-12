// Walks over the lots as a graph, with loops and queues and no recursion, so that a chain of a hundred thousand lots uses
// the same small amount of stack as a chain of three. A graph is a Map from a lot to a list of { lot, ev } edges; an edge
// from a lot to another says that the first is made from the second (src/across.js builds it from the input_lots).

// How many lots of a loop are named in a message; the rest are counted.
export const LOOP_SHOWN = 8;

// The loops of a graph: a lot that is, directly or through other lots, made from itself. A depth-first walk with its own
// stack finds a loop when an edge leads to a lot that is still on the path. Each such edge gives one loop:
// { lots, length, edge } with the first LOOP_SHOWN lots of the loop in order, the number of lots in it and the edge that
// closes it.
export function findLoops(graph) {
  const state = new Map();
  const loops = [];
  for (const start of graph.keys()) {
    if (state.has(start)) continue;
    const path = [start];
    const next = [0];
    const position = new Map([[start, 0]]);
    state.set(start, 1);
    while (path.length > 0) {
      const node = path[path.length - 1];
      const edges = graph.get(node);
      const k = next[next.length - 1];
      if (edges !== undefined && k < edges.length) {
        next[next.length - 1] = k + 1;
        const edge = edges[k];
        const seen = state.get(edge.lot);
        if (seen === undefined) {
          state.set(edge.lot, 1);
          position.set(edge.lot, path.length);
          path.push(edge.lot);
          next.push(0);
        } else if (seen === 1) {
          const from = position.get(edge.lot);
          loops.push({ lots: path.slice(from, from + LOOP_SHOWN), length: path.length - from, edge });
        }
      } else {
        state.set(node, 2);
        position.delete(node);
        path.pop();
        next.pop();
      }
    }
  }
  return loops;
}

// The lots reached from a lot by following the edges of a graph, nearest first (a breadth-first walk with a queue), down to
// a depth. Returns { order, depth, parent, truncated }: order is the lots in the order they were reached (the lot itself
// first), depth maps each to its distance, parent maps each to the edge it was reached by, and truncated says that a lot at the depth limit has edges to lots that were not
// followed. A lot reached twice is kept once, so a loop ends the walk instead of repeating it.
export function reach(graph, start, maxDepth) {
  const depth = new Map([[start, 0]]);
  const parent = new Map();
  const order = [start];
  let truncated = false;
  for (let head = 0; head < order.length; head += 1) {
    const lot = order[head];
    const d = depth.get(lot);
    const edges = graph.get(lot);
    if (edges === undefined) continue;
    for (const edge of edges) {
      if (depth.has(edge.lot)) continue;
      if (d >= maxDepth) {
        truncated = true;
        continue;
      }
      depth.set(edge.lot, d + 1);
      parent.set(edge.lot, { from: lot, ev: edge.ev });
      order.push(edge.lot);
    }
  }
  return { order, depth, parent, truncated };
}
