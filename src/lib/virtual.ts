// Variable-height list virtualization math. Cards differ in height (markdown,
// tags), so we can't use index * rowHeight: each item's height is measured
// once it renders and cached; unmeasured items use an estimate.

export function computeOffsets(heights: number[], gap: number): { offsets: number[]; total: number } {
  const offsets = new Array<number>(heights.length);
  let y = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = y;
    y += heights[i] + (i < heights.length - 1 ? gap : 0);
  }
  return { offsets, total: y };
}

// First index whose bottom edge is below `y` (binary search over offsets).
function findIndex(offsets: number[], heights: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] + heights[mid] < y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function computeRange(
  offsets: number[],
  heights: number[],
  scrollTop: number,
  viewportHeight: number,
  overscanPx: number
): { start: number; end: number } {
  if (offsets.length === 0) return { start: 0, end: -1 };
  const start = findIndex(offsets, heights, Math.max(0, scrollTop - overscanPx));
  const end = findIndex(offsets, heights, scrollTop + viewportHeight + overscanPx);
  return { start, end: Math.max(start, end) };
}
