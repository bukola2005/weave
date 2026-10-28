import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { computeOffsets, computeRange } from '../lib/virtual';

interface Options {
  keys: string[];
  scrollRef: RefObject<HTMLElement>;
  estimate?: number;
  gap?: number;
  overscanPx?: number;
  enabled: boolean;
}

// Renders only the cards near the scroll viewport of one column. Heights are
// measured with a single shared ResizeObserver and cached by card id, so a
// card keeps its measured height when it scrolls away and back, and a
// height change (e.g. an edited description) re-flows only this column.
export function useVirtualList({ keys, scrollRef, estimate = 96, gap = 11, overscanPx = 400, enabled }: Options) {
  const heightCache = useRef(new Map<string, number>());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 600 });
  const pendingBump = useRef(0);

  const observerRef = useRef<ResizeObserver | null>(null);
  const observer = useMemo(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return null;
    return (observerRef.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        // Removed nodes report a 0x0 resize; stop observing them so scrolling
        // a long column doesn't accumulate detached elements.
        if (!el.isConnected) {
          observerRef.current?.unobserve(el);
          continue;
        }
        const key = el.dataset.vkey;
        if (!key) continue;
        const h = el.offsetHeight;
        if (h > 0 && heightCache.current.get(key) !== h) {
          heightCache.current.set(key, h);
          changed = true;
        }
      }
      // Coalesce many measurements into one re-layout per frame.
      if (changed && !pendingBump.current) {
        pendingBump.current = requestAnimationFrame(() => {
          pendingBump.current = 0;
          setMeasureVersion((v) => v + 1);
        });
      }
    }));
  }, [enabled]);

  useEffect(
    () => () => {
      observer?.disconnect();
      cancelAnimationFrame(pendingBump.current);
    },
    [observer]
  );

  // Track the scroll container's scroll position and size.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setViewport((prev) =>
        prev.scrollTop === el.scrollTop && prev.height === el.clientHeight
          ? prev
          : { scrollTop: el.scrollTop, height: el.clientHeight || prev.height }
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, scrollRef]);

  const heights = useMemo(
    () => keys.map((k) => heightCache.current.get(k) ?? estimate),
    // measureVersion: re-read the cache after new measurements land.
    [keys, estimate, measureVersion]
  );
  const { offsets, total } = useMemo(() => computeOffsets(heights, gap), [heights, gap]);
  const range = useMemo(
    () => (enabled ? computeRange(offsets, heights, viewport.scrollTop, viewport.height, overscanPx) : { start: 0, end: keys.length - 1 }),
    [enabled, offsets, heights, viewport, overscanPx, keys.length]
  );

  const measure = useCallback(
    (el: HTMLElement | null) => {
      if (el && observer) observer.observe(el);
    },
    [observer]
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el || index < 0 || index >= offsets.length) return;
      const top = offsets[index];
      const bottom = top + heights[index];
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    },
    [offsets, heights, scrollRef]
  );

  return { range, offsets, total, measure, scrollToIndex };
}
