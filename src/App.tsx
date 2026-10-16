import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Sidebar from './components/Sidebar';
import ModalRoot from './components/ModalRoot';

// The board page is code-split: its bundle (columns, cards, the card modal,
// markdown rendering) only downloads once someone actually opens a board,
// not on first load of the dashboard.
const BoardView = lazy(() => import('./pages/BoardView'));

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Suspense fallback={<p className="subtitle">Loading board…</p>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/board/:boardId" element={<BoardView />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <ModalRoot />
    </BrowserRouter>
  );
}

export default App;
