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

## Scripts

```bash
npm run dev      # Vite dev server
npm test         # Vitest: unit + integration tests (jsdom)
npm run build    # tsc (strict) + production build
```

Open the app in two tabs to see real-time sync: moves, new cards, and comments
appear in the other tab live. "Load demo board" creates 240 cards across 22
columns for performance testing. "Simulate flaky sync" in the sidebar makes
~35% of outgoing ops fail so you can watch optimistic updates roll back.

## Stage 2 features

- **Drag and drop** — hand-rolled pointer events (mouse, pen, touch), within and
  across columns, with edge auto-scroll and a drop indicator. Keyboard
  equivalent: focus a card's ⠿ grip and use the arrow keys.
- **Real-time across tabs** — `BroadcastChannel`, optimistic local apply with
  rollback on (simulated) failure, last-write-wins conflict resolution.
- **Threaded comments** — normalized, up to 3 levels of replies, edit/delete,
  tombstones for deleted comments that still have replies.
- **Undo/redo** — command-pattern log of ops + inverses (not snapshots) for card
  create, delete and move. `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, toolbar, toast action.
- **Performance** — per-column list virtualization (variable heights), id-based
  selectors so a card edit re-renders one card, `content-visibility` on columns.
- **UX** — skeletons, error boundary, toasts, empty states, dark mode via CSS
  variable tokens; reusable `Button`, `Input`, `Modal`, `Badge`.

See **[ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md)** for what broke,
what changed in the state shape, the conflict rule, debt, and scaling notes.

## Folder structure

```
src/
  types.ts                  # Board, Column, Card, Comment, Stamp
  lib/                      # Pure logic, no React — this is what the unit tests cover
    ops.ts                  # Op union + applyOp reducer + invertOp + snapshot merge (LWW lives here)
    clock.ts                # Tab id + hybrid logical clock for LWW stamps
    ordering.ts             # Fractional positions (positionBetween, insertSorted)
    history.ts              # Command-pattern undo/redo stack
    comments.ts             # Comment tree building, depth rules
    dnd.ts                  # Drop-index / move-planning math, auto-scroll, search filter
    virtual.ts              # Variable-height virtualization math
    sync.ts                 # BroadcastChannel transport with simulated latency/failure
    realtime.ts             # App wiring: handshake, presence, persistence, toasts
    seed.ts                 # 240-card demo board as one batch op
  store/
    domainStore.ts          # Entities + op pipeline + per-tab history slice
    uiStore.ts              # Modals, toasts, theme, drag/drop target, search, sync status
  dnd/dragController.ts     # Pointer tracking, ghost, hit-testing (DOM side of DnD)
  hooks/useVirtualList.ts   # Measures cards, returns the visible window
  components/
    ui/                     # Button, Input, Modal, Badge, Skeleton, EmptyState
    comments/               # CommentThread, CommentItem, CommentForm
    Column.tsx, CardList.tsx, CardItem.tsx, ErrorBoundary.tsx, ToastRegion.tsx, ...
  pages/                    # Dashboard, BoardView (lazy)
  test/                     # setup + integration test
```

## State architecture

Still two Zustand stores, split the same way as Stage 1:

**`domainStore`** — the real content, normalized by id:

```
boards:         { [id]: { id, title, description, createdAt, columnIds*, edited } }
columns:        { [id]: { id, boardId, name, position, cardIds*, edited } }
cards:          { [id]: { id, columnId, title, description, tags, dueDate, position, edited, placed } }
comments:       { [id]: { id, cardId, parentId, author, body, createdAt, deleted, edited, editedByUser } }
commentsByCard: { [cardId]: [commentId, ...] }*
history:        { past: Command[], future: Command[] }   // per tab, never synced or saved
                                                   * = derived index, rebuilt from entities
```

Every change is a serializable **op** run through one pure reducer
(`lib/ops.ts`). Local actions, remote ops from other tabs, undo and redo all take
that same path. Components still call the Stage 1 action names (`addCard`,
`moveCard`, `deleteCard`, …).

**`uiStore`** — only what's on screen: the active modal, toasts, theme, search
query, the card being dragged and its hovered drop slot, and sync status. Never
broadcast, never part of undo.

## Accessibility

- Semantic structure throughout (`section`/`article`/`nav`/`aside`, lists for
  cards and comment threads, nested lists for replies).
- Every icon-only button has an `aria-label`; badges that are just icon + number
  carry a full label ("2 comments").
- Drag and drop has a full keyboard path (grip + arrow keys); moves are
  announced in a polite live region and focus follows the moved card, even into
  a virtualized column.
- Modals: focus moves in on open, Tab is trapped, Escape closes, focus returns
  on close. Escape inside a comment editor cancels the edit, not the modal.
- Toasts: errors in an assertive region, everything else polite.
- Theme toggle is a `role="switch"`; reduced-motion disables transitions and
  the skeleton shimmer.

screenshots
![Weave screenshot 1](images/Weave-1.png)
![Weave screenshot 2](images/Weave-2.png)
![Weave screenshot 3](images/Weave-3.png)
