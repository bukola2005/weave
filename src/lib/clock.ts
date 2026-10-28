import type { Stamp } from '../types';

// Identifies this browser tab for the lifetime of the page. Used as the LWW
// tie-breaker and to ignore our own broadcast echoes.
export const TAB_ID: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

// Hybrid logical clock. Wall-clock time is what humans expect "last write"
// to mean, but two tabs' clocks can disagree and Date.now() can repeat within
// a millisecond. So: never issue a timestamp <= one we've already issued or
// observed from a peer. That guarantees an edit made *after seeing* a remote
// edit always carries a larger timestamp than it, i.e. causality is respected.
let last = 0;

export function now(): number {
  last = Math.max(Date.now(), last + 1);
  return last;
}

export function observe(ts: number): void {
  if (ts > last) last = ts;
}

export function stamp(tab: string = TAB_ID): Stamp {
  return { ts: now(), tab };
}

// Strict total order over stamps: true when `a` should win over `b`.
export function isNewer(a: Stamp, b: Stamp): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts;
  return a.tab > b.tab;
}

// Test helper: rewind the clock so tests don't depend on each other.
export function resetClockForTests(): void {
  last = 0;
}
