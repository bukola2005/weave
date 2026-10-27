import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import Column from '../components/Column';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { BoardSkeleton } from '../components/ui/Skeleton';
import UndoRedoControls from '../components/UndoRedoControls';

const DOT_COLORS = ['#8692a3', '#6f6bc0', '#598976', '#a1702e', '#9a6cbd'];

// Subscribes to the board only. It re-renders when columns are added,
// removed or renamed — not when cards move, since columns read their own data.
export default function BoardView() {
  const { boardId } = useParams();
  const board = useDomainStore((s) => (boardId ? s.boards[boardId] : undefined));
  const hydrated = useUIStore((s) => s.hydrated);
  const openModal = useUIStore((s) => s.openModal);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);

  // Search is per-board; don't carry a filter over when switching boards.
  useEffect(() => () => setSearchQuery(''), [boardId, setSearchQuery]);

  if (!board) {
    if (!hydrated) return <BoardSkeleton />;
    return (
      <EmptyState
        title="That board doesn’t exist"
        action={
          <Link className="btn btn-primary" to="/">
            Back to the workspace
          </Link>
        }
      >
        It may have been deleted — possibly from another tab.
      </EmptyState>
    );
  }

  const columnIds = board.columnIds;

  return (
    <section aria-labelledby="active-board-title">
      <header className="topbar board-header">
        <div>
          <p className="rail-label" style={{ margin: '0 0 6px' }}>
            Weave / Board
          </p>
          <h1 id="active-board-title">{board.title}</h1>
          <p className="subtitle">{board.description}</p>
        </div>
        <div className="actions">
          <UndoRedoControls />
          <label htmlFor="task-search" className="sr-only">
            Search cards
          </label>
          <input
            id="task-search"
            type="search"
            autoComplete="off"
            placeholder="Search cards…"
            className="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {columnIds.length === 0 ? (
        <EmptyState
          title="Give this board its shape"
          action={
            <Button variant="primary" onClick={() => openModal({ type: 'column', boardId: board.id })}>
              + Add a column
            </Button>
          }
        >
          Create columns like To do, In progress, and Done to start moving work forward.
        </EmptyState>
      ) : (
        <section aria-labelledby="kanban-heading" style={{ marginTop: 31 }}>
          <div className="section-head">
            <h2 id="kanban-heading">The work, in progress</h2>
            <p id="drag-instructions">
              Drag cards to reorder, or focus a card’s ⠿ grip and use the arrow keys.
            </p>
          </div>
          <div className="kanban" data-kanban-scroller>
            {columnIds.map((id, index) => (
              <Column
                key={id}
                columnId={id}
                prevColumnId={columnIds[index - 1]}
                nextColumnId={columnIds[index + 1]}
                dotColor={DOT_COLORS[index % DOT_COLORS.length]}
              />
            ))}
            <button
              type="button"
              className="add-column-btn"
              onClick={() => openModal({ type: 'column', boardId: board.id })}
            >
              + Add column
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
