import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startRealtime } from './lib/realtime';
import './styles/global.css';

// Outside React on purpose: StrictMode double-invokes effects in dev, which
// would open two BroadcastChannels and send two "hello"s.
startRealtime();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
