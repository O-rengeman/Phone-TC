import { isClientDrifting, isClientOffline } from '../utils/clients';
import type { ClientStatLike } from '../utils/clients';

interface ClientListProps {
  clients: Record<string, ClientStatLike>;
  nowTick: number;
  isHost: boolean;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

export function ClientList({
  clients,
  nowTick,
  isHost,
  tr,
}: ClientListProps) {
  if (!isHost || Object.keys(clients).length === 0) return null;

  return (
    <section className="tool-section-shell clients-list-section clients-v2">
      <div className="tool-section-head">
        <label className="section-label">{tr('clients.title', { count: Object.keys(clients).length })}</label>
      </div>
      <div className="clients-grid">
        {Object.entries(clients).map(([id, stats]) => {
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
    </section>
  );
}
