import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface Props {
  id: string;
  label: string;
  submitLabel: string;
  initialValue?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}

// Shared by "new comment", "reply" and "edit". Ctrl/⌘+Enter submits; Escape
// cancels (and stops there, so it doesn't also close the surrounding modal).
export default function CommentForm({ id, label, submitLabel, initialValue = '', autoFocus, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
    if (e.key === 'Escape' && onCancel) {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <form className="comment-form" onSubmit={submit}>
      <Input
        ref={ref as React.Ref<HTMLTextAreaElement>}
        id={id}
        label={label}
        hideLabel
        multiline
        rows={2}
        value={body}
        placeholder={label}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="comment-form-actions">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" type="submit" variant="primary" disabled={!body.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
