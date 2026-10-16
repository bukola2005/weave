import { memo } from 'react';
import Markdown from 'markdown-to-jsx';
import type { Card, Column } from '../types';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';

interface Props {
  card: Card;
  orderedColumns: Column[];
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

function CardItem({ card, orderedColumns }: Props) {
  const moveCard = useDomainStore((s) => s.moveCard);
  const openModal = useUIStore((s) => s.openModal);

  const currentIndex = orderedColumns.findIndex((c) => c.id === card.columnId);
  const prevColumn = orderedColumns[currentIndex - 1];
  const nextColumn = orderedColumns[currentIndex + 1];

  return (
    <li className="task-card">
      <div className="task-top">
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
          onClick={() =>
            openModal({ type: 'confirmDelete', kind: 'card', id: card.id, label: card.title })
          }
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
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="task-foot">
        <span>{card.dueDate ? `Due ${dateLabel(card.dueDate)}` : 'No due date'}</span>
        <div className="move-group">
          <button
            type="button"
            className="move"
            disabled={!prevColumn}
            onClick={() => prevColumn && moveCard(card.id, card.columnId, prevColumn.id)}
            aria-label={
              prevColumn ? `Move ${card.title} to ${prevColumn.name}` : 'No column to the left'
            }
          >
            ←
          </button>
          <button
            type="button"
            className="move"
            disabled={!nextColumn}
            onClick={() => nextColumn && moveCard(card.id, card.columnId, nextColumn.id)}
            aria-label={
              nextColumn ? `Move ${card.title} to ${nextColumn.name}` : 'No column to the right'
            }
          >
            →
          </button>
        </div>
      </div>
    </li>
  );
}

export default memo(CardItem);
