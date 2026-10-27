import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Sidebar from './components/Sidebar';
import ModalRoot from './components/ModalRoot';
import ErrorBoundary from './components/ErrorBoundary';
import ToastRegion from './components/ToastRegion';
import { BoardSkeleton } from './components/ui/Skeleton';

// The board page is code-split: its bundle (columns, cards, the card modal,
// markdown rendering) only downloads once someone actually opens a board,
// not on first load of the dashboard.
const BoardView = lazy(() => import('./pages/BoardView'));

function Routed() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<BoardSkeleton />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/board/:boardId" element={<BoardView />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/board/:boardId" element={<Sidebar />} />
          <Route path="*" element={<Sidebar />} />
        </Routes>
        <main className="main">
          <Routed />
        </main>
      </div>
      <ErrorBoundary>
        <ModalRoot />
      </ErrorBoundary>
      <ToastRegion />
    </BrowserRouter>
  );
}

export default App;
