import type { MarkerSync } from '../utils/export';

export function MarkerSyncBadge({ sync, tr }: {
  sync?: MarkerSync;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (!sync) return null;
  const drift = sync.driftMs !== null && Number.isFinite(sync.driftMs) ? ` ±${Math.abs(sync.driftMs).toFixed(1)}ms` : '';
  return (
    <span className={`marker-sync-badge marker-sync-${sync.confidence}`} title={tr(`marker.sync.confidence.${sync.confidence}`)}>
      {tr(`marker.sync.${sync.method}`)}{drift}
    </span>
  );
}
