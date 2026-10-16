# Weave — Collaborative Knowledge Board

A workspace tool for managing boards, columns, and cards. Built with React, Vite, and TypeScript.

## Stack

- React 18 + Vite + TypeScript
- Zustand for state management
- React Router for the Dashboard / Board View split
- CSS (no UI library, no Tailwind) — a single global stylesheet using CSS custom properties for theming
- `markdown-to-jsx` for parsing card descriptions

## Getting started

```bash
npm install
npm run dev
```

link, in order:

GitHub repo — https://github.com/bukola2005/weave
Live deployment — weave-virid-three.vercel.app
README link — https://github.com/bukola2005/weave/blob/main/README.md

## Folder structure

```
src/
  types.ts                 # Shared domain types: Board, Column, Card
  store/
    domainStore.ts         # The real data: boards, columns, cards + all mutations
    uiStore.ts              # Transient screen state: which modal is open, and for what
  components/
    Sidebar.tsx              # Persistent board switcher, shown on every route
    BoardTile.tsx             # One board card on the Dashboard
    Column.tsx                # One column on the Board View (memoized)
    CardItem.tsx              # One card inside a column (memoized)
    Modal.tsx                 # Generic modal shell: focus trap, Escape, focus return
    BoardFormModal.tsx        # Create-board form
    ColumnFormModal.tsx       # Create/rename-column form
    CardFormModal.tsx         # Create/edit-card form
    ConfirmDeleteModal.tsx    # Shared delete confirmation for boards/columns/cards
    ModalRoot.tsx             # Reads uiStore and renders whichever modal is active
  pages/
    Dashboard.tsx            # Workspace Dashboard: list/create/delete boards
    BoardView.tsx             # Board View: columns + cards (lazy-loaded)
  styles/
    global.css                # All styling, theme variables at the top
```

Pages own layout and data-fetching from the store; components are presentational
and receive what they need as props (plus direct store access only for actions
like delete/move, to avoid prop-drilling callbacks through several layers).

## State architecture

Two separate Zustand stores, not one:

**`domainStore`** — the real content. Normalized by id instead of nested arrays:

```
boards:  { [boardId]:  { id, title, description, createdAt, columnIds: [id, id, ...] } }
columns: { [columnId]: { id, boardId, name, cardIds: [id, id, ...] } }
cards:   { [cardId]:   { id, columnId, title, description, tags, dueDate } }
```

Each level only stores *ids* of the level below it, ordered in an array. Moving a
card between columns touches exactly three things: the card's own `columnId`,
the source column's `cardIds`, and the destination column's `cardIds` — all three
updated in one `set()` call, so the store is never briefly inconsistent.

Why normalized instead of nested (`board.columns[].cards[]`): updating one card
would otherwise mean rebuilding the entire board tree. With normalization,
updating a card only touches `cards[cardId]` — every component reading boards or
columns skips re-rendering entirely.

**`uiStore`** — purely what's on screen: which modal is open (`activeModal`) and
what it needs (a board id, a column id, a card id to edit). None of this is data
that gets saved; it only describes the current screen. Keeping it separate from
`domainStore` means the data layer has no idea the UI exists, and a reviewer can
tell at a glance which state is "real" and which is just screen bookkeeping.

**Scaling to Stage 2 (real-time):** because state is normalized by id, applying
an incoming real-time update (e.g. "card X moved to column Y") is a single
targeted `set()` patch to `cards[X]` and the two affected `columns[...].cardIds`
— no need to diff or rebuild a nested tree.

## Performance strategy

- `Column` and `CardItem` are wrapped in `React.memo` — a card re-renders only
  when its own props change, not when a sibling card or column changes.
- Zustand selectors (`useDomainStore(s => s.boards)`) subscribe components to
  only the slice of state they read, so an edit to one card doesn't re-render
  the whole board.
- `BoardView` is lazy-loaded (`React.lazy` + `Suspense`) — its bundle (columns,
  cards, modals, markdown parsing) only loads once a board is actually opened,
  keeping the Dashboard's initial load light.
- `useMemo` is used for derived lists (ordered columns, filtered/searched cards)
  so they're only recalculated when their actual inputs change, not on every
  render.

## Accessibility

- Semantic structure: `<section>`/`<article>`/`<nav>`/`<aside>` throughout,
  headings in order, lists for card/column collections.
- Every icon-only button has an `aria-label` (delete, move left/right, rename).
- Modals: focus moves to the first field on open, Tab/Shift+Tab is trapped
  inside the dialog, Escape closes it, and focus returns to the element that
  opened it on close — all handled once in `Modal.tsx` and reused by every
  modal in the app.
- Visible focus outlines (`:focus-visible`) on every interactive element —
  never relying on color or hover alone.

## Key engineering decisions

- **No UI library / no Tailwind**: one hand-written stylesheet using CSS custom
  properties (`--accent`, `--paper`, etc.) for the whole theme, so the
  color/spacing system is explicit and easy to defend in review.
- **Modals centralized through `uiStore` + `ModalRoot`**: pages never render a
  modal directly, they just call `openModal({...})`. This keeps modal state in
  one place instead of scattered `useState` flags across components.
- **Delete is destructive and cascades**: deleting a board removes its columns
  and cards; deleting a column removes its cards. This is modeled explicitly in
  `domainStore` rather than left as a dangling reference.

## What I'd do with more time

- Drag-and-drop for reordering columns and cards (explicitly out of scope for
  Stage 1)
- Undo for deletes
- Persisting state to `localStorage` or a backend (currently in-memory only —
  refreshing the page resets the board)
