import type { Op } from './ops';

// Command-pattern undo log. Each entry stores the op that was run and the op
// that reverses it — a few hundred bytes — rather than a snapshot of the whole
// board. Undo dispatches `inverse`; redo dispatches `forward` again. Both go
// through the normal op pipeline, so they're broadcast to other tabs too.
export interface Command {
  id: string;
  label: string; // human-readable, e.g. 'Move "Write tests"'
  forward: Op;
  inverse: Op;
}

export interface HistoryState {
  past: Command[]; // most recent last
  future: Command[]; // next redo last
}

export const HISTORY_LIMIT = 100;

export const emptyHistory = (): HistoryState => ({ past: [], future: [] });

// A new command invalidates the redo stack (standard editor behaviour).
export function record(history: HistoryState, command: Command): HistoryState {
  const past = [...history.past, command];
  return { past: past.length > HISTORY_LIMIT ? past.slice(-HISTORY_LIMIT) : past, future: [] };
}

export function takeUndo(history: HistoryState): { command: Command; history: HistoryState } | null {
  const command = history.past[history.past.length - 1];
  if (!command) return null;
  return {
    command,
    history: { past: history.past.slice(0, -1), future: [...history.future, command] },
  };
}

export function takeRedo(history: HistoryState): { command: Command; history: HistoryState } | null {
  const command = history.future[history.future.length - 1];
  if (!command) return null;
  return {
    command,
    history: { past: [...history.past, command], future: history.future.slice(0, -1) },
  };
}

// Used when an optimistic op is rolled back (sync failed): the command never
// really happened, so it must not be undoable either.
export function forget(history: HistoryState, commandId: string): HistoryState {
  return {
    past: history.past.filter((c) => c.id !== commandId),
    future: history.future.filter((c) => c.id !== commandId),
  };
}
