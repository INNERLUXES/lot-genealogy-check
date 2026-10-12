# 4. Walk the lots without recursion, and bound what is shown

## Status

Accepted

## Context

The genealogy of a product can be a chain of a hundred thousand lots: each lot made from the one before it. A loop can be as
long. A lot can be shipped to thirty thousand parties. A check written as a function that calls itself for each input lot, or
a trace that collects every lot into a message, would run out of stack on the first file of that shape, or would write a
report that nobody can read, and a file in a pull request is enough to cause it.

Comparing every pair of rows to find the lots that belong together would be quadratic, and a file of a hundred thousand rows
of one lot would take the pipeline minutes.

## Decision

1. The graph of the lots is a `Map` from each lot to the lots it is made from (`buildGraph` in `src/across.js`). Nothing
   compares two rows with each other: lots, serial numbers, parties and shipments are found through maps built in one pass.
2. A loop in the genealogy is found with a depth-first walk that keeps its own stack of lots and its own position in the list
   of inputs of each (`findLoops` in `src/graph.js`). It does not call itself. A loop is reported by the edge that closes it,
   with the first eight lots of it and the number of lots in it, so a loop of a hundred thousand lots gives a short message.
3. A trace is a breadth-first walk with a queue (`reach` in `src/graph.js`). A lot is listed once, so a loop ends the walk. The
   walk stops at a depth limit, 1,000 steps by default and 1,000,000 at most, and says that it stopped. At most 2,500 lots
   are listed, and the number of lots reached is always given.
4. The events of one lot are sorted once by time, with the order of the file for equal times, and walked in a single pass.
5. At most 1,000 findings of one check are listed; the rest are counted and noted.
6. Hostile tests build a chain and a loop of a hundred thousand lots, a hundred thousand rows of one lot and a lot shipped to
   thirty thousand parties, and check the time, with limits that widen under coverage only.

## Consequences

- A very long chain of lots is checked and traced with the same small amount of stack as a short one.
- A report of a large file stays readable: the first findings are listed, the rest are counted.
- A lot reached by a trace through a loop is shown once, so the trace of a lot in a loop does not repeat.
