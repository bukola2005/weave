import { describe, expect, it, vi } from 'vitest';
import { createDomainStore } from '../store/domainStore';
import { createLocalStorageBoardApi, persistOp, type BoardApi } from './boardApi';
import type { Transport } from '../lib/sync';

// Minimal in-memory Storage so each test has its own "disk".
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function boardWithCards(api: BoardApi, transport: Transport | null = null) {
  const { store } = createDomainStore({ api, transport });
  const s = store.getState;
  const boardId = s().addBoard('B', 'd');
  const todo = s().addColumn(boardId, 'To do');
  const done = s().addColumn(boardId, 'Done');
  const a = s().addCard(todo, 'a');
  const b = s().addCard(todo, 'b');
  return { s, todo, done, a, b };
}

describe('BoardApi', () => {
  it('routes card ordering ops to the card endpoints', async () => {
    const api: BoardApi = {
      loadWorkspace: vi.fn(),
      replaceWorkspace: vi.fn(),
      createCard: vi.fn(() => Promise.resolve()),
      moveCard: vi.fn(() => Promise.resolve()),
      deleteCard: vi.fn(() => Promise.resolve()),
      commit: vi.fn(() => Promise.resolve()),
    };
    const { s, done, a } = boardWithCards(api);
    s().moveCard(a, done, 42);
    s().deleteCard(a);

    expect(api.createCard).toHaveBeenCalledTimes(2);
    expect(api.moveCard).toHaveBeenCalledWith(a, done, 42, expect.objectContaining({ ts: expect.any(Number) }));
    expect(api.deleteCard).toHaveBeenCalledWith(a, expect.anything());
    // board + 2 columns go through the generic endpoint
    expect(api.commit).toHaveBeenCalledTimes(3);
  });

  it('persists card order so a reload sees the moved card', async () => {
    const storage = memoryStorage();
    const api = createLocalStorageBoardApi({ storage });
    const { s, todo, done, a, b } = boardWithCards(api);
    s().moveCard(a, done, 10);
    s().moveCard(b, todo, -5);
    api.flush();

    const reloaded = await createLocalStorageBoardApi({ storage }).loadWorkspace();
    expect(reloaded?.columns[done].cardIds).toEqual([a]);
    expect(reloaded?.cards[a].position).toBe(10);
    expect(reloaded?.columns[todo].cardIds).toEqual([b]);
  });

  it('never persists an optimistic move whose sync failed', async () => {
    const storage = memoryStorage();
    const api = createLocalStorageBoardApi({ storage });
    const { s, todo, done, a } = boardWithCards(api);

    s().setTransport({ send: () => Promise.reject(new Error('offline')) });
    s().moveCard(a, done, 10);
    expect(s().cards[a].columnId).toBe(done); // optimistic
    await settle();
    expect(s().cards[a].columnId).toBe(todo); // rolled back
    api.flush();

    const reloaded = await createLocalStorageBoardApi({ storage }).loadWorkspace();
    expect(reloaded?.cards[a].columnId).toBe(todo);
  });

  it('persists an op only once its send succeeds', async () => {
    const api = { ...createLocalStorageBoardApi({ storage: memoryStorage() }), moveCard: vi.fn(() => Promise.resolve()) };
    let resolveSend: () => void = () => {};
    const { s, done, a } = boardWithCards(api);
    s().setTransport({ send: () => new Promise<void>((resolve) => (resolveSend = resolve)) });

    s().moveCard(a, done, 10);
    expect(api.moveCard).not.toHaveBeenCalled();
    resolveSend();
    await settle();
    expect(api.moveCard).toHaveBeenCalledTimes(1);
  });

  it('persistOp sends an undo-restore with comments through the generic endpoint', async () => {
    const api = { ...createLocalStorageBoardApi({ storage: memoryStorage() }), commit: vi.fn(() => Promise.resolve()) };
    await persistOp(api, {
      opId: 'x',
      stamp: { ts: 1, tab: 't' },
      op: {
        type: 'card/create',
        card: { id: 'c', columnId: 'col', title: 't', description: '', tags: [], dueDate: null, position: 1 },
        comments: [
          { id: 'm', cardId: 'c', parentId: null, author: 'a', body: 'b', createdAt: 1, deleted: false, edited: { ts: 1, tab: 't' }, editedByUser: false },
        ],
      },
    });
    expect(api.commit).toHaveBeenCalledTimes(1);
  });
});
