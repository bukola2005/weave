import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDomainStore } from './domainStore';
import { emptyHistory, HISTORY_LIMIT, record, takeRedo, takeUndo } from '../lib/history';
import type { DomainEvent } from '../lib/events';

function setup() {
  const { store, events } = createDomainStore();
  const seen: DomainEvent[] = [];
  events.subscribe((e) => seen.push(e));
  const s = store.getState;
  const boardId = s().addBoard('Board', 'desc');
  const todo = s().addColumn(boardId, 'To do');
  const done = s().addColumn(boardId, 'Done');
  return { store, s, seen, todo, done };
}

const titles = (s: ReturnType<typeof setup>['s'], columnId: string) =>
  s().columns[columnId].cardIds.map((id) => s().cards[id].title);

describe('history stack (pure)', () => {
  const cmd = (id: string) => ({
    id,
    label: id,
    forward: { type: 'card/delete' as const, cardId: id },
    inverse: { type: 'card/delete' as const, cardId: id },
  });

  it('records, undoes and redoes in LIFO order', () => {
    let h = record(record(emptyHistory(), cmd('1')), cmd('2'));
    const u = takeUndo(h)!;
    expect(u.command.id).toBe('2');
    h = u.history;
    expect(h.future.map((c) => c.id)).toEqual(['2']);
    const r = takeRedo(h)!;
    expect(r.command.id).toBe('2');
    expect(r.history.past.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('clears redo when a new command is recorded', () => {
    const h = takeUndo(record(emptyHistory(), cmd('1')))!.history;
    expect(record(h, cmd('2')).future).toEqual([]);
  });

  it('caps the log length', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = record(h, cmd(String(i)));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].id).toBe('10');
  });

  it('returns null with nothing to undo/redo', () => {
    expect(takeUndo(emptyHistory())).toBeNull();
    expect(takeRedo(emptyHistory())).toBeNull();
  });
});

describe('undo/redo through the domain store', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('does not record board/column creation (only card create/delete/move)', () => {
    expect(ctx.s().history.past).toHaveLength(0);
  });

  it('undoes and redoes card creation', () => {
    const { s, todo } = ctx;
    const id = s().addCard(todo, 'Write tests');
    expect(titles(s, todo)).toEqual(['Write tests']);

    s().undo();
    expect(s().cards[id]).toBeUndefined();
    expect(titles(s, todo)).toEqual([]);

    s().redo();
    expect(s().cards[id].title).toBe('Write tests');
    expect(titles(s, todo)).toEqual(['Write tests']);
  });

  it('undoes a delete, restoring the card in place with its comment thread', () => {
    const { s, todo } = ctx;
    s().addCard(todo, 'one');
    const two = s().addCard(todo, 'two');
    s().addCard(todo, 'three');
    const root = s().addComment(two, 'root')!;
    s().addComment(two, 'reply', root);

    s().deleteCard(two);
    expect(titles(s, todo)).toEqual(['one', 'three']);
    expect(Object.keys(s().comments)).toHaveLength(0);

    s().undo();
    expect(titles(s, todo)).toEqual(['one', 'two', 'three']);
    expect(s().commentsByCard[two]).toHaveLength(2);
    expect(s().comments[root].body).toBe('root');

    s().redo();
    expect(titles(s, todo)).toEqual(['one', 'three']);
  });

  it('undoes a move back to the original column and position', () => {
    const { s, todo, done } = ctx;
    const a = s().addCard(todo, 'a');
    s().addCard(todo, 'b');
    const original = s().cards[a].position;

    s().moveCard(a, done, 5000);
    expect(titles(s, done)).toEqual(['a']);
    expect(titles(s, todo)).toEqual(['b']);

    s().undo();
    expect(titles(s, todo)).toEqual(['a', 'b']);
    expect(s().cards[a].columnId).toBe(todo);
    expect(s().cards[a].position).toBe(original);

    s().redo();
    expect(s().cards[a].columnId).toBe(done);
  });

  it('walks back through several commands in order', () => {
    const { s, todo, done } = ctx;
    const a = s().addCard(todo, 'a'); // 1 create
    s().moveCard(a, done, 1); // 2 move
    s().deleteCard(a); // 3 delete
    expect(s().history.past.map((c) => c.label)).toEqual(['Create “a”', 'Move “a”', 'Delete “a”']);

    s().undo(); // restore (in done)
    expect(s().cards[a].columnId).toBe(done);
    s().undo(); // move back
    expect(s().cards[a].columnId).toBe(todo);
    s().undo(); // un-create
    expect(s().cards[a]).toBeUndefined();
    expect(s().history.past).toHaveLength(0);
    expect(s().history.future).toHaveLength(3);
  });

  it('a no-op move (same slot) is not recorded', () => {
    const { s, todo } = ctx;
    const a = s().addCard(todo, 'a');
    s().moveCard(a, todo, s().cards[a].position);
    expect(s().history.past).toHaveLength(1);
  });

  it('drops a stale command when its target was deleted elsewhere', () => {
    const { s, seen, todo, done } = ctx;
    const a = s().addCard(todo, 'a');
    s().moveCard(a, done, 1);
    // Simulate another tab deleting the card (remote op: no history entry).
    s().receive({ opId: 'remote', op: { type: 'card/delete', cardId: a }, stamp: { ts: Date.now() + 10_000, tab: 'zz' } });

    s().undo(); // tries to move a back -> missing
    expect(seen.some((e) => e.type === 'history-stale')).toBe(true);
    expect(s().history.future).toHaveLength(0);
  });

  it('rebases from confirmed state when an earlier op fails after a later one succeeded', async () => {
    const { s, todo } = ctx;
    const a = s().addCard(todo, 'a');
    s().addCard(todo, 'b');
    s().addCard(todo, 'c');
    const original = s().cards[a].position;

    // A transport whose sends we settle by hand, in any order.
    const sends: { opId: string; resolve: () => void; reject: (e: Error) => void }[] = [];
    s().setTransport({
      send: (env) => new Promise<void>((resolve, reject) => sends.push({ opId: env.opId, resolve, reject })),
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    s().moveCard(a, todo, 2500); // move 1: a after b
    s().moveCard(a, todo, 9000); // move 2: a to the end
    sends[1].resolve(); // move 2 reaches other tabs...
    await settle();
    sends[0].reject(new Error('offline')); // ...then move 1 fails
    await settle();

    // Other tabs only ever saw move 2, so this tab must agree with them,
    // not snap back to where the card was before move 1.
    expect(s().cards[a].position).toBe(9000);
    expect(titles(s, todo)).toEqual(['b', 'c', 'a']);

    // If every in-flight op fails, we land exactly on the confirmed state.
    s().moveCard(a, todo, 100);
    s().moveCard(a, todo, 2600);
    sends[2].reject(new Error('offline'));
    sends[3].reject(new Error('offline'));
    await settle();
    expect(s().cards[a].position).toBe(9000);
    expect(s().cards[a].position).not.toBe(original);
    expect(s().history.past.map((c) => c.label)).not.toContain(undefined);
  });

  it('rolls back an optimistic op and forgets it when sync fails', async () => {
    const { store, events } = createDomainStore({
      transport: { send: () => Promise.reject(new Error('offline')) },
    });
    const onEvent = vi.fn();
    events.subscribe(onEvent);
    const s = store.getState;
    const boardId = s().addBoard('B', 'd');
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the rejection settle
    expect(s().boards[boardId]).toBeUndefined();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'rollback' }));
  });
});
