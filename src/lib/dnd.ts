import type { Card } from '../types';
import { positionBetween } from './ordering';

// Pure drag-and-drop math. The pointer-tracking side lives in
// dnd/dragController.ts; everything here is DOM-free so it can be unit tested.

export interface ItemRect {
  index: number; // index in the visible list (dragged card included)
  top: number;
  height: number;
}

// Where would a card land if dropped at `pointerY`? Returns an insertion index
// into the visible list: dropping above the midpoint of item i inserts before
// it. Only some items may be rendered (virtualization), so when the pointer is
// past every measured item we insert after the last one we know about.
export function getDropIndex(pointerY: number, items: ItemRect[], totalCount: number): number {
  if (items.length === 0) return totalCount;
  const sorted = [...items].sort((a, b) => a.index - b.index);
  for (const item of sorted) {
    if (pointerY < item.top + item.height / 2) return item.index;
  }
  const last = sorted[sorted.length - 1];
  return Math.min(last.index + 1, totalCount);
}

// The drop index is measured in a list that still contains the dragged card.
// Once we take it out, every slot after its old spot shifts up by one.
export function normalizeDropIndex(
  visibleIds: string[],
  draggedId: string,
  dropIndex: number
): number {
  const from = visibleIds.indexOf(draggedId);
  if (from !== -1 && from < dropIndex) return dropIndex - 1;
  return dropIndex;
}

// Turn "insert at index i of this column" into a fractional position.
// `targetIds` is the target column's visible order *without* the dragged
// card. Neighbours may be search-filtered; positionBetween still lands the
// card between the two the user actually saw.
export function positionForIndex(
  targetIds: string[],
  index: number,
  cards: Record<string, Card>
): number {
  const clamped = Math.max(0, Math.min(index, targetIds.length));
  const before = clamped > 0 ? cards[targetIds[clamped - 1]]?.position : undefined;
  const after = clamped < targetIds.length ? cards[targetIds[clamped]]?.position : undefined;
  return positionBetween(before, after);
}

export interface MovePlan {
  cardId: string;
  toColumnId: string;
  position: number;
}

// Full resolution of a drop: returns null when the drop wouldn't change
// anything (dropped back on its own slot), so we don't log a no-op to the
// undo history or broadcast it.
export function planDrop(args: {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  dropIndex: number; // index in target's visible list, dragged card included
  targetVisibleIds: string[];
  cards: Record<string, Card>;
}): MovePlan | null {
  const { cardId, fromColumnId, toColumnId, targetVisibleIds, cards } = args;
  const index = normalizeDropIndex(targetVisibleIds, cardId, args.dropIndex);
  const without = targetVisibleIds.filter((id) => id !== cardId);
  if (fromColumnId === toColumnId && targetVisibleIds.indexOf(cardId) === index) return null;
  return { cardId, toColumnId, position: positionForIndex(without, index, cards) };
}

// Keyboard reordering: ArrowUp/Down within a column, ArrowLeft/Right into the
// neighbouring column at the same height.
export function planKeyboardMove(args: {
  cardId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  columnIds: string[]; // board's columns, in order
  visibleIdsByColumn: (columnId: string) => string[];
  cards: Record<string, Card>;
}): MovePlan | null {
  const { cardId, direction, columnIds, visibleIdsByColumn, cards } = args;
  const card = cards[cardId];
  if (!card) return null;
  const ownIds = visibleIdsByColumn(card.columnId);
  const from = ownIds.indexOf(cardId);

  if (direction === 'up' || direction === 'down') {
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ownIds.length) return null;
    const without = ownIds.filter((id) => id !== cardId);
    return { cardId, toColumnId: card.columnId, position: positionForIndex(without, to, cards) };
  }

  const columnIndex = columnIds.indexOf(card.columnId);
  const targetColumnId = columnIds[direction === 'left' ? columnIndex - 1 : columnIndex + 1];
  if (!targetColumnId) return null;
  const targetIds = visibleIdsByColumn(targetColumnId).filter((id) => id !== cardId);
  return {
    cardId,
    toColumnId: targetColumnId,
    position: positionForIndex(targetIds, Math.max(from, 0), cards),
  };
}

// Edge auto-scroll while dragging: scroll speed ramps up linearly the closer
// the pointer is to the edge of the scroll container (negative = scroll back).
export function autoScrollDelta(
  pointer: number,
  start: number,
  end: number,
  edge = 48,
  maxSpeed = 18
): number {
  if (pointer < start + edge) return -Math.ceil(maxSpeed * Math.min(1, (start + edge - pointer) / edge));
  if (pointer > end - edge) return Math.ceil(maxSpeed * Math.min(1, (pointer - (end - edge)) / edge));
  return 0;
}

// Search filter shared by the column UI and the drag controller, so both
// agree on what "index 3 in this column" means.
export function filterCardIds(
  cardIds: string[],
  cards: Record<string, Card>,
  query: string
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return cardIds;
  return cardIds.filter((id) => {
    const card = cards[id];
    return card ? [card.title, ...card.tags].join(' ').toLowerCase().includes(q) : false;
  });
}
