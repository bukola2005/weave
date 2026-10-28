import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import {
  autoScrollDelta,
  filterCardIds,
  getDropIndex,
  normalizeDropIndex,
  planDrop,
  planKeyboardMove,
  positionForIndex,
} from './dnd';
import { positionBetween } from './ordering';

const stampZero = { ts: 0, tab: 't' };
function card(id: string, columnId: string, position: number, extra: Partial<Card> = {}): Card {
  return {
    id,
    columnId,
    title: id,
    description: '',
    tags: [],
    dueDate: null,
    position,
    edited: stampZero,
    placed: stampZero,
    ...extra,
  };
}

// Column A: a(1000) b(2000) c(3000) d(4000); column B: x(1000) y(2000)
const cards: Record<string, Card> = Object.fromEntries(
  [
    card('a', 'A', 1000),
    card('b', 'A', 2000),
    card('c', 'A', 3000),
    card('d', 'A', 4000),
    card('x', 'B', 1000, { tags: ['Design'] }),
    card('y', 'B', 2000),
  ].map((c) => [c.id, c])
);
const A = ['a', 'b', 'c', 'd'];
const B = ['x', 'y'];

describe('positionBetween', () => {
  it('handles empty, head, tail and middle insertions', () => {
    expect(positionBetween(undefined, undefined)).toBe(1024);
    expect(positionBetween(undefined, 1000)).toBe(1000 - 1024);
    expect(positionBetween(1000, undefined)).toBe(1000 + 1024);
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});

describe('getDropIndex', () => {
  const rects = [
    { index: 0, top: 0, height: 100 },
    { index: 1, top: 110, height: 100 },
    { index: 2, top: 220, height: 100 },
  ];

  it('inserts before an item when the pointer is above its midpoint', () => {
    expect(getDropIndex(10, rects, 3)).toBe(0);
    expect(getDropIndex(149, rects, 3)).toBe(1);
    expect(getDropIndex(161, rects, 3)).toBe(2);
  });

  it('inserts at the end below the last item', () => {
    expect(getDropIndex(900, rects, 3)).toBe(3);
  });

  it('works with a virtualized window (only some indices rendered)', () => {
    const windowed = [
      { index: 40, top: 0, height: 100 },
      { index: 41, top: 110, height: 100 },
    ];
    expect(getDropIndex(120, windowed, 200)).toBe(41);
    expect(getDropIndex(500, windowed, 200)).toBe(42);
  });

  it('returns the end of an empty column', () => {
    expect(getDropIndex(50, [], 0)).toBe(0);
  });
});

describe('normalizeDropIndex', () => {
  it('shifts indices after the dragged card’s old slot', () => {
    expect(normalizeDropIndex(A, 'a', 3)).toBe(2);
    expect(normalizeDropIndex(A, 'c', 1)).toBe(1);
    expect(normalizeDropIndex(B, 'a', 1)).toBe(1); // cross-column: no shift
  });
});

describe('planDrop', () => {
  const base = { cards, fromColumnId: 'A', toColumnId: 'A', targetVisibleIds: A };

  it('returns null when dropped back into its own slot', () => {
    expect(planDrop({ ...base, cardId: 'b', dropIndex: 1 })).toBeNull();
    expect(planDrop({ ...base, cardId: 'b', dropIndex: 2 })).toBeNull();
  });

  it('reorders within a column by picking a position between the new neighbours', () => {
    // Move a below c: between c(3000) and d(4000)
    expect(planDrop({ ...base, cardId: 'a', dropIndex: 3 })).toEqual({
      cardId: 'a',
      toColumnId: 'A',
      position: 3500,
    });
    // Move d to the top: before a(1000)
    expect(planDrop({ ...base, cardId: 'd', dropIndex: 0 })?.position).toBe(1000 - 1024);
  });

  it('moves across columns', () => {
    expect(
      planDrop({ cards, cardId: 'b', fromColumnId: 'A', toColumnId: 'B', dropIndex: 1, targetVisibleIds: B })
    ).toEqual({ cardId: 'b', toColumnId: 'B', position: 1500 });
    expect(
      planDrop({ cards, cardId: 'b', fromColumnId: 'A', toColumnId: 'B', dropIndex: 2, targetVisibleIds: B })
        ?.position
    ).toBe(2000 + 1024);
  });

  it('drops into an empty column', () => {
    expect(
      planDrop({ cards, cardId: 'b', fromColumnId: 'A', toColumnId: 'C', dropIndex: 0, targetVisibleIds: [] })
    ).toEqual({ cardId: 'b', toColumnId: 'C', position: 1024 });
  });

  it('respects search-filtered neighbours', () => {
    // Only a and d visible; drop b between them -> between 1000 and 4000.
    expect(
      planDrop({ cards, cardId: 'x', fromColumnId: 'B', toColumnId: 'A', dropIndex: 1, targetVisibleIds: ['a', 'd'] })
        ?.position
    ).toBe(2500);
  });
});

describe('positionForIndex', () => {
  it('clamps out-of-range indices', () => {
    expect(positionForIndex(B, 99, cards)).toBe(2000 + 1024);
    expect(positionForIndex(B, -5, cards)).toBe(1000 - 1024);
  });
});

describe('planKeyboardMove', () => {
  const args = {
    columnIds: ['A', 'B', 'C'],
    visibleIdsByColumn: (id: string) => (id === 'A' ? A : id === 'B' ? B : []),
    cards,
  };

  it('moves up and down within a column', () => {
    expect(planKeyboardMove({ ...args, cardId: 'c', direction: 'up' })?.position).toBe(1500);
    expect(planKeyboardMove({ ...args, cardId: 'b', direction: 'down' })?.position).toBe(3500);
  });

  it('refuses to move past the column edges', () => {
    expect(planKeyboardMove({ ...args, cardId: 'a', direction: 'up' })).toBeNull();
    expect(planKeyboardMove({ ...args, cardId: 'd', direction: 'down' })).toBeNull();
    expect(planKeyboardMove({ ...args, cardId: 'a', direction: 'left' })).toBeNull();
  });

  it('moves sideways at the same height, clamped to the target length', () => {
    expect(planKeyboardMove({ ...args, cardId: 'b', direction: 'right' })).toEqual({
      cardId: 'b',
      toColumnId: 'B',
      position: 1500,
    });
    expect(planKeyboardMove({ ...args, cardId: 'd', direction: 'right' })?.position).toBe(2000 + 1024);
    expect(planKeyboardMove({ ...args, cardId: 'y', direction: 'right' })).toEqual({
      cardId: 'y',
      toColumnId: 'C',
      position: 1024,
    });
  });
});

describe('autoScrollDelta', () => {
  it('scrolls faster the closer the pointer is to an edge', () => {
    expect(autoScrollDelta(500, 0, 1000)).toBe(0);
    expect(autoScrollDelta(40, 0, 1000)).toBeLessThan(0);
    expect(autoScrollDelta(0, 0, 1000)).toBe(-18);
    expect(autoScrollDelta(990, 0, 1000)).toBeGreaterThan(autoScrollDelta(960, 0, 1000));
  });
});

describe('filterCardIds', () => {
  it('matches title and tags case-insensitively, and returns the same array when empty', () => {
    expect(filterCardIds(B, cards, 'design')).toEqual(['x']);
    expect(filterCardIds(B, cards, '  ')).toBe(B);
  });
});
