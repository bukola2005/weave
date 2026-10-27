import type { Board, Card, CardContent, Column, Comment, Stamp } from '../types';
import { isNewer } from './clock';
import { comparePositioned, insertSorted } from './ordering';

// The normalized entity tables. Everything that is broadcast between tabs or
// persisted lives here; anything else (undo history, screen state) does not.
export interface DomainData {
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  cards: Record<string, Card>;
  comments: Record<string, Comment>;
  // DERIVED index: comment ids per card, oldest first. Lets a card read its
  // comment count in O(1) instead of scanning every comment in the app.
  commentsByCard: Record<string, string[]>;
}

export const emptyData = (): DomainData => ({
  boards: {},
  columns: {},
  cards: {},
  comments: {},
  commentsByCard: {},
});

type NewCard = Omit<Card, 'edited' | 'placed'>;
type NewComment = Omit<Comment, 'edited' | 'deleted' | 'editedByUser'>;

// Every mutation in the app is one of these serializable operations. The same
// op object is (1) applied locally, (2) broadcast to other tabs, and (3)
// stored with its inverse in the undo log — one code path for all three.
export type Op =
  | { type: 'board/create'; board: Pick<Board, 'id' | 'title' | 'description' | 'createdAt'> }
  | { type: 'board/delete'; boardId: string }
  | { type: 'column/create'; column: Pick<Column, 'id' | 'boardId' | 'name' | 'position'> }
  | { type: 'column/rename'; columnId: string; name: string }
  | { type: 'column/delete'; columnId: string }
  | { type: 'card/create'; card: NewCard; comments?: Comment[] }
  | { type: 'card/update'; cardId: string; changes: Partial<CardContent> }
  | { type: 'card/move'; cardId: string; toColumnId: string; position: number }
  | { type: 'card/delete'; cardId: string }
  | { type: 'comment/add'; comment: NewComment }
  | { type: 'comment/edit'; commentId: string; body: string }
  | { type: 'comment/delete'; commentId: string }
  | { type: 'batch'; ops: Op[] };

// applied: the op changed state.
// stale:   the target exists but already holds a newer write (LWW rejected it).
// missing: the target (or something it needs, like the destination column)
//          no longer exists — typically deleted by another tab.
export type Outcome = 'applied' | 'stale' | 'missing';

export interface ApplyResult {
  data: DomainData;
  outcome: Outcome;
}

const omit = <T>(record: Record<string, T>, ids: Iterable<string>): Record<string, T> => {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};

function resortColumn(data: DomainData, columnId: string, cardId: string): Record<string, Column> {
  const column = data.columns[columnId];
  if (!column) return data.columns;
  return {
    ...data.columns,
    [columnId]: { ...column, cardIds: insertSorted(column.cardIds, cardId, (id) => data.cards[id]) },
  };
}

function removeCardFromColumn(
  columns: Record<string, Column>,
  columnId: string,
  cardId: string
): Record<string, Column> {
  const column = columns[columnId];
  if (!column) return columns;
  return { ...columns, [columnId]: { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) } };
}

// Removes cards and every comment hanging off them.
function dropCards(data: DomainData, cardIds: string[]): Pick<DomainData, 'cards' | 'comments' | 'commentsByCard'> {
  const commentIds = cardIds.flatMap((id) => data.commentsByCard[id] ?? []);
  return {
    cards: omit(data.cards, cardIds),
    comments: omit(data.comments, commentIds),
    commentsByCard: omit(data.commentsByCard, cardIds),
  };
}

function hasChildren(data: DomainData, comment: Comment): boolean {
  return (data.commentsByCard[comment.cardId] ?? []).some(
    (id) => data.comments[id]?.parentId === comment.id
  );
}

