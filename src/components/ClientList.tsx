import { useState } from 'react';
import { isClientDrifting, isClientOffline } from '../utils/clients';
import type { ClientStatLike } from '../utils/clients';
import { MobilePager } from './mobile/MobilePager';

// No-scroll mobile tools pane: client cards are paged four at a time (a 2x2
// grid) instead of sitting in a scrollable strip.
const MOBILE_CLIENTS_PER_PAGE = 4;

interface ClientListProps {
  clients: Record<string, ClientStatLike>;
  nowTick: number;
  isHost: boolean;
  /**
   * Mobile no-scroll mode: page the cards MOBILE_CLIENTS_PER_PAGE at a time
   * and render a MobilePager below the grid. Omit for the legacy layout.
   */
  mobilePaged?: boolean;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

export function ClientList({
  clients,
  nowTick,
  isHost,
  mobilePaged = false,
  tr,
}: ClientListProps) {
  const entries = Object.entries(clients);
  const [requestedPage, setRequestedPage] = useState(0);
  // Page is clamped at render time so a disconnecting client folds the view
  // back to the last page without a state write.
  const pageCount = mobilePaged ? Math.ceil(entries.length / MOBILE_CLIENTS_PER_PAGE) : 1;
  const page = Math.min(requestedPage, Math.max(0, pageCount - 1));
  const visible = mobilePaged
    ? entries.slice(page * MOBILE_CLIENTS_PER_PAGE, page * MOBILE_CLIENTS_PER_PAGE + MOBILE_CLIENTS_PER_PAGE)
    : entries;

  if (!isHost || entries.length === 0) return null;

  return (
    <section className={`tool-section-shell clients-list-section clients-v2${mobilePaged ? ' clients-v3' : ''}`}>
      <div className="tool-section-head">
        <label className="section-label">{tr('clients.title', { count: entries.length })}</label>
      </div>
      <div className="clients-grid">
        {visible.map(([id, stats]) => {
          const isOffline = isClientOffline(stats, nowTick);
          const drifting = isClientDrifting(stats.drift);
          return (
            <div key={id} className={`client-card client-card-v2 ${isOffline ? 'offline' : ''}`}>
              <div className="client-card-head">
                <span
                  className={`client-presence ${isOffline ? 'off' : 'on'}`}
                  aria-hidden="true"
                />
                <div className="client-id">{id}</div>
              </div>
              <div className="client-stats">
                <span className="stat">RTT: {stats.rtt.toFixed(0)}ms</span>
                <span className={`stat ${drifting ? 'drift-warn' : ''}`}>
                  δ: {stats.drift.toFixed(2)}s
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {mobilePaged && (
        <MobilePager
          page={page}
          pageCount={pageCount}
          onPage={setRequestedPage}
          tr={tr}
          className="clients-pager"
        />
      )}
    </section>
  );
}
