// Core domain types. Keeping these separate from component code is what
// lets the store, the UI, and the README's "state architecture" section
// all point at the same single source of truth.

// A Stamp is the "when, and by whom" of a write. It's what last-write-wins
// conflict resolution compares: newer `ts` wins, and `tab` breaks exact ties
// so every tab picks the same winner. `ts` comes from a hybrid logical clock
// (see lib/clock.ts), not raw Date.now(), so it never runs backwards.
export interface Stamp {
  ts: number;
  tab: string;
}

export interface Board {
  id: string;
  title: string;
  description: string;
  createdAt: string; // ISO date string
  columnIds: string[]; // DERIVED: this board's column ids, sorted by column.position
  edited: Stamp;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: number; // sort key within the board
  cardIds: string[]; // DERIVED: this column's card ids, sorted by card.position
  edited: Stamp;
}

export interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string; // raw markdown, parsed at render time
  tags: string[];
  dueDate: string | null; // ISO date string, or null if unset
  position: number; // fractional sort key within its column
  // Two independent LWW registers: editing a card's text in one tab and
  // dragging it in another are not a conflict, so they don't share a stamp.
  edited: Stamp; // title / description / tags / dueDate
  placed: Stamp; // columnId / position
}

export interface Comment {
  id: string;
  cardId: string;
  parentId: string | null; // null = top-level comment on the card
  author: string;
  body: string;
  createdAt: number;
  deleted: boolean; // tombstone: kept (with empty body) while it still has replies
  edited: Stamp;
  editedByUser: boolean; // true once the body has been changed after posting
}

export type CardContent = Pick<Card, 'title' | 'description' | 'tags' | 'dueDate'>;
