import { create } from 'zustand';
import type { Board, Column, Card } from '../types';

// DOMAIN state: the real content of the app (boards, columns, cards).
// Normalized by id (Record<id, item>) instead of nested arrays, so updating
// one card never requires rebuilding a deeply nested tree. Ordering within
// a board/column is kept explicit via columnIds / cardIds arrays of ids.
interface DomainState {
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  cards: Record<string, Card>;

  addBoard: (title: string, description: string) => string;
  deleteBoard: (id: string) => void;

  addColumn: (boardId: string, name: string) => void;
  renameColumn: (columnId: string, name: string) => void;
  deleteColumn: (columnId: string) => void;

  addCard: (columnId: string, title: string) => string;
  updateCard: (
    cardId: string,
    updates: Partial<Pick<Card, 'title' | 'description' | 'tags' | 'dueDate'>>
  ) => void;
  deleteCard: (cardId: string) => void;
  moveCard: (cardId: string, fromColumnId: string, toColumnId: string) => void;
}

export const useDomainStore = create<DomainState>((set) => ({
  boards: {},
  columns: {},
  cards: {},

  addBoard: (title, description) => {
    const id = crypto.randomUUID();
    set((state) => ({
      boards: {
        ...state.boards,
        [id]: {
          id,
          title,
          description,
          createdAt: new Date().toISOString(),
          columnIds: [],
        },
      },
    }));
    return id;
  },

  deleteBoard: (id) =>
    set((state) => {
      const board = state.boards[id];
      if (!board) return state;
      const boards = { ...state.boards };
      delete boards[id];
      const columns = { ...state.columns };
      const cards = { ...state.cards };
      board.columnIds.forEach((columnId) => {
        columns[columnId]?.cardIds.forEach((cardId) => delete cards[cardId]);
        delete columns[columnId];
      });
      return { boards, columns, cards };
    }),

  addColumn: (boardId, name) =>
    set((state) => {
      const board = state.boards[boardId];
      if (!board) return state;
      const id = crypto.randomUUID();
      const newColumn: Column = { id, boardId, name, cardIds: [] };
      return {
        columns: { ...state.columns, [id]: newColumn },
        boards: {
          ...state.boards,
          [boardId]: { ...board, columnIds: [...board.columnIds, id] },
        },
      };
    }),

  renameColumn: (columnId, name) =>
    set((state) => {
      const column = state.columns[columnId];
      if (!column) return state;
      return { columns: { ...state.columns, [columnId]: { ...column, name } } };
    }),

  deleteColumn: (columnId) =>
    set((state) => {
      const column = state.columns[columnId];
      if (!column) return state;
      const columns = { ...state.columns };
      delete columns[columnId];
      const cards = { ...state.cards };
      column.cardIds.forEach((cardId) => delete cards[cardId]);
      const board = state.boards[column.boardId];
      return {
        columns,
        cards,
        boards: {
          ...state.boards,
          [column.boardId]: {
            ...board,
            columnIds: board.columnIds.filter((id) => id !== columnId),
          },
        },
      };
    }),

  addCard: (columnId, title) => {
    const id = crypto.randomUUID();
    set((state) => {
      const column = state.columns[columnId];
      if (!column) return state;
      const newCard: Card = { id, columnId, title, description: '', tags: [], dueDate: null };
      return {
        cards: { ...state.cards, [id]: newCard },
        columns: {
          ...state.columns,
          [columnId]: { ...column, cardIds: [...column.cardIds, id] },
        },
      };
    });
    return id;
  },

  updateCard: (cardId, updates) =>
    set((state) => {
      const card = state.cards[cardId];
      if (!card) return state;
      return { cards: { ...state.cards, [cardId]: { ...card, ...updates } } };
    }),

  deleteCard: (cardId) =>
    set((state) => {
      const card = state.cards[cardId];
      if (!card) return state;
      const cards = { ...state.cards };
      delete cards[cardId];
      const column = state.columns[card.columnId];
      return {
        cards,
        columns: {
          ...state.columns,
          [card.columnId]: {
            ...column,
            cardIds: column.cardIds.filter((id) => id !== cardId),
          },
        },
      };
    }),

  moveCard: (cardId, fromColumnId, toColumnId) =>
    set((state) => {
      const card = state.cards[cardId];
      const fromColumn = state.columns[fromColumnId];
      const toColumn = state.columns[toColumnId];
      if (!card || !fromColumn || !toColumn) return state;
      return {
        cards: { ...state.cards, [cardId]: { ...card, columnId: toColumnId } },
        columns: {
          ...state.columns,
          [fromColumnId]: {
            ...fromColumn,
            cardIds: fromColumn.cardIds.filter((id) => id !== cardId),
          },
          [toColumnId]: { ...toColumn, cardIds: [...toColumn.cardIds, cardId] },
        },
      };
    }),
}));
