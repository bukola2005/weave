import type { PointerEvent as ReactPointerEvent } from 'react';
import { domainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import { autoScrollDelta, filterCardIds, getDropIndex, planDrop, type ItemRect } from '../lib/dnd';

// Hand-rolled pointer drag (no DnD library, no HTML5 drag events — those
// don't fire for touch and can't be styled). Works with mouse, pen and touch.
//
// Performance shape: pointermove does NO React work. The ghost is a cloned
// DOM node moved with a transform inside requestAnimationFrame; the store is
// only written when the hovered drop slot changes, so a 60fps drag across a
// 240-card board causes a handful of renders, not hundreds.

const DRAG_THRESHOLD = 5;

interface Session {
  pointerId: number;
  cardId: string;
  fromColumnId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  started: boolean;
  ghost: HTMLElement | null;
  frame: number;
  scrollFrame: number;
}

let session: Session | null = null;

export function isDragging(): boolean {
  return Boolean(session?.started);
}

export function onCardPointerDown(event: ReactPointerEvent<HTMLElement>, cardId: string, columnId: string) {
  if (event.button !== 0 || session) return;
  const target = event.target as HTMLElement;
  // On touch, only the grip starts a drag so the column can still be scrolled
  // with a finger. With a mouse the whole card is a drag surface.
  if (event.pointerType !== 'mouse' && !target.closest('[data-drag-handle]')) return;
  if (target.closest('input, textarea, a')) return;

  const cardEl = event.currentTarget;
  const rect = cardEl.getBoundingClientRect();
  session = {
    pointerId: event.pointerId,
    cardId,
    fromColumnId: columnId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    started: false,
    ghost: null,
    frame: 0,
    scrollFrame: 0,
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', handleKey);
}

function start(s: Session) {
  s.started = true;
  const source = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(s.cardId)}"]`);
  if (source) {
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-card-id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);
    s.ghost = ghost;
  }
  document.body.classList.add('is-dragging-card');
  useUIStore.getState().setDrag({ cardId: s.cardId, fromColumnId: s.fromColumnId });
  autoScrollLoop();
}

function handleMove(event: PointerEvent) {
  const s = session;
  if (!s || event.pointerId !== s.pointerId) return;
  s.x = event.clientX;
  s.y = event.clientY;
  if (!s.started) {
    if (Math.hypot(s.x - s.startX, s.y - s.startY) < DRAG_THRESHOLD) return;
    start(s);
  }
  event.preventDefault();
  if (!s.frame) {
    s.frame = requestAnimationFrame(() => {
      s.frame = 0;
      if (s.ghost) {
        s.ghost.style.transform = `translate3d(${s.x - s.offsetX}px, ${s.y - s.offsetY}px, 0) rotate(1.5deg)`;
      }
      updateDropTarget(s);
    });
  }
}

function updateDropTarget(s: Session) {
  const ui = useUIStore.getState();
  const hit = document.elementFromPoint(s.x, s.y);
  const columnEl = hit?.closest<HTMLElement>('[data-column-id]');
  const columnId = columnEl?.dataset.columnId;
  if (!columnEl || !columnId) {
    ui.setDropTarget(null);
    return;
  }
  const { columns, cards } = domainStore.getState();
  const visible = filterCardIds(columns[columnId]?.cardIds ?? [], cards, ui.searchQuery);
  // Only rendered (possibly virtualized) items are measured; each carries its
  // index in the full visible list via data-index.
  const items: ItemRect[] = [];
  columnEl.querySelectorAll<HTMLElement>('[data-card-id][data-index]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    items.push({ index: Number(el.dataset.index), top: rect.top, height: rect.height });
  });
  ui.setDropTarget({ columnId, index: getDropIndex(s.y, items, visible.length) });
}

// Edge auto-scroll: the hovered column's card list vertically, and the board
// horizontally, so you can drag to column 20 or card 200 without letting go.
function autoScrollLoop() {
  const s = session;
  if (!s?.started) return;
  let scrolled = false;
  const board = document.querySelector<HTMLElement>('[data-kanban-scroller]');
  if (board) {
    const rect = board.getBoundingClientRect();
    const dx = autoScrollDelta(s.x, rect.left, rect.right, 64);
    if (dx) {
      board.scrollLeft += dx;
      scrolled = true;
    }
  }
  const list = document
    .elementFromPoint(s.x, s.y)
    ?.closest('[data-column-id]')
    ?.querySelector<HTMLElement>('[data-card-scroller]');
  if (list) {
    const rect = list.getBoundingClientRect();
    if (s.x >= rect.left && s.x <= rect.right) {
      const dy = autoScrollDelta(s.y, rect.top, rect.bottom);
      if (dy) {
        list.scrollTop += dy;
        scrolled = true;
      }
    }
  }
  if (scrolled) updateDropTarget(s);
  s.scrollFrame = requestAnimationFrame(autoScrollLoop);
}

function handleUp(event: PointerEvent) {
  const s = session;
  if (!s || event.pointerId !== s.pointerId) return;
  if (s.started) {
    updateDropTarget(s);
    commit(s);
    // The pointerup is followed by a click on whatever is under the pointer
    // (often the card's title button). Swallow that one click.
    window.addEventListener('click', swallowClick, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0);
  }
  cleanup();
}

function commit(s: Session) {
  const ui = useUIStore.getState();
  const target = ui.dropTarget;
  if (!target) return;
  const domain = domainStore.getState();
  const visible = filterCardIds(domain.columns[target.columnId]?.cardIds ?? [], domain.cards, ui.searchQuery);
  const plan = planDrop({
    cardId: s.cardId,
    fromColumnId: s.fromColumnId,
    toColumnId: target.columnId,
    dropIndex: target.index,
    targetVisibleIds: visible,
    cards: domain.cards,
  });
  if (!plan) return;
  domain.moveCard(plan.cardId, plan.toColumnId, plan.position);
  const card = domain.cards[s.cardId];
  const columnName = domainStore.getState().columns[plan.toColumnId]?.name ?? '';
  ui.announce(`Moved ${card?.title ?? 'card'} to ${columnName}.`);
}

function swallowClick(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && session?.started) {
    event.preventDefault();
    useUIStore.getState().announce('Move cancelled.');
    cancel();
  }
}

function cancel() {
  cleanup();
}

function cleanup() {
  const s = session;
  if (!s) return;
  cancelAnimationFrame(s.frame);
  cancelAnimationFrame(s.scrollFrame);
  s.ghost?.remove();
  document.body.classList.remove('is-dragging-card');
  window.removeEventListener('pointermove', handleMove);
  window.removeEventListener('pointerup', handleUp);
  window.removeEventListener('pointercancel', cancel);
  window.removeEventListener('keydown', handleKey);
  const ui = useUIStore.getState();
  if (s.started) {
    ui.setDrag(null);
    ui.setDropTarget(null);
  }
  session = null;
}
