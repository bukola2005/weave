import { describe, expect, it } from 'vitest';
import { applyOp, emptyData, mergeData, type DomainData, type Op } from './ops';
import type { Stamp } from '../types';

// Convergence tests for the LWW rule: two tabs applying the same set of ops
// in different orders must end in the same state.
const at = (ts: number, tab = 'a'): Stamp => ({ ts, tab });

function base(): DomainData {
  let d = emptyData();
  const ops: Op[] = [
    { type: 'board/create', board: { id: 'b', title: 'B', description: '', createdAt: '' } },
    { type: 'column/create', column: { id: 'A', boardId: 'b', name: 'A', position: 1 } },
    { type: 'column/create', column: { id: 'B', boardId: 'b', name: 'B', position: 2 } },
    {
      type: 'card/create',
      card: { id: 'k', columnId: 'A', title: 'Card', description: '', tags: [], dueDate: null, position: 1 },
    },
  ];
  ops.forEach((op, i) => (d = applyOp(d, op, at(i + 1)).data));
  return d;
}

const run = (d: DomainData, list: [Op, Stamp][]) => list.reduce((acc, [op, s]) => applyOp(acc, op, s).data, d);

describe('last-write-wins', () => {
  it('converges on concurrent title edits regardless of arrival order', () => {
    const e1: [Op, Stamp] = [{ type: 'card/update', cardId: 'k', changes: { title: 'from tab A' } }, at(100, 'a')];
    const e2: [Op, Stamp] = [{ type: 'card/update', cardId: 'k', changes: { title: 'from tab B' } }, at(101, 'b')];
    const one = run(base(), [e1, e2]);
    const two = run(base(), [e2, e1]);
    expect(one.cards.k.title).toBe('from tab B');
    expect(two.cards.k.title).toBe('from tab B');
  });

  it('breaks exact timestamp ties by tab id', () => {
    const e1: [Op, Stamp] = [{ type: 'card/update', cardId: 'k', changes: { title: 'a' } }, at(100, 'aaa')];
    const e2: [Op, Stamp] = [{ type: 'card/update', cardId: 'k', changes: { title: 'z' } }, at(100, 'zzz')];
    expect(run(base(), [e1, e2]).cards.k.title).toBe('z');
    expect(run(base(), [e2, e1]).cards.k.title).toBe('z');
  });

  it('treats edit and move as independent registers (no false conflict)', () => {
    const edit: [Op, Stamp] = [{ type: 'card/update', cardId: 'k', changes: { title: 'edited' } }, at(200, 'a')];
    const move: [Op, Stamp] = [{ type: 'card/move', cardId: 'k', toColumnId: 'B', position: 5 }, at(150, 'b')];
    for (const order of [[edit, move], [move, edit]]) {
      const d = run(base(), order);
      expect(d.cards.k.title).toBe('edited');
      expect(d.cards.k.columnId).toBe('B');
      expect(d.columns.B.cardIds).toEqual(['k']);
      expect(d.columns.A.cardIds).toEqual([]);
    }
  });

  it('reports a stale op instead of applying it', () => {
    const d = run(base(), [[{ type: 'card/update', cardId: 'k', changes: { title: 'new' } }, at(300)]]);
    const result = applyOp(d, { type: 'card/update', cardId: 'k', changes: { title: 'old' } }, at(250, 'b'));
    expect(result.outcome).toBe('stale');
    expect(result.data.cards.k.title).toBe('new');
  });

  it('lets deletes win over concurrent edits', () => {
    const del: [Op, Stamp] = [{ type: 'card/delete', cardId: 'k' }, at(100, 'a')];
    const edit: [Op, Stamp] = [{ type: 'card/update', cardId: 'k', changes: { title: 'late' } }, at(999, 'b')];
    expect(run(base(), [del, edit]).cards.k).toBeUndefined();
    expect(run(base(), [edit, del]).cards.k).toBeUndefined();
  });

  it('keeps card order identical across tabs for concurrent moves', () => {
    let d = base();
    d = applyOp(
      d,
      { type: 'card/create', card: { id: 'm', columnId: 'B', title: 'm', description: '', tags: [], dueDate: null, position: 10 } },
      at(10)
    ).data;
    const m1: [Op, Stamp] = [{ type: 'card/move', cardId: 'k', toColumnId: 'B', position: 5 }, at(100, 'a')];
    const m2: [Op, Stamp] = [{ type: 'card/move', cardId: 'm', toColumnId: 'B', position: 1 }, at(101, 'b')];
    expect(run(d, [m1, m2]).columns.B.cardIds).toEqual(run(d, [m2, m1]).columns.B.cardIds);
    expect(run(d, [m1, m2]).columns.B.cardIds).toEqual(['m', 'k']);
  });

  it('merges snapshots per register', () => {
    const left = run(base(), [[{ type: 'card/update', cardId: 'k', changes: { title: 'L' } }, at(500, 'a')]]);
    const right = run(base(), [[{ type: 'card/move', cardId: 'k', toColumnId: 'B', position: 9 }, at(400, 'b')]]);
    const merged = mergeData(left, right);
    expect(merged.cards.k.title).toBe('L');
    expect(merged.cards.k.columnId).toBe('B');
    expect(merged.columns.B.cardIds).toEqual(['k']);
    expect(mergeData(right, left)).toEqual(merged);
  });
});
