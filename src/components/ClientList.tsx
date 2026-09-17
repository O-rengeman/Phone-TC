interface ClientStats {
  lastSeen: number;
  rtt: number;
  drift: number;
}

interface ClientListProps {
  clients: Record<string, ClientStats>;
  nowTick: number;
  isHost: boolean;
}

export function ClientList({
  clients,
  nowTick,
  isHost,
}: ClientListProps) {
  if (!isHost || Object.keys(clients).length === 0) return null;

  return (
    <section className="tool-section-shell clients-list-section">
      <div className="tool-section-head">
        <label className="section-label">CONNECTED CLIENTS ({Object.keys(clients).length})</label>
      </div>
      <div className="clients-grid">
        {Object.entries(clients).map(([id, stats]) => {
          const isOffline = nowTick - stats.lastSeen > 30000;
          return (
            <div key={id} className={`client-card ${isOffline ? 'offline' : ''}`}>
              <div className="client-id">{id}</div>
              <div className="client-stats">
                <span className="stat">RTT: {stats.rtt.toFixed(0)}ms</span>
                <span className={`stat ${stats.drift >= 0.5 ? 'drift-warn' : ''}`}>
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
