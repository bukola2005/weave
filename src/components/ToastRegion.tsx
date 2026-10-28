import { useUIStore } from '../store/uiStore';
import Button from './ui/Button';

const ICON = { info: 'ℹ', success: '✓', error: '!' } as const;

// Toasts render in two live regions: errors are assertive (role="alert"),
// everything else is polite (role="status") so it doesn't interrupt.
// Also hosts the app-wide polite announcer used for drag/keyboard moves.
export default function ToastRegion() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  const announcement = useUIStore((s) => s.announcement);

  const render = (tone: 'polite' | 'assertive') =>
    toasts
      .filter((t) => (t.tone === 'error') === (tone === 'assertive'))
      .map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon" aria-hidden="true">
            {ICON[toast.tone]}
          </span>
          <p className="toast-message">{toast.message}</p>
          {toast.action && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                toast.action?.run();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </Button>
          )}
          <Button variant="icon" size="sm" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
            ✕
          </Button>
        </div>
      ));

  return (
    <>
      <div className="toast-stack">
        <div role="status" aria-live="polite" className="toast-group">
          {render('polite')}
        </div>
        <div role="alert" aria-live="assertive" className="toast-group">
          {render('assertive')}
        </div>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  );
}
