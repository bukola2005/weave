import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Card, CardContent } from '../types';
import { applyOp, emptyData, invertOp, type DomainData, type Op, type Outcome } from '../lib/ops';
import { emptyHistory, forget, record, takeRedo, takeUndo, type HistoryState } from '../lib/history';
import { observe, stamp, TAB_ID } from '../lib/clock';
import { positionBetween } from '../lib/ordering';
import { canReply, commentDepth } from '../lib/comments';
import { buildDemoBoard } from '../lib/seed';
import { DISPLAY_NAME } from '../lib/identity';
import { createEmitter, type Emitter } from '../lib/events';
import type { Envelope, Transport } from '../lib/sync';

// DOMAIN state: the real content of the app (boards, columns, cards, comments).
// Still normalized by id (Record<id, item>). What changed for Stage 2:
//
//  - Every mutation is now a serializable Op run through one pure reducer
//    (lib/ops.ts). Local actions, remote ops from other tabs, undo and redo
//    all take the same path, so they can't drift apart.
//  - Ordering moved from "the array is the truth" to fractional `position`
//    keys on each card/column; columnIds / cardIds are now sorted caches.
//  - Each entity carries LWW stamps so concurrent edits from two tabs
//    resolve the same way everywhere.
//  - A per-tab `history` slice (the undo/redo command log) lives alongside
//    the data. It is never persisted or broadcast.
export interface DomainState extends DomainData {
  history: HistoryState;

  // Low-level pipeline
  dispatch: (op: Op, options?: { undoLabel?: string }) => Outcome;
  receive: (env: Envelope) => Outcome;
  replaceData: (data: DomainData) => void;
  setTransport: (transport: Transport | null) => void;
  undo: () => void;
  redo: () => void;

  // Boards / columns
  addBoard: (title: string, description: string) => string;
  deleteBoard: (id: string) => void;
  addColumn: (boardId: string, name: string) => string;
  renameColumn: (columnId: string, name: string) => void;
  deleteColumn: (columnId: string) => void;
  loadDemoBoard: () => string;

  // Cards
  addCard: (columnId: string, title: string, extra?: Partial<Omit<CardContent, 'title'>>) => string;
  updateCard: (cardId: string, updates: Partial<CardContent>) => void;
  deleteCard: (cardId: string) => void;
  moveCard: (cardId: string, toColumnId: string, position: number) => void;

  // Comments
  addComment: (cardId: string, body: string, parentId?: string | null) => string | null;
  editComment: (commentId: string, body: string) => void;
  deleteComment: (commentId: string) => void;
}

const pickData = (s: DomainData): DomainData => ({
  boards: s.boards,
  columns: s.columns,
  cards: s.cards,
  comments: s.comments,
  commentsByCard: s.commentsByCard,
});

const cardLabel = (card: Card | undefined) => (card ? `“${card.title}”` : 'card');

