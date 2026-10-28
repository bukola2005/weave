import { useMemo } from 'react';
import { buildCommentTree, countVisibleComments } from '../../lib/comments';
import { useDomainStore } from '../../store/domainStore';
import CommentForm from './CommentForm';
import CommentItem from './CommentItem';

const NO_IDS: string[] = [];

// The discussion for one card. Comments are stored flat in the domain store
// (normalized, with parentId); the nested tree is derived here.
export default function CommentThread({ cardId }: { cardId: string }) {
  const ids = useDomainStore((s) => s.commentsByCard[cardId] ?? NO_IDS);
  const comments = useDomainStore((s) => s.comments);
  const addComment = useDomainStore((s) => s.addComment);

  const tree = useMemo(() => buildCommentTree(ids, comments), [ids, comments]);
  const count = countVisibleComments(ids, comments);

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <h3 id="comments-heading">
        Discussion <span className="count">{count}</span>
      </h3>

      {tree.length === 0 ? (
        <p className="comments-empty">No comments yet. Start the conversation — replies nest up to three levels deep.</p>
      ) : (
        <ul className="comment-list" aria-label="Comments">
          {tree.map((node) => (
            <CommentItem key={node.comment.id} node={node} />
          ))}
        </ul>
      )}

      <CommentForm
        id={`new-comment-${cardId}`}
        label="Write a comment"
        submitLabel="Comment"
        onSubmit={(body) => addComment(cardId, body)}
      />
    </section>
  );
}
