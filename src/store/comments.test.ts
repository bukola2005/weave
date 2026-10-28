import { beforeEach, describe, expect, it } from 'vitest';
import { createDomainStore } from './domainStore';
import { buildCommentTree, canReply, MAX_COMMENT_DEPTH } from '../lib/comments';

function setup() {
  const { store } = createDomainStore();
  const s = store.getState;
  const boardId = s().addBoard('Board', 'desc');
  const col = s().addColumn(boardId, 'To do');
  const cardId = s().addCard(col, 'Card');
  return { s, cardId, col };
}

const tree = (ctx: ReturnType<typeof setup>) =>
  buildCommentTree(ctx.s().commentsByCard[ctx.cardId] ?? [], ctx.s().comments);

describe('threaded comments', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('builds a nested tree from flat, normalized comments', () => {
    const { s, cardId } = ctx;
    const a = s().addComment(cardId, 'A')!;
    const b = s().addComment(cardId, 'B')!;
    const a1 = s().addComment(cardId, 'A1', a)!;
    s().addComment(cardId, 'A1a', a1);
    s().addComment(cardId, 'B1', b);

    // Stored flat...
    expect(Object.values(s().comments).every((c) => typeof c.parentId !== 'object' || c.parentId === null)).toBe(true);
    expect(s().commentsByCard[cardId]).toHaveLength(5);

    // ...derived as a tree, siblings in posting order.
    const t = tree(ctx);
    expect(t.map((n) => n.comment.body)).toEqual(['A', 'B']);
    expect(t[0].children[0].comment.body).toBe('A1');
    expect(t[0].children[0].children[0].comment.body).toBe('A1a');
    expect(t[0].children[0].children[0].depth).toBe(2);
    expect(t[1].children[0].comment.body).toBe('B1');
  });

  it(`supports ${MAX_COMMENT_DEPTH} levels of replies and rejects deeper ones`, () => {
    const { s, cardId } = ctx;
    let parent = s().addComment(cardId, 'depth 0')!;
    for (let depth = 1; depth <= MAX_COMMENT_DEPTH; depth++) {
      parent = s().addComment(cardId, `depth ${depth}`, parent)!;
      expect(parent).toBeTruthy();
    }
    expect(s().addComment(cardId, 'too deep', parent)).toBeNull();
    expect(canReply(MAX_COMMENT_DEPTH - 1)).toBe(true);
    expect(canReply(MAX_COMMENT_DEPTH)).toBe(false);
  });

  it('edits a comment and flags it as edited', () => {
    const { s, cardId } = ctx;
    const id = s().addComment(cardId, 'first draft')!;
    expect(s().comments[id].editedByUser).toBe(false);
    s().editComment(id, 'second draft');
    expect(s().comments[id].body).toBe('second draft');
    expect(s().comments[id].editedByUser).toBe(true);
  });

  it('hard-deletes a leaf comment', () => {
    const { s, cardId } = ctx;
    const id = s().addComment(cardId, 'bye')!;
    s().deleteComment(id);
    expect(s().comments[id]).toBeUndefined();
    expect(s().commentsByCard[cardId]).toEqual([]);
  });

  it('tombstones a comment that has replies, keeping the thread intact', () => {
    const { s, cardId } = ctx;
    const root = s().addComment(cardId, 'root')!;
    const reply = s().addComment(cardId, 'reply', root)!;
    s().deleteComment(root);

    expect(s().comments[root]).toMatchObject({ deleted: true, body: '' });
    expect(tree(ctx)[0].children[0].comment.id).toBe(reply);
    // A tombstone can't be edited.
    s().editComment(root, 'resurrect?');
    expect(s().comments[root].body).toBe('');
  });

  it('prunes a tombstoned parent once its last reply is deleted', () => {
    const { s, cardId } = ctx;
    const root = s().addComment(cardId, 'root')!;
    const mid = s().addComment(cardId, 'mid', root)!;
    const leaf = s().addComment(cardId, 'leaf', mid)!;
    s().deleteComment(root); // tombstone
    s().deleteComment(mid); // tombstone (has leaf)
    s().deleteComment(leaf); // removes leaf, then mid, then root
    expect(s().commentsByCard[cardId]).toEqual([]);
    expect(Object.keys(s().comments)).toHaveLength(0);
  });

  it('removes all comments when the card or its column is deleted', () => {
    const { s, cardId, col } = ctx;
    s().addComment(cardId, 'x');
    s().deleteColumn(col);
    expect(Object.keys(s().comments)).toHaveLength(0);
    expect(s().commentsByCard[cardId]).toBeUndefined();
  });

  it('ignores a reply whose parent was deleted in another tab', () => {
    const { s, cardId } = ctx;
    const outcome = s().receive({
      opId: 'r1',
      stamp: { ts: Date.now() + 1000, tab: 'other' },
      op: {
        type: 'comment/add',
        comment: { id: 'c1', cardId, parentId: 'gone', author: 'Other', body: 'hi', createdAt: 1 },
      },
    });
    expect(outcome).toBe('missing');
    expect(s().comments.c1).toBeUndefined();
  });
});
