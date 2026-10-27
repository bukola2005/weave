import { create } from 'zustand';

// UI state: purely what's on screen right now (which modal is open, toasts,
// the card being dragged, the theme). None of this is "real" data — it's
// never broadcast to other tabs and never part of undo history. Kept in its
// own store so domain data and transient screen state never get tangled.
export type ModalState =
  | { type: 'board' }
  | { type: 'column'; boardId: string }
  | { type: 'renameColumn'; columnId: string; currentName: string }
  | { type: 'card'; columnId: string; cardId?: string }
  | { type: 'confirmDelete'; kind: 'board' | 'column' | 'card'; id: string; label: string }
  | null;

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  action?: { label: string; run: () => void };
}

export type Theme = 'light' | 'dark';

export interface DragState {
  cardId: string;
  fromColumnId: string;
}

export interface DropTarget {
  columnId: string;
  index: number; // insertion index in the target's visible list (dragged card included)
}

interface UIState {
  activeModal: ModalState;
  openModal: (modal: Exclude<ModalState, null>) => void;
  closeModal: () => void;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>, durationMs?: number) => string;
  dismissToast: (id: string) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Board search lives here (not local state) because the drag controller
  // needs the same filtered list the columns render to compute drop slots.
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Updated only when the hovered slot changes, never per pointermove —
  // the drag ghost itself is moved by direct DOM writes (see dnd/).
  drag: DragState | null;
  dropTarget: DropTarget | null;
  setDrag: (drag: DragState | null) => void;
  setDropTarget: (target: DropTarget | null) => void;

  // After a keyboard move the card remounts in a new spot; this tells it to
  // take focus back so keyboard users don't lose their place.
  focusCardId: string | null;
  requestCardFocus: (cardId: string | null) => void;

  // Polite screen-reader announcement (moves, undo, etc.).
  announcement: string;
  announce: (message: string) => void;

  // Real-time status
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  peerCount: number;
  setPeerCount: (count: number) => void;
  simulateFailures: boolean;
  setSimulateFailures: (on: boolean) => void;
}

const THEME_KEY = 'weave-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore blocked storage
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export const useUIStore = create<UIState>((set, get) => ({
  activeModal: null,
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),

  toasts: [],
  pushToast: (toast, durationMs = 5000) => {
    const id = crypto.randomUUID();
    // Keep at most 4 on screen; the oldest drops off first.
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    if (durationMs > 0) setTimeout(() => get().dismissToast(id), durationMs);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  theme: initialTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore blocked storage
    }
    set({ theme });
  },

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  drag: null,
  dropTarget: null,
  setDrag: (drag) => set({ drag }),
  setDropTarget: (target) => {
    const current = get().dropTarget;
    if (current?.columnId === target?.columnId && current?.index === target?.index) return;
    set({ dropTarget: target });
  },

  focusCardId: null,
  requestCardFocus: (focusCardId) => set({ focusCardId }),

  announcement: '',
  announce: (message) => {
    // Clear first so repeating the same sentence is still announced.
    set({ announcement: '' });
    setTimeout(() => set({ announcement: message }), 30);
  },

  hydrated: false,
  setHydrated: (hydrated) => set({ hydrated }),
  peerCount: 0,
  setPeerCount: (peerCount) => set({ peerCount }),
  simulateFailures: false,
  setSimulateFailures: (simulateFailures) => set({ simulateFailures }),
}));
