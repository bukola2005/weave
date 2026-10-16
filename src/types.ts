// Core domain types. Keeping these separate from component code is what
// lets the store, the UI, and the README's "state architecture" section
// all point at the same single source of truth.

export interface Board {
  id: string;
  title: string;
  description: string;
  createdAt: string; // ISO date string
  columnIds: string[]; // ordered list of this board's column ids
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  cardIds: string[]; // ordered list of this column's card ids
}

export interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string; // raw markdown, parsed at render time
  tags: string[];
  dueDate: string | null; // ISO date string, or null if unset
}
