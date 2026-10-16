import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Board } from '../types';
import { useUIStore } from '../store/uiStore';

interface Props {
  board: Board;
  featured?: boolean;
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso)
  );

function BoardTile({ board, featured }: Props) {
  const openModal = useUIStore((s) => s.openModal);

  return (
    <article className={`board-tile${featured ? ' featured' : ''}`}>
      <Link to={`/board/${board.id}`} className="tile-open" aria-label={`Open ${board.title} board`}>
        <span className="tile-icon" aria-hidden="true">
          ↗
        </span>
        <span className="tile-title">{board.title}</span>
        <span className="tile-desc">{board.description}</span>
        <span className="tile-date">Created {dateLabel(board.createdAt)}</span>
      </Link>
      <button
        className="trash"
        type="button"
        aria-label={`Delete ${board.title} board`}
        onClick={() =>
          openModal({ type: 'confirmDelete', kind: 'board', id: board.id, label: board.title })
        }
      >
        🗑
      </button>
    </article>
  );
}

export default memo(BoardTile);
