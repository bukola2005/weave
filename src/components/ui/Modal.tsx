import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  titleId: string;
  title: string;
  description?: string;
  onClose: () => void;
  size?: 'md' | 'lg';
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Generic modal shell: handles the backdrop, Escape-to-close, trapping Tab
// focus inside the dialog, focusing the first field on open, and returning
// focus to whatever triggered it on close. Every modal in the app is built on
// this so the accessibility behaviour only has to be correct once.
export default function Modal({ titleId, title, description, onClose, size = 'md', children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the focus effect when a parent passes
  // a new function identity (which would steal focus mid-typing).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`dialog${size === 'lg' ? ' dialog-lg' : ''}`}
      >
        <h2 id={titleId}>{title}</h2>
        {description && <p className="dialog-copy">{description}</p>}
        {children}
      </div>
    </div>
  );
}
