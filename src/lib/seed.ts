import type { Op } from './ops';
import { POSITION_STEP } from './ordering';

// Generates a large demo board as ONE batch op, so it's a single state update
// and a single broadcast rather than hundreds. Used for the "load demo" button
// and for performance profiling (200+ cards, 20+ columns).
const STAGES = [
  'Inbox', 'Triage', 'Research', 'Spec', 'Design', 'Design review', 'Ready', 'In progress',
  'Code review', 'QA', 'Staging', 'Release prep', 'Shipped', 'Monitoring', 'Docs', 'Feedback',
  'Follow-ups', 'Blocked', 'Icebox', 'Ideas', 'Tech debt', 'Archive',
];
const VERBS = ['Draft', 'Review', 'Refactor', 'Test', 'Polish', 'Document', 'Prototype', 'Audit', 'Fix', 'Measure'];
const NOUNS = ['onboarding flow', 'billing page', 'search index', 'sync engine', 'empty states', 'dark theme', 'card modal', 'keyboard nav', 'export to CSV', 'API rate limits', 'analytics events', 'image uploads'];
const TAGS = ['Design', 'Research', 'Priority', 'Bug', 'Infra', 'Copy', 'A11y'];

export function buildDemoBoard(options: { cards?: number; columns?: number; now?: Date } = {}): {
  boardId: string;
  op: Op;
} {
  const columnCount = Math.min(options.columns ?? 22, STAGES.length);
  const cardCount = options.cards ?? 240;
  const now = options.now ?? new Date();
  const boardId = crypto.randomUUID();
  const ops: Op[] = [
    {
      type: 'board/create',
      board: {
        id: boardId,
        title: 'Product roadmap (demo)',
        description: `${cardCount} cards across ${columnCount} columns — a stress test for drag, sync, and rendering.`,
        createdAt: now.toISOString(),
      },
    },
  ];

  const columnIds: string[] = [];
  for (let c = 0; c < columnCount; c++) {
    const id = crypto.randomUUID();
    columnIds.push(id);
    ops.push({
      type: 'column/create',
      column: { id, boardId, name: STAGES[c], position: (c + 1) * POSITION_STEP },
    });
  }

  // Skew distribution: early columns get far more cards, so a few columns are
  // long enough to exercise virtualization (the realistic shape of a backlog).
  const perColumn = new Array(columnCount).fill(0);
  for (let i = 0; i < cardCount; i++) {
    const column = i % 3 === 0 ? 0 : i % 5 === 0 ? 1 : i % columnCount;
    perColumn[column]++;
    const n = perColumn[column];
    const due = new Date(now.getTime() + ((i % 30) - 8) * 86_400_000);
    ops.push({
      type: 'card/create',
      card: {
        id: crypto.randomUUID(),
        columnId: columnIds[column],
        title: `${VERBS[i % VERBS.length]} ${NOUNS[(i * 7) % NOUNS.length]} #${i + 1}`,
        description: i % 4 === 0 ? 'Some **context** for this task, with a _short_ note.' : '',
        tags: i % 3 === 0 ? [TAGS[i % TAGS.length]] : i % 7 === 0 ? [TAGS[i % TAGS.length], TAGS[(i + 2) % TAGS.length]] : [],
        dueDate: i % 2 === 0 ? due.toISOString().slice(0, 10) : null,
        position: n * POSITION_STEP,
      },
    });
  }

  return { boardId, op: { type: 'batch', ops } };
}
