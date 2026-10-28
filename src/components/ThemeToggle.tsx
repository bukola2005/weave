import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

// Theme is a single attribute on <html>; every color in global.css reads a
// CSS variable that [data-theme="dark"] redefines. No component knows about
// colors, so dark mode costs zero re-renders beyond this button.
export default function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={dark}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">{dark ? '☾' : '☀'}</span>
      </span>
      Dark mode
    </button>
  );
}
