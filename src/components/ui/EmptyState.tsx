import type { ReactNode } from 'react';

interface Props {
  title: string;
  children?: ReactNode; // supporting copy
  action?: ReactNode;
  compact?: boolean; // in-column variant
  headingLevel?: 'h2' | 'h3';
}

export default function EmptyState({ title, children, action, compact, headingLevel = 'h2' }: Props) {
  const Heading = headingLevel;
  return (
    <div className={compact ? 'column-empty' : 'empty-state'}>
      <Heading className="empty-title">{title}</Heading>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
