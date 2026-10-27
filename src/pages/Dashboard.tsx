import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import BoardTile from '../components/BoardTile';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';

export default function Dashboard() {
  const boardsRecord = useDomainStore((s) => s.boards);
  const boards = useMemo(() => Object.values(boardsRecord), [boardsRecord]);
  const loadDemoBoard = useDomainStore((s) => s.loadDemoBoard);
  const hydrated = useUIStore((s) => s.hydrated);
  const openModal = useUIStore((s) => s.openModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const navigate = useNavigate();

  const loadDemo = () => {
    const id = loadDemoBoard();
    pushToast({ tone: 'success', message: 'Loaded a 240-card demo board.' }, 3000);
    navigate(`/board/${id}`);
  };

  if (!hydrated && boards.length === 0) return <DashboardSkeleton />;

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
        <div className="actions">
          <Button onClick={loadDemo}>Load demo board</Button>
          <Button variant="primary" onClick={() => openModal({ type: 'board' })}>
            + New board
          </Button>
        </div>
      </header>

      {boards.length > 0 && (
        <>
          <div className="thread-divider" aria-hidden="true">
            <svg viewBox="0 0 1000 40" preserveAspectRatio="none" fill="none">
              <path
                d="M0 18 C130 2 230 36 355 18 S590 2 715 18 S875 36 1000 18"
                stroke="var(--thread)"
                strokeWidth="1"
              />
              <path
                d="M0 24 C130 40 230 6 355 24 S590 40 715 24 S875 6 1000 24"
                stroke="var(--thread)"
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
        <EmptyState
          title="A blank canvas for what’s next"
          action={
            <div className="empty-actions">
              <Button variant="primary" onClick={() => openModal({ type: 'board' })}>
                + Create a board
              </Button>
              <Button onClick={loadDemo}>Load demo board</Button>
            </div>
          }
        >
          Create your first board to give your ideas a place to grow — or load a large demo board to try
          drag-and-drop and multi-tab sync.
        </EmptyState>
      )}
    </section>
  );
}
