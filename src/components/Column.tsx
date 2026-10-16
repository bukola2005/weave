import { memo, useMemo } from 'react';
import type { Column as ColumnType, Card } from '../types';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import CardItem from './CardItem';

interface Props {
  column: ColumnType;
  cardsRecord: Record<string, Card>;
  orderedColumns: ColumnType[];
  dotColor: string;
  searchQuery: string;
}

function Column({ column, cardsRecord, orderedColumns, dotColor, searchQuery }: Props) {
  const openModal = useUIStore((s) => s.openModal);

  const cards = useMemo(
    () => column.cardIds.map((id) => cardsRecord[id]).filter(Boolean),
    [column.cardIds, cardsRecord]
  );

  const visibleCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((card) =>
      [card.title, ...card.tags].join(' ').toLowerCase().includes(query)
    );
  }, [cards, searchQuery]);

  return (
    <section aria-label={`${column.name} column`} className="column">
      <div className="column-head">
        <div className="column-name">
          <span className="dot" style={{ background: dotColor }} aria-hidden="true" />
          <h3>{column.name}</h3>
          <span className="count">{visibleCards.length}</span>
        </div>
        <div className="column-head-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Rename ${column.name}`}
            onClick={() =>
              openModal({ type: 'renameColumn', columnId: column.id, currentName: column.name })
            }
          >
            ✎
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Delete ${column.name} column`}
            onClick={() =>
              openModal({ type: 'confirmDelete', kind: 'column', id: column.id, label: column.name })
            }
          >
            ✕
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Add card to ${column.name}`}
            onClick={() => openModal({ type: 'card', columnId: column.id })}
          >
            +
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="column-empty">
          <p>Nothing in this column yet. Add a card to get it moving.</p>
          <button
            type="button"
            className="secondary"
            onClick={() => openModal({ type: 'card', columnId: column.id })}
          >
            Add a card
          </button>
        </div>
      ) : (
        <ul className="card-list" aria-label={`Cards in ${column.name}`}>
          {visibleCards.map((card) => (
            <CardItem key={card.id} card={card} orderedColumns={orderedColumns} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(Column);
