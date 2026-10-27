import { memo, useEffect, useRef } from 'react';
import { useUIStore } from '../store/uiStore';
import { useVirtualList } from '../hooks/useVirtualList';
import CardItem from './CardItem';

// Short columns render every card (simplest DOM, nothing to get wrong for
// screen readers or find-in-page). Past this many, only cards near the
// viewport are mounted.
export const VIRTUALIZE_AFTER = 30;
const GAP = 11;

interface Props {
  columnId: string;
  columnName: string;
  ids: string[]; // visible (search-filtered) card ids, in order
  prevColumnId?: string;
  nextColumnId?: string;
}

function CardList({ columnId, columnName, ids, prevColumnId, nextColumnId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = ids.length > VIRTUALIZE_AFTER;
  const { range, offsets, total, measure, scrollToIndex } = useVirtualList({
    keys: ids,
    scrollRef,
    gap: GAP,
    enabled: virtual,
  });
  const dropIndex = useUIStore((s) => (s.dropTarget?.columnId === columnId ? s.dropTarget.index : null));
  const focusCardId = useUIStore((s) => s.focusCardId);

  // A keyboard move can target a card that's currently virtualized away;
  // scroll it into the window so it mounts and can take focus.
  useEffect(() => {
    if (!virtual || !focusCardId) return;
    const index = ids.indexOf(focusCardId);
    if (index !== -1) scrollToIndex(index);
  }, [virtual, focusCardId, ids, scrollToIndex]);

  const common = (id: string, index: number) => ({
    cardId: id,
    columnId,
    index,
    setSize: ids.length,
    prevColumnId,
    nextColumnId,
  });

  if (!virtual) {
    const items = ids.map((id, index) => <CardItem key={id} {...common(id, index)} />);
    if (dropIndex !== null) {
      items.splice(dropIndex, 0, <li key="__drop" className="drop-indicator" aria-hidden="true" />);
    }
    return (
      <div className="card-scroller" ref={scrollRef} data-card-scroller>
        <ul className="card-list" aria-label={`Cards in ${columnName}`}>
          {items}
        </ul>
      </div>
    );
  }

  const visible = [];
  for (let i = range.start; i <= range.end && i < ids.length; i++) {
    visible.push(<CardItem key={ids[i]} {...common(ids[i], i)} top={offsets[i]} measure={measure} />);
  }
  const indicatorTop =
    dropIndex === null ? null : dropIndex >= ids.length ? total + GAP / 2 : Math.max(0, offsets[dropIndex] - GAP / 2);

  return (
    <div className="card-scroller" ref={scrollRef} data-card-scroller>
      <ul
        className="card-list is-virtual"
        aria-label={`Cards in ${columnName} (${ids.length}, scroll to load more)`}
        style={{ height: total }}
      >
        {visible}
        {indicatorTop !== null && (
          <li
            className="drop-indicator is-floating"
            aria-hidden="true"
            style={{ transform: `translateY(${indicatorTop - 2}px)` }}
          />
        )}
      </ul>
    </div>
  );
}

export default memo(CardList);
