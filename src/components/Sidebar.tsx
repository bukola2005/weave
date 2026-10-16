import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDomainStore } from '../store/domainStore';

export default function Sidebar() {
  const boardsRecord = useDomainStore((s) => s.boards);
  const boards = useMemo(() => Object.values(boardsRecord), [boardsRecord]);
  const { boardId: activeBoardId } = useParams();

  return (
    <aside className="rail" aria-label="Workspace sidebar">
      <Link to="/" className="brand" aria-label="Weave home">
        <svg className="mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M5 10c9-8 19-8 30 0M5 20c9-8 19-8 30 0M5 30c9-8 19-8 30 0"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M10 5c8 9 8 21 0 30M20 5c8 9 8 21 0 30M30 5c8 9 8 21 0 30"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
        <span className="brand-name">Weave</span>
      </Link>

      <p className="rail-label">Your boards</p>

      <nav aria-label="Board switcher" className="nav-list">
        {boards.map((board) => (
          <Link
            key={board.id}
            to={`/board/${board.id}`}
            className={`switcher${board.id === activeBoardId ? ' active' : ''}`}
            aria-current={board.id === activeBoardId ? 'page' : undefined}
            aria-label={`Open ${board.title} board`}
          >
            <span className="switch-title">{board.title}</span>
            <span className="switch-desc">{board.description}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
