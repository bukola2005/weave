import type { Card, Stamp } from '../types';
import { applyOp, emptyData, rebuildIndexes, type DomainData, type Op } from '../lib/ops';
import type { Envelope } from '../lib/sync';

// Persistence API. This is the boundary a real backend would sit behind
// (REST or RPC). The store never touches storage directly; it calls these
// endpoints once an op is *confirmed* (synced to other tabs, or received
// from one), so a change that gets rolled back is never saved.
//
// Every write carries the op's Stamp, so a real server would apply the same
// last-write-wins rule (lib/ops.ts) the clients use.
//
// Two layers, two jobs:
//   Transport (lib/sync.ts): moves ops between live tabs, can fail.
//   BoardApi (this file):    stores the confirmed board so it survives reloads.
export interface BoardApi {
  loadWorkspace(): Promise<DomainData | null>;
  replaceWorkspace(data: DomainData): Promise<void>;

  // Card ordering endpoints (what drag and drop persists through).
  createCard(card: Omit<Card, 'edited' | 'placed'>, at: Stamp): Promise<void>;
  moveCard(cardId: string, toColumnId: string, position: number, at: Stamp): Promise<void>;
  deleteCard(cardId: string, at: Stamp): Promise<void>;

  // Everything else (boards, columns, card edits, comments, batches).
  commit(op: Op, at: Stamp): Promise<void>;
}

// Route a confirmed op to its endpoint. The store calls this; components
// keep calling store actions and never see the API.
export function persistOp(api: BoardApi, env: Envelope): Promise<void> {
  const { op, stamp } = env;
  switch (op.type) {
    case 'card/create':
      // A restore-from-undo also carries the card's comments; the generic
      // endpoint keeps them together with the card.
      return op.comments?.length ? api.commit(op, stamp) : api.createCard(op.card, stamp);
    case 'card/move':
      return api.moveCard(op.cardId, op.toColumnId, op.position, stamp);
    case 'card/delete':
      return api.deleteCard(op.cardId, stamp);
    default:
      return api.commit(op, stamp);
  }
}

export interface LocalBoardApi extends BoardApi {
  // Write any pending change now instead of waiting for the debounce.
  flush(): void;
}

// Mock backend: keeps the "server copy" in memory, applies each endpoint call
// with the shared reducer, and writes to localStorage (debounced, so a
// 240-card batch is one write, not 263).
export function createLocalStorageBoardApi(options: {
  storage?: Storage;
  key?: string;
  debounceMs?: number;
} = {}): LocalBoardApi {
  const storage = options.storage ?? localStorage;
  const key = options.key ?? 'weave-data-v2';
  const debounceMs = options.debounceMs ?? 300;
  let data: DomainData = emptyData();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = () => {
    clearTimeout(timer);
    timer = undefined;
    try {
      // Derived indexes are rebuilt on load, so only entities are stored.
      const { boards, columns, cards, comments } = data;
      storage.setItem(key, JSON.stringify({ boards, columns, cards, comments }));
    } catch {
      // Quota exceeded or storage blocked: the app keeps working in memory.
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(write, debounceMs);
  };
  const apply = (op: Op, at: Stamp) => {
    data = applyOp(data, op, at).data;
    schedule();
    return Promise.resolve();
  };

  return {
    loadWorkspace() {
      try {
        const raw = storage.getItem(key);
        if (raw) data = rebuildIndexes({ ...emptyData(), ...(JSON.parse(raw) as Partial<DomainData>) });
        return Promise.resolve(raw ? data : null);
      } catch {
        return Promise.resolve(null);
      }
    },
    replaceWorkspace(next) {
      data = next;
      schedule();
      return Promise.resolve();
    },
    createCard: (card, at) => apply({ type: 'card/create', card }, at),
    moveCard: (cardId, toColumnId, position, at) => apply({ type: 'card/move', cardId, toColumnId, position }, at),
    deleteCard: (cardId, at) => apply({ type: 'card/delete', cardId }, at),
    commit: apply,
    flush() {
      if (timer !== undefined) write();
    },
  };
}