// Deleting a comment that still has replies would orphan them, so it becomes
// a tombstone ("[deleted]") instead. Deleting a leaf removes it outright, and
// if that leaves a tombstoned parent with no replies, the parent goes too.
function deleteComment(data: DomainData, commentId: string, at: Stamp): DomainData {
  const comment = data.comments[commentId];
  if (!comment) return data;
  if (hasChildren(data, comment)) {
    return {
      ...data,
      comments: { ...data.comments, [commentId]: { ...comment, deleted: true, body: '', edited: at } },
    };
  }
  const next: DomainData = {
    ...data,
    comments: omit(data.comments, [commentId]),
    commentsByCard: {
      ...data.commentsByCard,
      [comment.cardId]: (data.commentsByCard[comment.cardId] ?? []).filter((id) => id !== commentId),
    },
  };
  const parent = comment.parentId ? next.comments[comment.parentId] : undefined;
  if (parent && parent.deleted && !hasChildren(next, parent)) {
    return deleteComment(next, parent.id, at);
  }
  return next;
}

// Pure reducer: (state, op, stamp) -> new state. Local and remote ops both go
// through here; local ops simply always carry the newest stamp.
//
// Conflict rule (documented in ARCHITECTURE_EVOLUTION.md):
//   - Updates are last-write-wins per register, compared by Stamp (ts, then tab id).
//   - Deletes always win: an update or move targeting a deleted entity is dropped.
//   - Creates are idempotent: re-creating an existing id only overwrites it if newer.
export function applyOp(data: DomainData, op: Op, at: Stamp): ApplyResult {
  switch (op.type) {
    case 'batch': {
      let next = data;
      let applied = false;
      for (const inner of op.ops) {
        const result = applyOp(next, inner, at);
        next = result.data;
        applied ||= result.outcome === 'applied';
      }
      return { data: next, outcome: applied ? 'applied' : 'stale' };
    }

    case 'board/create': {
      const existing = data.boards[op.board.id];
      if (existing && !isNewer(at, existing.edited)) return { data, outcome: 'stale' };
      const board: Board = { ...op.board, columnIds: existing?.columnIds ?? [], edited: at };
      return { data: { ...data, boards: { ...data.boards, [board.id]: board } }, outcome: 'applied' };
    }

    case 'board/delete': {
      const board = data.boards[op.boardId];
      if (!board) return { data, outcome: 'missing' };
      const cardIds = board.columnIds.flatMap((id) => data.columns[id]?.cardIds ?? []);
      return {
        data: {
          ...data,
          ...dropCards(data, cardIds),
          boards: omit(data.boards, [op.boardId]),
          columns: omit(data.columns, board.columnIds),
        },
        outcome: 'applied',
      };
    }

    case 'column/create': {
      const board = data.boards[op.column.boardId];
      if (!board) return { data, outcome: 'missing' };
      const existing = data.columns[op.column.id];
      if (existing && !isNewer(at, existing.edited)) return { data, outcome: 'stale' };
      const column: Column = { ...op.column, cardIds: existing?.cardIds ?? [], edited: at };
      const columns = { ...data.columns, [column.id]: column };
      return {
        data: {
          ...data,
          columns,
          boards: {
            ...data.boards,
            [board.id]: {
              ...board,
              columnIds: insertSorted(board.columnIds, column.id, (id) => columns[id]),
            },
          },
        },
        outcome: 'applied',
      };
    }

    case 'column/rename': {
      const column = data.columns[op.columnId];
      if (!column) return { data, outcome: 'missing' };
      if (!isNewer(at, column.edited)) return { data, outcome: 'stale' };
      return {
        data: { ...data, columns: { ...data.columns, [column.id]: { ...column, name: op.name, edited: at } } },
        outcome: 'applied',
      };
    }

    case 'column/delete': {
      const column = data.columns[op.columnId];
      if (!column) return { data, outcome: 'missing' };
      const board = data.boards[column.boardId];
      return {
        data: {
          ...data,
          ...dropCards(data, column.cardIds),
          columns: omit(data.columns, [column.id]),
          boards: board
            ? {
                ...data.boards,
                [board.id]: { ...board, columnIds: board.columnIds.filter((id) => id !== column.id) },
              }
            : data.boards,
        },
        outcome: 'applied',
      };
    }

    case 'card/create': {
      if (!data.columns[op.card.columnId]) return { data, outcome: 'missing' };
      const existing = data.cards[op.card.id];
      if (existing && !isNewer(at, existing.edited)) return { data, outcome: 'stale' };
      let columns = data.columns;
      if (existing && existing.columnId !== op.card.columnId) {
        columns = removeCardFromColumn(columns, existing.columnId, existing.id);
      }
      const card: Card = { ...op.card, edited: at, placed: at };
      let next: DomainData = { ...data, columns, cards: { ...data.cards, [card.id]: card } };
      next = { ...next, columns: resortColumn(next, card.columnId, card.id) };
      // Restoring a deleted card (undo) brings its whole comment thread back.
      if (op.comments?.length) {
        const comments = { ...next.comments };
        for (const comment of op.comments) comments[comment.id] = { ...comment, cardId: card.id };
        const ids = op.comments
          .slice()
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((c) => c.id);
        next = { ...next, comments, commentsByCard: { ...next.commentsByCard, [card.id]: ids } };
      }
      return { data: next, outcome: 'applied' };
    }

    case 'card/update': {
      const card = data.cards[op.cardId];
      if (!card) return { data, outcome: 'missing' };
      if (!isNewer(at, card.edited)) return { data, outcome: 'stale' };
      return {
        data: { ...data, cards: { ...data.cards, [card.id]: { ...card, ...op.changes, edited: at } } },
        outcome: 'applied',
      };
    }

    case 'card/move': {
      const card = data.cards[op.cardId];
      if (!card || !data.columns[op.toColumnId]) return { data, outcome: 'missing' };
      if (!isNewer(at, card.placed)) return { data, outcome: 'stale' };
      const moved: Card = { ...card, columnId: op.toColumnId, position: op.position, placed: at };
      let next: DomainData = {
        ...data,
        cards: { ...data.cards, [card.id]: moved },
        columns: removeCardFromColumn(data.columns, card.columnId, card.id),
      };
      next = { ...next, columns: resortColumn(next, op.toColumnId, card.id) };
      return { data: next, outcome: 'applied' };
    }

    case 'card/delete': {
      const card = data.cards[op.cardId];
      if (!card) return { data, outcome: 'missing' };
      return {
        data: {
          ...data,
          ...dropCards(data, [card.id]),
          columns: removeCardFromColumn(data.columns, card.columnId, card.id),
        },
        outcome: 'applied',
      };
    }

    case 'comment/add': {
      const { comment } = op;
      if (!data.cards[comment.cardId]) return { data, outcome: 'missing' };
      if (comment.parentId && !data.comments[comment.parentId]) return { data, outcome: 'missing' };
      if (data.comments[comment.id]) return { data, outcome: 'stale' };
      const full: Comment = { ...comment, deleted: false, editedByUser: false, edited: at };
      return {
        data: {
          ...data,
          comments: { ...data.comments, [full.id]: full },
          commentsByCard: {
            ...data.commentsByCard,
            [full.cardId]: [...(data.commentsByCard[full.cardId] ?? []), full.id],
          },
        },
        outcome: 'applied',
      };
    }

    case 'comment/edit': {
      const comment = data.comments[op.commentId];
      if (!comment || comment.deleted) return { data, outcome: 'missing' };
      if (!isNewer(at, comment.edited)) return { data, outcome: 'stale' };
      return {
        data: {
          ...data,
          comments: {
            ...data.comments,
            [comment.id]: { ...comment, body: op.body, edited: at, editedByUser: true },
          },
        },
        outcome: 'applied',
      };
    }

    case 'comment/delete': {
      const comment = data.comments[op.commentId];
      if (!comment || comment.deleted) return { data, outcome: 'missing' };
      return { data: deleteComment(data, comment.id, at), outcome: 'applied' };
    }
  }
}

