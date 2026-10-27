# Architecture Evolution: Stage 1 → Stage 2

Stage 1 was a single-tab board: normalized Zustand state, ordered id arrays,
and actions that mutated state directly. Stage 2 adds drag and drop, real-time
sync across tabs, threaded comments, undo/redo, and a 240-card performance
target. This doc covers what that broke, what changed, what's still rough,
and where it goes next.

---

## 1. What broke when adding real-time

**Index-based ordering stopped converging.** In Stage 1, `column.cardIds` was
the source of truth for order, and a move meant splicing an array. Across two
tabs that falls apart. Tab A sends "insert at index 2" and tab B sends "insert
at index 0". Each tab applies its own op first and the other's second, so they
splice different arrays and end up with different orders. Nothing errors; the
tabs just quietly disagree. **Fix:** every card and column has a fractional
`position`. A move writes only the moved card's position, and `cardIds` became
a sorted cache derived from those positions (ties broken by id). Applying the
same ops in any order now gives the same order.

**Actions weren't serializable.** Stage 1 actions were closures (`set(state =>
…)`), and you can't post a closure to another tab. **Fix:** every mutation is
now a plain `Op` object handled by one pure reducer (`lib/ops.ts`). That one
change also made undo (store the op and its inverse) and testing (call the
reducer directly, no React) easy.

**"Which write wins?" had no answer.** Two tabs editing one card's title would
each keep their own version. **Fix:** last-write-wins with stamps (see §2).

**One stamp per card caused false conflicts.** The first version used a single
stamp per card, so renaming a card in tab A and dragging it in tab B counted as
a conflict, and one change was thrown away. **Fix:** two independent LWW
registers per card: `edited` (title/description/tags/due date) and `placed`
(column/position).

**The joining tab could bring deleted cards back.** A new tab loads
localStorage, which can be up to 300 ms out of date, and then merges snapshots
from peers. Snapshots carry no tombstones, so merging stale storage with fresh
peers kept cards a peer had just deleted. **Fix:** when any peer answers, its
snapshot replaces local storage instead of being merged with it.
localStorage is used only when the tab is alone. Ops that arrive during the
handshake are queued and replayed after the snapshot, so they aren't lost.

**Optimistic rollback put tabs out of sync.** This was found while testing
Stage 2 in two real tabs. The first version undid a failed send by applying
that op's inverse to the current state. Then: move 1 is sent, move 2 is sent,
move 2 succeeds, move 1 fails. The inverse of move 1 put the card back where it
was before move 1, which also undid move 2, and other tabs had already applied
move 2. **Fix: optimistic rebase.** The store keeps `confirmed` state (remote
ops plus acknowledged local ops) and a `pending` queue. What renders is always
`confirmed + pending replayed`. When a send fails, the op leaves the queue and
the view is rebuilt. The regression test in `store/history.test.ts` settles
sends by hand in exactly this order. In the browser, two rounds of 25–30 rapid
moves across 3 columns with ~35% simulated failures left both tabs identical.

**Remote changes and open UI.** A card can be deleted in another tab while its
edit modal is open here. The modal used to fall into "create" mode. It now
shows "This card is gone". Undoing a move of a card another tab deleted shows a
toast and drops that history entry instead of failing silently.

**`Sidebar` never highlighted the active board** (fixed in passing). It called
`useParams()` outside `<Routes>`, so `boardId` was always undefined. It now
renders inside a route.

---

## 2. Conflict resolution rule

Implemented in `applyOp` (`lib/ops.ts`) and the same everywhere: local ops,
remote ops, undo, redo, and snapshot merges.

1. **Last write wins, per register, by timestamp.** A write applies only if its
   `Stamp` is newer than the register's current stamp. A `Stamp` is
   `{ ts, tab }`.
2. **Exact ties break by tab id** (higher string wins), so every tab picks the
   same winner.
3. **Timestamps come from a hybrid logical clock** (`lib/clock.ts`):
   `ts = max(Date.now(), last + 1)`, and `last` advances past every remote
   stamp we see. So a write made after seeing a remote write always beats it,
   even if this machine's clock runs slow.
4. **Deletes win.** An update or move targeting a deleted card (or a reply to a
   deleted thread) is dropped. There are no tombstones for cards, so
   delete-then-edit converges to "deleted".
5. **Creates are idempotent.** Re-creating an existing id only overwrites it
   if the stamp is newer.

When a remote op loses (`stale`), the tab holding the newer write shows a toast
saying another tab edited it at the same time and the most recent change was
kept. The other tab converges silently when the newer op reaches it.
`lib/ops.test.ts` checks convergence for both arrival orders of concurrent
edits, concurrent moves, edit vs. move, and delete vs. edit.

---

## 3. What changed in the state structure

```diff
 Board   { id, title, description, createdAt, columnIds
+          edited: Stamp }                       // columnIds is now DERIVED (sorted by column.position)
 Column  { id, boardId, name, cardIds
+          position, edited: Stamp }             // cardIds is now DERIVED (sorted by card.position)
 Card    { id, columnId, title, description, tags, dueDate
+          position, edited: Stamp, placed: Stamp }
+Comment { id, cardId, parentId, author, body, createdAt, deleted, edited, editedByUser }
+commentsByCard: { [cardId]: commentId[] }      // DERIVED index for O(1) counts
+history: { past: Command[], future: Command[] } // per tab, never synced or persisted
```

- **Still normalized, still two stores.** `domainStore` holds content;
  `uiStore` holds screen state (modals, toasts, theme, search, drag, sync
  status). Neither imports the other. Domain → UI notifications (rollback,
  conflict, undo) go through a small event emitter (`lib/events.ts`).
- **Derived fields are explicit.** `columnIds`, `cardIds` and `commentsByCard`
  are kept up to date incrementally by the reducer, and rebuilt from scratch by
  `rebuildIndexes` after loading or merging. Persistence stores only entities.
- **Comments are flat with `parentId`.** The tree is built at render time
  (`buildCommentTree`). Up to 3 levels of replies. Deleting a comment that has
  replies leaves a tombstone ("This comment was deleted"); deleting the last
  reply under a tombstone removes the tombstone too.
- **Undo is a command log, not snapshots.** Each entry is
  `{ label, forward: Op, inverse: Op }`, a few hundred bytes. Undo and redo
  dispatch through the normal pipeline, so they sync to other tabs. Covered:
  card create, delete (restores the card's whole comment thread) and move.
  Capped at 100 entries.
- **Search moved into `uiStore`.** The drag controller has to compute drop
  slots against the same filtered list the columns render.
- **The store is a factory** (`createDomainStore`). The app uses one instance;
  tests create isolated ones with a fake transport.

---

## 4. Performance: what was profiled and changed

**Re-render bugs found by reading the Stage 1 code:**

- `BoardView` subscribed to the whole `columns` and `cards` records and passed
  `cardsRecord` to every `Column`. Editing any card re-rendered every column,
  so `React.memo` on `Column` never helped.
- `CardItem` received `orderedColumns` (a new array whenever any column's
  `cardIds` changed). Moving one card re-rendered every card on the board.

**Fixes:**

- `BoardView` subscribes to the board only. `Column` gets a `columnId` and
  selects its own visible card ids with `useShallow`, so a description edit
  doesn't change that list and the column doesn't re-render. `CardItem` gets
  only primitive props and selects its own card by id.
- **Expected effect:** editing a card re-renders 1 `CardItem`; a move
  re-renders the 1–2 affected columns and the moved card.
- **Virtualization** (`hooks/useVirtualList.ts`) applies past 30 cards in a
  column. Heights are variable: each card is measured once by a shared
  `ResizeObserver`, cached by id, and positioned using prefix sums plus a
  binary search. In the 240-card demo, the 85-card "Inbox" column mounts about
  6 cards, and the board mounts 139 of 241.
- **`content-visibility: auto`** on columns lets the browser skip layout and
  paint for off-screen columns on a 22-column board.
- **Drag does no React work per pointer move.** The ghost is a cloned DOM node
  moved with a transform inside `requestAnimationFrame`. The store is written
  only when the hovered drop slot changes.
- **The demo seed is one `batch` op:** one state update and one broadcast
  instead of 263.

**Measured timings** (dev build in a background browser pane, from dispatch
until the next macrotask, median of 10, 240-card board): keyboard move in the
virtualized column ≈ 42 ms, cross-column move ≈ 25 ms, search keystroke across
all 22 columns ≈ 38 ms. Dev mode with StrictMode double-renders, and a
background pane is throttled, so treat these as upper bounds. A production
build in a foreground tab will be faster.

**What I did not do:** run the React DevTools Profiler extension. It isn't
available in the environment this was built in, so the per-component render
counts above come from code analysis, not a captured flamegraph. To confirm
them:

1. `npm run dev`, then click "Load demo board".
2. Open React DevTools → Profiler → ⚙ → enable "Record why each component
   rendered".
3. Record while you (a) edit one card's title, (b) drag a card between
   columns, (c) type in search.
4. Expected: (a) one `CardItem`, plus the modal; (b) two `Column`/`CardList`s
   plus the moved card; (c) every `Column`, but `CardItem`s only where the
   result changed.

Record the actual numbers in this doc once you've done this.

---

## 5. Technical debt

- **Board and column deletes aren't undoable.** Their inverse would need to
  recreate a cascade of columns, cards and comments. The confirmation dialog
  says so. Card edits and comment changes aren't undoable either (out of scope).
- **No tombstones for cards, columns or boards.** "Delete wins" works for live
  tabs, but snapshot merging can't express deletes, which is why the join
  handshake prefers peers over localStorage. A tab that was offline and merges
  later could bring things back.
- **Fractional positions are floats.** About 50 bisections in one gap exhausts
  double precision. Ties still sort deterministically by id, but you can't
  insert between them. It needs a periodic rebalance, or string keys
  (LexoRank or fractional-indexing).
- **Undo is "local intent with a fresh stamp."** Undoing a move after another
  tab moved the same card wins by LWW and overrides that tab's move. That's
  defensible, but it's a product decision nobody has made.
- **Edit forms are snapshots.** The card modal copies the card into local state
  when it opens. A remote edit made while it's open is overwritten on save
  (LWW, since our save is newer), with no "this changed underneath you" warning.
- **Identity is a per-tab pseudonym.** "Edit/delete only your own comments" is
  enforced in the UI only.
- **`useVirtualList` is home-grown.** It handles this app's cases (variable
  heights, scroll-to-index, drop indicator) but has no keyed scroll anchoring:
  a card above the viewport growing taller can shift visible content.
- **The pointer drag controller is module-level singleton state.** That's fine
  for one board, but it would need scoping for nested drag surfaces.
- **The "Undo" button in the delete toast undoes the latest command,** not
  necessarily that delete, if something else happened in between.

---

## 6. With 3 more weeks

1. **Week 1: a real server and an op log.** Replace `BroadcastChannel` with a
   WebSocket `Transport` (the interface already isolates it). The server
   assigns a global sequence number to each op. Clients keep the
   `confirmed + pending` rebase model, now driven by server acks, and resync
   by sequence number after reconnecting instead of whole-board snapshots. Add
   tombstones with garbage collection.
2. **Week 2: correctness hardening.** String fractional indices with
   rebalancing. Property-based tests (fast-check) that generate random op
   sequences per tab and assert convergence. Field-level LWW for card content,
   so concurrent title and description edits both survive. A "card changed
   while you were editing" merge prompt.
3. **Week 3: product depth and performance.** Undo for column/board deletes
   via a `batch` inverse. Undo for edits and comments. Column drag-reorder (the
   position model already supports it). Measure the virtualizer against
   `@tanstack/virtual` and adopt it if it wins. Playwright tests for real
   pointer drag and two-tab sync, which jsdom can't do.

---

## 7. Scaling to 10,000 users

The current design is local-first and peer-to-peer within one browser. At
10,000 users, three things change.

**Transport and authority.** BroadcastChannel only reaches tabs in the same
browser profile. Instead:

- Stateless WebSocket gateways behind a load balancer.
- Clients subscribe per board.
- Each board is owned by one shard of an ordering service (for example,
  partition by `boardId` across Redis Streams or Kafka partitions), which
  sequences ops and fans them out.
- Postgres stores entities plus an append-only op log for catch-up.
- The LWW reducer stays the merge function. It runs on both client and server,
  so the server can validate ops and reject stale or unauthorized writes.

**Load shape.** 10,000 users are not 10,000 people on one board. Typical
collaboration is 2–20 people per board, so fan-out per op is small and load
scales with the number of active boards. Plan for:

- Presence heartbeats are the noisiest traffic. Send them at a lower rate,
  sample them, and keep them in memory, never persisted.
- Coalesce high-frequency ops (drag previews are local-only today and should
  stay that way). Debounce text edits into one op per pause.
- Load boards lazily, with a paginated first payload: columns first, then cards
  per column as they scroll into view. The virtualizer already assumes not
  every card is mounted.

**Data and access.**

- Real auth, per-board ACLs checked on the server for every op, and
  server-side validation of `author` on comments.
- Rate limits per connection.
- Snapshot compaction of the op log (for example, every N ops per board) so
  reconnect catch-up stays cheap.
- Full-text search moves server-side once boards stop fitting in one client.

**Client.** The client architecture mostly holds:

- Normalized entities, ops as the only way to mutate state, `confirmed +
  pending` rebase, id-based selectors, and virtualization are all what a
  multi-user client needs anyway.
- The main client change is keeping only open boards in memory instead of the
  whole workspace.
