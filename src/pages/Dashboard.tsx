import { useMemo } from 'react';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import BoardTile from '../components/BoardTile';

export default function Dashboard() {
  const boardsRecord = useDomainStore((s) => s.boards);
  const boards = useMemo(() => Object.values(boardsRecord), [boardsRecord]);
  const openModal = useUIStore((s) => s.openModal);

  return (
    <section aria-labelledby="dashboard-title">
      <header className="topbar">
        <div>
          <p className="rail-label" style={{ margin: '0 0 6px' }}>
            The workspace / Weave
          </p>
          <h1 id="dashboard-title">Where ideas take shape.</h1>
          <p className="subtitle">
            A thoughtful place for the projects, people, and small steps that make things happen.
          </p>
        </div>
        <button type="button" className="primary" onClick={() => openModal({ type: 'board' })}>
          + New board
        </button>
      </header>

      {boards.length > 0 && (
        <>
          <div className="thread-divider" aria-hidden="true">
            <svg viewBox="0 0 1000 40" preserveAspectRatio="none" fill="none">
              <path
                d="M0 18 C130 2 230 36 355 18 S590 2 715 18 S875 36 1000 18"
                stroke="#aaa8a2"
                strokeWidth="1"
              />
              <path
                d="M0 24 C130 40 230 6 355 24 S590 40 715 24 S875 6 1000 24"
                stroke="#aaa8a2"
                strokeWidth="1"
              />
            </svg>
          </div>

          <div className="section-head">
            <h2>Boards in motion</h2>
            <p>Pick up where you left off</p>
          </div>

          <div className="board-layout">
            <BoardTile board={boards[0]} featured />
            <div className="supporting-boards">
              {boards.slice(1).map((board) => (
                <BoardTile key={board.id} board={board} />
              ))}
            </div>
          </div>

          <p className="sketch-note">Every big thing starts with a little thread.</p>
        </>
      )}

      {boards.length === 0 && (
        <div className="empty-state">
          <h2>A blank canvas for what's next</h2>
          <p>Create your first board to give your ideas a place to grow.</p>
          <button type="button" className="primary" onClick={() => openModal({ type: 'board' })}>
            + Create a board
          </button>
        </div>
      )}
    </section>
  );
}
