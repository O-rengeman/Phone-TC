import type { TallyState } from '../utils/tally';
import { TALLY_COLORS } from '../utils/tally';
import { tallyLabelKey } from '../utils/tally';

interface ClientStats {
  lastSeen: number;
  rtt: number;
  drift: number;
}

interface ClientListProps {
  clients: Record<string, ClientStats>;
  nowTick: number;
  tallyPayload: { assignments?: Record<string, TallyState> } | null;
  isHost: boolean;
  tr: (key: string) => string;
  handleClientTallyChange: (id: string, state: TallyState) => void;
}

export function ClientList({
  clients,
  nowTick,
  tallyPayload,
  isHost,
  tr,
  handleClientTallyChange,
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
              <div className="client-tally-controls">
                {(['live', 'preview', 'off'] as TallyState[]).map(s => {
                   const isActive = tallyPayload?.assignments?.[id] === s;
                   return (
                     <button
                       key={s}
                       className={`tally-state-btn mini ${isActive ? 'active' : ''}`}
                       style={isActive ? { background: TALLY_COLORS[s], borderColor: TALLY_COLORS[s] } : undefined}
                       onClick={() => handleClientTallyChange(id, s)}
                     >
                       {tr(tallyLabelKey(s))}
                     </button>
                   );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
