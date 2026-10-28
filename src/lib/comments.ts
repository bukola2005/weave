import type { Comment } from '../types';

// Depth 0 = a top-level comment. Replies can nest down to MAX_COMMENT_DEPTH,
// i.e. three levels of replies under a comment. Deeper than that, threads get
// too narrow to read in a modal, so the Reply button is hidden.
export const MAX_COMMENT_DEPTH = 3;

export interface CommentNode {
  comment: Comment;
  depth: number;
  children: CommentNode[];
}

// Comments are stored flat (normalized) with a parentId; the tree is derived
// at render time. `ids` is the card's commentsByCard list (oldest first), so
// siblings come out in posting order.
export function buildCommentTree(ids: string[], comments: Record<string, Comment>): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const id of ids) {
    const comment = comments[id];
    if (comment) nodes.set(id, { comment, depth: 0, children: [] });
  }

  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.comment.parentId ? nodes.get(node.comment.parentId) : undefined;
    if (parent) parent.children.push(node);
    // A reply whose parent is gone (shouldn't happen — see tombstones in
    // ops.ts — but cheap to guard) is promoted rather than silently lost.
    else roots.push(node);
  }

  const setDepth = (list: CommentNode[], depth: number) => {
    for (const node of list) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

export function commentDepth(comment: Comment, comments: Record<string, Comment>): number {
  let depth = 0;
  let parentId = comment.parentId;
  while (parentId) {
    depth++;
    parentId = comments[parentId]?.parentId ?? null;
  }
  return depth;
}

export function canReply(depth: number): boolean {
  return depth < MAX_COMMENT_DEPTH;
}

export function countVisibleComments(ids: string[] | undefined, comments: Record<string, Comment>): number {
  if (!ids) return 0;
  let count = 0;
  for (const id of ids) if (comments[id] && !comments[id].deleted) count++;
  return count;
}