// Undo support. Given the state *before* an op runs, produce the op that
// reverses it. Only card create / delete / move are undoable: they're the
// structural changes that are hard to redo by hand. (Failed syncs don't use
// this; they rebase from confirmed state, see domainStore.ts.)
export function invertOp(data: DomainData, op: Op): Op | null {
  switch (op.type) {
    case 'card/create':
      return { type: 'card/delete', cardId: op.card.id };
    case 'card/delete': {
      const card = data.cards[op.cardId];
      if (!card) return null;
      const { edited, placed, ...rest } = card;
      const comments = (data.commentsByCard[card.id] ?? [])
        .map((id) => data.comments[id])
        .filter((c): c is Comment => Boolean(c));
      return { type: 'card/create', card: rest, comments };
    }
    case 'card/move': {
      const card = data.cards[op.cardId];
      if (!card) return null;
      return { type: 'card/move', cardId: card.id, toColumnId: card.columnId, position: card.position };
    }
    default:
      return null;
  }
}

// Rebuilds every DERIVED field (board.columnIds, column.cardIds,
// commentsByCard) from the entities themselves. Used after loading from
// storage or merging a peer's snapshot, where incremental upkeep isn't
// possible. Also drops orphans whose parent no longer exists.
export function rebuildIndexes(input: DomainData): DomainData {
  const boards: Record<string, Board> = {};
  for (const board of Object.values(input.boards)) boards[board.id] = { ...board, columnIds: [] };

  const columns: Record<string, Column> = {};
  for (const column of Object.values(input.columns)) {
    if (boards[column.boardId]) columns[column.id] = { ...column, cardIds: [] };
  }
  for (const column of Object.values(columns).sort(comparePositioned)) {
    boards[column.boardId].columnIds.push(column.id);
  }

  const cards: Record<string, Card> = {};
  for (const card of Object.values(input.cards)) if (columns[card.columnId]) cards[card.id] = card;
  for (const card of Object.values(cards).sort(comparePositioned)) {
    columns[card.columnId].cardIds.push(card.id);
  }

  const comments: Record<string, Comment> = {};
  const commentsByCard: Record<string, string[]> = {};
  const sortedComments = Object.values(input.comments).sort((a, b) => a.createdAt - b.createdAt);
  for (const comment of sortedComments) {
    if (!cards[comment.cardId]) continue;
    comments[comment.id] = comment;
    (commentsByCard[comment.cardId] ??= []).push(comment.id);
  }

  return { boards, columns, cards, comments, commentsByCard };
}

function mergeRecord<T extends { edited: Stamp }>(
  a: Record<string, T>,
  b: Record<string, T>,
  pick: (x: T, y: T) => T = (x, y) => (isNewer(y.edited, x.edited) ? y : x)
): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [id, item] of Object.entries(b)) out[id] = out[id] ? pick(out[id], item) : item;
  return out;
}

// Union of two snapshots, entity by entity, LWW per register. Snapshots carry
// no tombstones, so this can't express "deleted" — which is why a joining tab
// only merges *peer* snapshots together and doesn't union them with its own
// possibly-stale localStorage copy (see lib/sync.ts).
export function mergeData(a: DomainData, b: DomainData): DomainData {
  return rebuildIndexes({
    boards: mergeRecord(a.boards, b.boards),
    columns: mergeRecord(a.columns, b.columns),
    cards: mergeRecord(a.cards, b.cards, (x, y) => {
      const content = isNewer(y.edited, x.edited) ? y : x;
      const placement = isNewer(y.placed, x.placed) ? y : x;
      return {
        ...content,
        columnId: placement.columnId,
        position: placement.position,
        placed: placement.placed,
      };
    }),
    comments: mergeRecord(a.comments, b.comments),
    commentsByCard: {},
  });
}
