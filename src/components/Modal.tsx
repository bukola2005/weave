import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  titleId: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

// Generic modal shell: handles the backdrop, Escape-to-close, trapping Tab
// focus inside the dialog, focusing the first field on open, and returning
// focus to whatever triggered it on close. Every modal in the app (create
// board, create/rename column, add/edit card, confirm delete) is built on
// this so the accessibility behaviour only has to be correct once.
export default function Modal({ titleId, title, description, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const firstField = dialogRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button'
    );
    firstField?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'input, textarea, select, button:not(:disabled)'
        )
      );
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
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        {description && <p className="dialog-copy">{description}</p>}
        {children}
      </div>
    </div>
  );
}
