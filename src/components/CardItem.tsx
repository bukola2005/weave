import { memo, useEffect, useRef, type KeyboardEvent } from 'react';
import Markdown from 'markdown-to-jsx';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import { countVisibleComments } from '../lib/comments';
import { filterCardIds, planKeyboardMove } from '../lib/dnd';
import { onCardPointerDown } from '../dnd/dragController';
import Badge from './ui/Badge';

interface Props {
  cardId: string;
  columnId: string;
  index: number; // position in the column's visible list (used for hit-testing)
  setSize: number;
  prevColumnId?: string;
  nextColumnId?: string;
  top?: number; // set when the list is virtualized (absolute positioning)
  measure?: (el: HTMLElement | null) => void;
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

const KEY_TO_DIRECTION = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
} as const;

function dueTone(dueDate: string): 'danger' | 'warning' | 'neutral' {
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate < today) return 'danger';
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return dueDate <= soon ? 'warning' : 'neutral';
}

// Every prop is a primitive, and the card reads its own data from the store
// by id. So editing one card re-renders exactly one CardItem, and moving a
// card re-renders only the two columns involved — not all 240 cards.
function CardItem({ cardId, columnId, index, setSize, prevColumnId, nextColumnId, top, measure }: Props) {
  const card = useDomainStore((s) => s.cards[cardId]);
  const commentCount = useDomainStore((s) => countVisibleComments(s.commentsByCard[cardId], s.comments));
  const prevName = useDomainStore((s) => (prevColumnId ? s.columns[prevColumnId]?.name : undefined));
  const nextName = useDomainStore((s) => (nextColumnId ? s.columns[nextColumnId]?.name : undefined));
  const moveCard = useDomainStore((s) => s.moveCard);
  const openModal = useUIStore((s) => s.openModal);
  const isDragging = useUIStore((s) => s.drag?.cardId === cardId);
  const shouldFocus = useUIStore((s) => s.focusCardId === cardId);
  const handleRef = useRef<HTMLButtonElement>(null);

  // Return focus after a keyboard move remounted this card somewhere new.
  useEffect(() => {
    if (!shouldFocus) return;
    handleRef.current?.focus();
    useUIStore.getState().requestCardFocus(null);
  }, [shouldFocus]);

  if (!card) return null;

  const keyboardMove = (direction: 'up' | 'down' | 'left' | 'right') => {
    const domain = useDomainStore.getState();
    const ui = useUIStore.getState();
    const board = domain.boards[domain.columns[columnId]?.boardId ?? ''];
    const visible = (id: string) => filterCardIds(domain.columns[id]?.cardIds ?? [], domain.cards, ui.searchQuery);
    const plan = planKeyboardMove({
      cardId,
      direction,
      columnIds: board?.columnIds ?? [],
      visibleIdsByColumn: visible,
      cards: domain.cards,
    });
    if (!plan) {
      ui.announce(direction === 'up' || direction === 'down' ? 'Already at the edge of this column.' : 'No column in that direction.');
      return;
    }
    moveCard(plan.cardId, plan.toColumnId, plan.position);
    ui.requestCardFocus(cardId);
    const after = useDomainStore.getState();
    const ids = visible(plan.toColumnId);
    ui.announce(
      `${card.title}: position ${ids.indexOf(cardId) + 1} of ${ids.length} in ${after.columns[plan.toColumnId]?.name}.`
    );
  };

  const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const direction = KEY_TO_DIRECTION[e.key as keyof typeof KEY_TO_DIRECTION];
    if (!direction) return;
    e.preventDefault();
    keyboardMove(direction);
  };

  return (
    <li
      ref={measure}
      data-vkey={cardId}
      data-card-id={cardId}
      data-index={index}
      aria-posinset={index + 1}
      aria-setsize={setSize}
      className={`task-card${isDragging ? ' is-dragging' : ''}${top !== undefined ? ' is-virtual' : ''}`}
      style={top !== undefined ? { transform: `translateY(${top}px)` } : undefined}
      onPointerDown={(e) => onCardPointerDown(e, cardId, columnId)}
    >
      <div className="task-top">
        <button
          ref={handleRef}
          type="button"
          className="drag-handle"
          data-drag-handle
          aria-label={`Move ${card.title}`}
          aria-describedby="drag-instructions"
          onKeyDown={onHandleKeyDown}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <button
          type="button"
          className="task-title-btn"
          onClick={() => openModal({ type: 'card', columnId: card.columnId, cardId: card.id })}
        >
          {card.title}
        </button>
        <button
          type="button"
          className="task-delete"
          aria-label={`Delete card ${card.title}`}
          onClick={() => openModal({ type: 'confirmDelete', kind: 'card', id: card.id, label: card.title })}
        >
          ✕
        </button>
      </div>

      {card.description && (
        <div className="task-description">
          <Markdown>{card.description}</Markdown>
        </div>
      )}

      {card.tags.length > 0 && (
        <div className="tag-row">
          {card.tags.map((tag) => (
            <Badge key={tag} tone="info">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="task-foot">
        <div className="task-meta">
          {card.dueDate ? (
            <Badge tone={dueTone(card.dueDate)}>Due {dateLabel(card.dueDate)}</Badge>
          ) : (
            <span>No due date</span>
          )}
          {commentCount > 0 && (
            <Badge tone="neutral" label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}>
              💬 {commentCount}
            </Badge>
          )}
        </div>
        <div className="move-group">
          <button
            type="button"
            className="move"
            disabled={!prevColumnId}
            onClick={() => keyboardMove('left')}
            aria-label={prevName ? `Move ${card.title} to ${prevName}` : 'No column to the left'}
          >
            ←
          </button>
          <button
            type="button"
            className="move"
            disabled={!nextColumnId}
            onClick={() => keyboardMove('right')}
            aria-label={nextName ? `Move ${card.title} to ${nextName}` : 'No column to the right'}
          >
            →
          </button>
        </div>
      </div>
    </li>
  );
}

export default memo(CardItem);
