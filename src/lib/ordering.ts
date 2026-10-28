// Fractional ordering. Each card/column stores a numeric `position`, and lists
// are sorted by it. Inserting between two items is a single write (the moved
// item's own position) instead of renumbering every sibling — which is what
// makes concurrent moves from two tabs converge: there's no shared array
// whose index-based edits could interleave differently on each side.

export const POSITION_STEP = 1024;

export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return POSITION_STEP;
  if (before === undefined) return (after as number) - POSITION_STEP;
  if (after === undefined) return before + POSITION_STEP;
  return before + (after - before) / 2;
}

interface Positioned {
  id: string;
  position: number;
}

// Sort key comparator. Ties (possible after very many bisections, or two tabs
// picking the same midpoint concurrently) fall back to id so every tab still
// lands on the same order.
export function comparePositioned(a: Positioned, b: Positioned): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Insert `id` into an already-sorted id list, keeping it sorted. O(n) but
// avoids re-sorting the whole column on every move.
export function insertSorted(
  ids: string[],
  id: string,
  lookup: (id: string) => Positioned | undefined
): string[] {
  const item = lookup(id);
  if (!item) return ids;
  const next = ids.filter((existing) => existing !== id);
  let i = 0;
  while (i < next.length) {
    const other = lookup(next[i]);
    if (other && comparePositioned(item, other) < 0) break;
    i++;
  }
  next.splice(i, 0, id);
  return next;
}
