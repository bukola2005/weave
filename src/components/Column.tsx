import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import { filterCardIds } from '../lib/dnd';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import CardList from './CardList';

interface Props {
  columnId: string;
  prevColumnId?: string;
  nextColumnId?: string;
  dotColor: string;
}

// Reads its own column by id and selects only the *ids* of matching cards
// (compared shallowly). Editing a card's description doesn't change that
// list, so the column doesn't re-render — only the CardItem does.
function Column({ columnId, prevColumnId, nextColumnId, dotColor }: Props) {
  const column = useDomainStore((s) => s.columns[columnId]);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const visibleIds = useDomainStore(
    useShallow((s) => filterCardIds(s.columns[columnId]?.cardIds ?? [], s.cards, searchQuery))
  );
  const isDropTarget = useUIStore((s) => s.dropTarget?.columnId === columnId);
  const openModal = useUIStore((s) => s.openModal);

  if (!column) return null;
  const total = column.cardIds.length;
  const filtered = searchQuery.trim() !== '';

  return (
    <section
      aria-label={`${column.name} column`}
      className={`column${isDropTarget ? ' is-drop-target' : ''}`}
      data-column-id={column.id}
    >
      <div className="column-head">
        <div className="column-name">
          <span className="dot" style={{ background: dotColor }} aria-hidden="true" />
          <h3>{column.name}</h3>
          <span className="count" aria-label={filtered ? `${visibleIds.length} of ${total} cards` : `${total} cards`}>
            {filtered ? `${visibleIds.length}/${total}` : total}
          </span>
        </div>
        <div className="column-head-actions">
          <Button
            variant="icon"
            aria-label={`Rename ${column.name}`}
            onClick={() => openModal({ type: 'renameColumn', columnId: column.id, currentName: column.name })}
          >
            ✎
          </Button>
          <Button
            variant="icon"
            aria-label={`Delete ${column.name} column`}
            onClick={() => openModal({ type: 'confirmDelete', kind: 'column', id: column.id, label: column.name })}
          >
            ✕
          </Button>
          <Button
            variant="icon"
            className="column-add"
            aria-label={`Add card to ${column.name}`}
            onClick={() => openModal({ type: 'card', columnId: column.id })}
          >
            +
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState
          compact
          headingLevel="h3"
          title="Nothing here yet"
          action={
            <Button onClick={() => openModal({ type: 'card', columnId: column.id })}>Add a card</Button>
          }
        >
          {isDropTarget ? 'Drop to move the card here.' : 'Add a card, or drag one in from another column.'}
        </EmptyState>
      ) : visibleIds.length === 0 ? (
        <EmptyState compact headingLevel="h3" title="No matches">
          No cards here match “{searchQuery.trim()}”.
        </EmptyState>
      ) : (
        <CardList
          columnId={column.id}
          columnName={column.name}
          ids={visibleIds}
          prevColumnId={prevColumnId}
          nextColumnId={nextColumnId}
        />
      )}
    </section>
  );
}

export default memo(Column);
