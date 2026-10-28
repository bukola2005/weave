import { useEffect } from 'react';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import Button from './ui/Button';

const isTextEntry = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// Toolbar buttons + global shortcuts: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or
// Ctrl+Y redo. Shortcuts are ignored while typing (the field's own text undo
// should win) and while a modal is open.
export default function UndoRedoControls() {
  const undoLabel = useDomainStore((s) => s.history.past.at(-1)?.label);
  const redoLabel = useDomainStore((s) => s.history.future.at(-1)?.label);
  const undo = useDomainStore((s) => s.undo);
  const redo = useDomainStore((s) => s.redo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isTextEntry(e.target) || useUIStore.getState().activeModal) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="undo-redo" role="group" aria-label="History">
      <Button
        variant="secondary"
        size="sm"
        onClick={undo}
        disabled={!undoLabel}
        aria-label={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
        title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : undefined}
      >
        ↶ Undo
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={redo}
        disabled={!redoLabel}
        aria-label={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'}
        title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : undefined}
      >
        ↷ Redo
      </Button>
    </div>
  );
}
