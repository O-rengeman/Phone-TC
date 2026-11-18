import { useLTC } from '../../LTCSyncContext';
import type { SyncMode } from '../../LTCSyncContext';
import { formatSyncAge } from '../../utils/DriftMonitor';
import { isClientDrifting, isClientOffline } from '../../utils/clients';
import { ConnectionManager } from '../../ConnectionManager';
import { DesktopPanel, DesktopSection } from './DesktopPanel';
import './syncPane.css';

const SYNC_MODES: SyncMode[] = ['system', 'network', 'p2p', 'freerun'];

/**
 * Where the time comes from, and who is on the session. Grouped together
 * because they are the same question in practice: an operator checking why a
 * camera drifted needs the sync mode, the drift readout and that camera's RTT
 * on one screen.
 */
export function SyncPane() {
  const {
    isRunning, syncMode, setSyncMode, syncStatus, driftStatus,
    p2pRole, isHost, clients, nowTick,
    isResyncing, handleManualResync,
    tr,
  } = useLTC();

  const clientEntries = Object.entries(clients);

  return (
    <div className="dt-pane dt-pane-sync">
      <DesktopPanel title={tr('dt.control')} help="sync" className="dt-panel-control" scroll>
        <DesktopSection title={tr('label.syncMethod')}>
          <div className="dt-segment dt-segment-4 dtv2-methods">
            {SYNC_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                className={syncMode === mode ? 'active' : ''}
                onClick={() => setSyncMode(mode)}
                disabled={isRunning || (mode === 'p2p' && !p2pRole)}
              >
                {mode === 'freerun' ? tr('mode.freerun') : mode.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="dt-stat-row dtv2-stats">
            <div className="dt-stat">
              <span className="dt-stat-label">{tr('dt.latency')}</span>
              <strong>{syncStatus ? `${syncStatus.latency.toFixed(1)}ms` : '—'}</strong>
            </div>
            <div className="dt-stat">
              <span className="dt-stat-label">{tr('dt.offset')}</span>
              <strong>{syncStatus ? `${syncStatus.offset.toFixed(1)}ms` : '—'}</strong>
            </div>
            <div className="dt-stat">
              <span className="dt-stat-label">{tr('drift.lastSync')}</span>
              <strong>{driftStatus?.hasSync ? formatSyncAge(driftStatus.msSinceSync) : '—'}</strong>
            </div>
          </div>

          {syncMode === 'network' && (
            <button
              type="button"
              className="dt-btn dtv2-resync"
              onClick={() => void handleManualResync()}
              disabled={isResyncing}
            >
              {isResyncing ? tr('sync.resyncing') : tr('sync.resync')}
            </button>
          )}

          {driftStatus?.hasSync && driftStatus.rejamRecommended && (
            <p className="dt-warn dtv2-warn">⚠️ {tr('drift.rejam')}</p>
          )}
        </DesktopSection>

        <DesktopSection title={tr('dt.session')}>
          {/* Layout-neutral wrapper: .connection-manager-v2 is
              display:contents, so this div is the box that the shared
              markup actually renders inside — syncPane.css scopes all of
              its ConnectionManager descendant restyles to it. */}
          <div className="dtv2-session">
            <ConnectionManager />
          </div>
        </DesktopSection>
      </DesktopPanel>

      <DesktopPanel
        title={tr('dt.clients')}
        aside={<span className="dt-count">{clientEntries.length}</span>}
        grow
        scroll
      >
        {clientEntries.length === 0 ? (
          <div className="dt-empty">
            <strong>{tr('dt.noClients')}</strong>
            <span>{tr('dt.noClientsHint')}</span>
          </div>
        ) : (
          <table className="dt-table dtv2-client-table">
            <thead>
              <tr>
                <th>{tr('dt.camera')}</th>
                <th>ID</th>
                <th className="dtv2-num">{tr('dt.rtt')}</th>
                <th className="dtv2-num">{tr('dt.drift')}</th>
                <th>{tr('dt.status')}</th>
              </tr>
            </thead>
            <tbody>
              {clientEntries.map(([id, stats], idx) => {
                const offline = isClientOffline(stats, nowTick);
                const driftWarn = isClientDrifting(stats.drift);
                return (
                  <tr key={id} className={offline ? 'offline' : ''}>
                    <td>{`CAM${idx + 1}`}</td>
                    <td className="dt-mono">{id}</td>
                    <td className="dt-mono dtv2-num">{stats.rtt.toFixed(0)}ms</td>
                    <td className={`dt-mono dtv2-num ${driftWarn ? 'warn' : ''}`}>
                      {stats.drift >= 0 ? '+' : ''}{stats.drift.toFixed(3)}s
                    </td>
                    <td className="dtv2-status">
                      <span className={`dt-dot ${offline ? 'offline' : driftWarn ? 'warn' : 'ok'}`} />
                      {offline ? tr('dt.offline') : driftWarn ? tr('dt.drift') : tr('dt.locked')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!isHost && p2pRole === 'client' && (
          <p className="dt-hint">{tr('dt.hint.syncClients')}</p>
        )}
      </DesktopPanel>
    </div>
  );
}