export function createDomainStore(options: { transport?: Transport | null; events?: Emitter } = {}) {
  let transport = options.transport ?? null;
  const events = options.events ?? createEmitter();

  // Optimistic rebase. `confirmed` holds only what other tabs can also have:
  // remote ops plus local ops whose send succeeded. `pending` holds local ops
  // still in flight. The state components see is always
  //   confirmed + pending (replayed in order).
  // When a send fails, that op is dropped from `pending` and the view is
  // rebuilt from `confirmed`. That's correct even when later ops touched the
  // same card. Applying a one-off inverse wasn't: it could undo a later move
  // that other tabs had already received, and the tabs would end up out of sync.
  let confirmed: DomainData = emptyData();
  let pending: Envelope[] = [];

  const store = createStore<DomainState>()((set, get) => {
    const run = (op: Op, undoLabel?: string): { outcome: Outcome; env?: Envelope } => {
      const before = pickData(get());
      const at = stamp();
      const result = applyOp(before, op, at);
      if (result.outcome !== 'applied') return { outcome: result.outcome };

      const env: Envelope = { opId: crypto.randomUUID(), op, stamp: at };
      const inverse = invertOp(before, op);
      let history = get().history;
      if (undoLabel && inverse) {
        history = record(history, { id: env.opId, label: undoLabel, forward: op, inverse });
      }
      set({ ...result.data, history });

      if (!transport) {
        confirmed = applyOp(confirmed, op, at).data;
        return { outcome: 'applied', env };
      }
      pending.push(env);
      transport.send(env).then(
        () => {
          pending = pending.filter((p) => p.opId !== env.opId);
          confirmed = applyOp(confirmed, op, at).data;
        },
        () => {
          pending = pending.filter((p) => p.opId !== env.opId);
          const rebuilt = pending.reduce((data, p) => applyOp(data, p.op, p.stamp).data, confirmed);
          set({ ...rebuilt, history: forget(get().history, env.opId) });
          events.emit({ type: 'rollback', label: undoLabel ?? describeOp(op, before) });
        }
      );
      return { outcome: 'applied', env };
    };

    return {
      ...emptyData(),
      history: emptyHistory(),

      dispatch: (op, opts) => run(op, opts?.undoLabel).outcome,

      receive: (env) => {
        observe(env.stamp.ts);
        // Remote ops are confirmed by definition. Applying them to both layers
        // gives the same result as replaying `pending` on top, because LWW
        // stamps make the outcome independent of the order ops arrive in.
        confirmed = applyOp(confirmed, env.op, env.stamp).data;
        const before = pickData(get());
        const result = applyOp(before, env.op, env.stamp);
        if (result.outcome === 'applied') set(result.data);
        else if (result.outcome === 'stale' && isConflictable(env.op)) {
          // We already hold a newer write for this entity. Ours wins (LWW),
          // and the other tab will converge when our op reaches it.
          events.emit({ type: 'conflict', label: describeOp(env.op, before) });
        }
        return result.outcome;
      },

      replaceData: (data) => {
        confirmed = pickData(data);
        pending = [];
        set(confirmed);
      },

      setTransport: (next) => {
        transport = next;
      },

      undo: () => {
        const taken = takeUndo(get().history);
        if (!taken) return;
        set({ history: taken.history });
        const { outcome } = run(taken.command.inverse);
        if (outcome === 'applied') events.emit({ type: 'undo', label: taken.command.label });
        else {
          // e.g. undoing a move of a card another tab has since deleted.
          set({ history: forget(get().history, taken.command.id) });
          events.emit({ type: 'history-stale', label: taken.command.label });
        }
      },

      redo: () => {
        const taken = takeRedo(get().history);
        if (!taken) return;
        set({ history: taken.history });
        const { outcome } = run(taken.command.forward);
        if (outcome === 'applied') events.emit({ type: 'redo', label: taken.command.label });
        else {
          set({ history: forget(get().history, taken.command.id) });
          events.emit({ type: 'history-stale', label: taken.command.label });
        }
      },

      addBoard: (title, description) => {
        const id = crypto.randomUUID();
        run({
          type: 'board/create',
          board: { id, title, description, createdAt: new Date().toISOString() },
        });
        return id;
      },

      deleteBoard: (id) => {
        run({ type: 'board/delete', boardId: id });
      },

      addColumn: (boardId, name) => {
        const id = crypto.randomUUID();
        const { boards, columns } = get();
        const lastId = boards[boardId]?.columnIds.at(-1);
        const position = positionBetween(lastId ? columns[lastId]?.position : undefined, undefined);
        run({ type: 'column/create', column: { id, boardId, name, position } });
        return id;
      },

      renameColumn: (columnId, name) => {
        run({ type: 'column/rename', columnId, name });
      },

      deleteColumn: (columnId) => {
        run({ type: 'column/delete', columnId });
      },

      loadDemoBoard: () => {
        const { boardId, op } = buildDemoBoard();
        run(op);
        return boardId;
      },

      addCard: (columnId, title, extra = {}) => {
        const id = crypto.randomUUID();
        const { columns, cards } = get();
        const lastId = columns[columnId]?.cardIds.at(-1);
        const position = positionBetween(lastId ? cards[lastId]?.position : undefined, undefined);
        run(
          {
            type: 'card/create',
            card: {
              id,
              columnId,
              title,
              description: extra.description ?? '',
              tags: extra.tags ?? [],
              dueDate: extra.dueDate ?? null,
              position,
            },
          },
          `Create “${title}”`
        );
        return id;
      },

      updateCard: (cardId, updates) => {
        run({ type: 'card/update', cardId, changes: updates });
      },

      deleteCard: (cardId) => {
        const card = get().cards[cardId];
        const { outcome } = run({ type: 'card/delete', cardId }, `Delete ${cardLabel(card)}`);
        if (outcome === 'applied') events.emit({ type: 'card-deleted', label: cardLabel(card) });
      },

      moveCard: (cardId, toColumnId, position) => {
        const card = get().cards[cardId];
        if (card && card.columnId === toColumnId && card.position === position) return;
        run({ type: 'card/move', cardId, toColumnId, position }, `Move ${cardLabel(card)}`);
      },

      addComment: (cardId, body, parentId = null) => {
        const { comments } = get();
        if (parentId) {
          const parent = comments[parentId];
          if (!parent || !canReply(commentDepth(parent, comments))) return null;
        }
        const id = crypto.randomUUID();
        const { outcome } = run({
          type: 'comment/add',
          comment: { id, cardId, parentId, author: DISPLAY_NAME, body, createdAt: Date.now() },
        });
        return outcome === 'applied' ? id : null;
      },

      editComment: (commentId, body) => {
        run({ type: 'comment/edit', commentId, body });
      },

      deleteComment: (commentId) => {
        run({ type: 'comment/delete', commentId });
      },
    };
  });

  return { store, events };
}

function isConflictable(op: Op): boolean {
  return (
    op.type === 'card/update' ||
    op.type === 'card/move' ||
    op.type === 'column/rename' ||
    op.type === 'comment/edit'
  );
}

function describeOp(op: Op, data: DomainData): string {
  switch (op.type) {
    case 'card/update':
    case 'card/move':
    case 'card/delete':
      return cardLabel(data.cards[op.cardId]);
    case 'card/create':
      return `“${op.card.title}”`;
    case 'column/rename':
    case 'column/delete':
      return `column “${data.columns[op.columnId]?.name ?? ''}”`;
    case 'comment/add':
    case 'comment/edit':
    case 'comment/delete':
      return 'a comment';
    default:
      return 'your change';
  }
}

// The app-wide instance. Components keep using `useDomainStore(selector)`
// exactly as in Stage 1; tests build isolated instances with createDomainStore().
const app = createDomainStore();
export const domainEvents = app.events;
export const domainStore: StoreApi<DomainState> = app.store;
export const useDomainStore = Object.assign(
  function useDomainStore<U>(selector: (state: DomainState) => U): U {
    return useStore(domainStore, selector);
  },
  domainStore
);
