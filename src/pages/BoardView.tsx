import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import Column from '../components/Column';

const DOT_COLORS = ['#8692a3', '#565297', '#598976', '#a1702e', '#7a4f9c'];

export default function BoardView() {
  const { boardId } = useParams();
  const board = useDomainStore((s) => (boardId ? s.boards[boardId] : undefined));
  const columnsRecord = useDomainStore((s) => s.columns);
  const cardsRecord = useDomainStore((s) => s.cards);
  const openModal = useUIStore((s) => s.openModal);
  const [searchQuery, setSearchQuery] = useState('');

  const orderedColumns = useMemo(
    () => (board ? board.columnIds.map((id) => columnsRecord[id]).filter(Boolean) : []),
    [board, columnsRecord]
  );

  if (!board) {
    return (
      <section>
        <p className="subtitle">
          That board doesn't exist (or was deleted). <Link to="/">Back to the workspace</Link>.
        </p>
      </section>
    );
  }

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

      {orderedColumns.length === 0 ? (
        <div className="empty-state">
          <h2>Give this board its shape</h2>
          <p>Create columns like To do, In progress, and Done to start moving work forward.</p>
          <button
            type="button"
            className="primary"
            onClick={() => openModal({ type: 'column', boardId: board.id })}
          >
            + Add a column
          </button>
        </div>
      ) : (
        <section aria-labelledby="kanban-heading" style={{ marginTop: 31 }}>
          <div className="section-head">
            <h2 id="kanban-heading">The work, in progress</h2>
            <p>Use the arrows to move cards along</p>
          </div>
          <div className="kanban" role="list" aria-label="Board columns">
            {orderedColumns.map((column, index) => (
              <Column
                key={column.id}
                column={column}
                cardsRecord={cardsRecord}
                orderedColumns={orderedColumns}
                dotColor={DOT_COLORS[index % DOT_COLORS.length]}
                searchQuery={searchQuery}
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
