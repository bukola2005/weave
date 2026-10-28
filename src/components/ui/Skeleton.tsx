// Placeholder shapes shown while the board bundle loads and while a new tab
// waits for its peers' snapshot. Purely decorative; the wrapping region
// carries role="status" + a text label for screen readers.
export function Skeleton({ width, height, radius = 6 }: { width?: number | string; height: number; radius?: number }) {
  return <span className="skeleton" style={{ width: width ?? '100%', height, borderRadius: radius }} aria-hidden="true" />;
}

export function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading board" className="skeleton-board">
      <Skeleton width={140} height={12} />
      <div style={{ height: 14 }} />
      <Skeleton width="45%" height={38} />
      <div style={{ height: 10 }} />
      <Skeleton width="30%" height={14} />
      <div className="skeleton-columns">
        {[5, 3, 4, 2].map((cards, i) => (
          <div key={i} className="column skeleton-column">
            <Skeleton width="50%" height={14} />
            {Array.from({ length: cards }, (_, j) => (
              <Skeleton key={j} height={74} radius={8} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading workspace" className="skeleton-board">
      <Skeleton width={160} height={12} />
      <div style={{ height: 14 }} />
      <Skeleton width="55%" height={46} />
      <div style={{ height: 34 }} />
      <div className="board-layout">
        <Skeleton height={300} radius={11} />
        <div className="supporting-boards">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={142} radius={11} />
          ))}
        </div>
      </div>
    </div>
  );
}
