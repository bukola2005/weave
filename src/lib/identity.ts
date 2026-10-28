import { TAB_ID } from './clock';

// There are no accounts yet, so each tab gets a readable pseudonym. It's kept
// in sessionStorage so a refresh keeps the same name but a second tab gets a
// different one — which makes "who said what" visible when demoing sync.
function loadName(): string {
  const fallback = `Guest ${TAB_ID.slice(0, 4).toUpperCase()}`;
  try {
    const saved = sessionStorage.getItem('weave-display-name');
    if (saved) return saved;
    sessionStorage.setItem('weave-display-name', fallback);
  } catch {
    // Storage blocked (private mode etc.) — a per-load name is fine.
  }
  return fallback;
}

export const DISPLAY_NAME = loadName();
