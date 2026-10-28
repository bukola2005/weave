import { memo, type ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

interface Props {
  tone?: BadgeTone;
  children: ReactNode;
  // For badges that are only an icon + number (e.g. "💬 3"), give the full
  // meaning to assistive tech: label="3 comments".
  label?: string;
}

function Badge({ tone = 'neutral', children, label }: Props) {
  return (
    <span className={`badge badge-${tone}`} aria-label={label} role={label ? 'img' : undefined}>
      {children}
    </span>
  );
}

export default memo(Badge);
