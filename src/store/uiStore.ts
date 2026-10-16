import { create } from 'zustand';

// UI state: purely what's on screen right now (which modal is open, and
// for what). None of this is "real" data — it never gets saved anywhere,
// it just describes the current screen. Kept in its own store so domain
// data and transient screen state never get tangled together.
export type ModalState =
  | { type: 'board' }
  | { type: 'column'; boardId: string }
  | { type: 'renameColumn'; columnId: string; currentName: string }
  | { type: 'card'; columnId: string; cardId?: string }
  | { type: 'confirmDelete'; kind: 'board' | 'column' | 'card'; id: string; label: string }
  | null;

interface UIState {
  activeModal: ModalState;
  openModal: (modal: Exclude<ModalState, null>) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeModal: null,
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
}));
