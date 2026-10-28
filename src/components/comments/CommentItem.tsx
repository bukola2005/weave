import { memo, useState } from 'react';
import { canReply, type CommentNode } from '../../lib/comments';
import { DISPLAY_NAME } from '../../lib/identity';
import { useDomainStore } from '../../store/domainStore';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CommentForm from './CommentForm';

const timeLabel = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(ms)
  );

type Mode = 'idle' | 'reply' | 'edit' | 'confirmDelete';

// One comment and (recursively) its replies. Memoized on the node object:
// buildCommentTree creates new nodes every time, so this mostly helps when
// the thread re-renders for an unrelated reason (typing in the new-comment box).
function CommentItem({ node }: { node: CommentNode }) {
  const { comment, depth, children } = node;
  const addComment = useDomainStore((s) => s.addComment);
  const editComment = useDomainStore((s) => s.editComment);
  const deleteComment = useDomainStore((s) => s.deleteComment);
  const [mode, setMode] = useState<Mode>('idle');

  const mine = comment.author === DISPLAY_NAME;
  const headingId = `comment-${comment.id}-author`;

  return (
    <li className="comment" data-depth={depth}>
      <article aria-labelledby={headingId} className={comment.deleted ? 'comment-body is-deleted' : 'comment-body'}>
        <header className="comment-meta">
          <span id={headingId} className="comment-author">
            {comment.deleted ? 'Deleted comment' : comment.author}
          </span>
          {mine && !comment.deleted && <Badge tone="accent">You</Badge>}
          <time dateTime={new Date(comment.createdAt).toISOString()}>{timeLabel(comment.createdAt)}</time>
          {comment.editedByUser && !comment.deleted && <span className="comment-edited">(edited)</span>}
        </header>

        {mode === 'edit' ? (
          <CommentForm
            id={`edit-${comment.id}`}
            label="Edit comment"
            submitLabel="Save"
            initialValue={comment.body}
            autoFocus
            onSubmit={(body) => {
              editComment(comment.id, body);
              setMode('idle');
            }}
            onCancel={() => setMode('idle')}
          />
        ) : (
          <p className="comment-text">{comment.deleted ? 'This comment was deleted.' : comment.body}</p>
        )}

        {!comment.deleted && mode !== 'edit' && (
          <div className="comment-actions">
            {mode === 'confirmDelete' ? (
              <>
                <span className="comment-confirm">Delete this comment?</span>
                <Button size="sm" variant="danger" onClick={() => deleteComment(comment.id)}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
                  Keep
                </Button>
              </>
            ) : (
              <>
                {canReply(depth) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={mode === 'reply'}
                    onClick={() => setMode(mode === 'reply' ? 'idle' : 'reply')}
                  >
                    Reply
                  </Button>
                )}
                {mine && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMode('confirmDelete')}>
                      Delete
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'reply' && (
          <CommentForm
            id={`reply-${comment.id}`}
            label={`Reply to ${comment.author}`}
            submitLabel="Reply"
            autoFocus
            onSubmit={(body) => {
              addComment(comment.cardId, body, comment.id);
              setMode('idle');
            }}
            onCancel={() => setMode('idle')}
          />
        )}
      </article>

      {children.length > 0 && (
        <ul className="comment-replies" aria-label={`Replies to ${comment.deleted ? 'deleted comment' : comment.author}`}>
          {children.map((child) => (
            <CommentItemMemo key={child.comment.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

const CommentItemMemo = memo(CommentItem);
export default CommentItemMemo;
