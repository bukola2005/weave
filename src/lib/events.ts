// Tiny pub/sub so the domain store can report things the user should hear
// about (a rollback, a conflict) without importing the UI store. The UI
// subscribes and turns these into toasts; tests can subscribe and assert.
export type DomainEvent =
  | { type: 'rollback'; label: string }
  | { type: 'conflict'; label: string }
  | { type: 'undo'; label: string }
  | { type: 'redo'; label: string }
  | { type: 'history-stale'; label: string }
  | { type: 'card-deleted'; label: string };

type Listener = (event: DomainEvent) => void;

export function createEmitter() {
  const listeners = new Set<Listener>();
  return {
    emit(event: DomainEvent) {
      listeners.forEach((listener) => listener(event));
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Emitter = ReturnType<typeof createEmitter>;
