import { useLTC } from '../../LTCSyncContext';
import type { SyncMode } from '../../LTCSyncContext';
import { formatSyncAge } from '../../utils/DriftMonitor';
import { ConnectionManager } from '../../ConnectionManager';
import { DesktopPanel, DesktopSection } from './DesktopPanel';

const SYNC_MODES: SyncMode[] = ['system', 'network', 'p2p', 'freerun'];
const OFFLINE_AFTER_MS = 30000;

/**
 * Where the time comes from, and who is on the session. Grouped together
 * because they are the same question in practice: an operator checking why a
 * camera drifted needs the sync mode, the drift readout and that camera's RTT
 * on one screen.
 */
export function SyncPane() {
  const {
    isRunning, syncMode, setSyncMode, syncStatus, driftStatus,
    p2pRole, isHost, clients, nowTick, cameraLabels,
    isResyncing, handleManualResync,
    tr,
  } = useLTC();

  const clientEntries = Object.entries(clients);

  return (
    <div className="dt-pane dt-pane-sync">
      <DesktopPanel title={tr('dt.control')} help="sync" className="dt-panel-control" scroll>
        <DesktopSection title={tr('label.syncMethod')}>
          <div className="dt-segment dt-segment-4">
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

          <div className="dt-stat-row">
            <div className="dt-stat">
              <span className="dt-stat-label">LATENCY</span>
              <strong>{syncStatus ? `${syncStatus.latency.toFixed(1)}ms` : '—'}</strong>
            </div>
            <div className="dt-stat">
              <span className="dt-stat-label">OFFSET</span>
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
              className="dt-btn"
              onClick={() => void handleManualResync()}
              disabled={isResyncing}
            >
              {isResyncing ? tr('sync.resyncing') : tr('sync.resync')}
            </button>
          )}

          {driftStatus?.hasSync && driftStatus.msSinceSync >= 3600000 && (
            <p className="dt-warn">⚠️ {tr('drift.rejam')}</p>
          )}
        </DesktopSection>

        <DesktopSection title={tr('dt.session')}>
          <ConnectionManager />
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
          <table className="dt-table">
            <thead>
              <tr>
                <th>CAMERA</th>
                <th>ID</th>
                <th>RTT</th>
                <th>DRIFT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {clientEntries.map(([id, stats], idx) => {
                const offline = nowTick - stats.lastSeen > OFFLINE_AFTER_MS;
                const driftWarn = Math.abs(stats.drift) >= 0.03;
                return (
                  <tr key={id} className={offline ? 'offline' : ''}>
                    <td>{cameraLabels[id] || `CAM${idx + 1}`}</td>
                    <td className="dt-mono">{id}</td>
                    <td className="dt-mono">{stats.rtt.toFixed(0)}ms</td>
                    <td className={`dt-mono ${driftWarn ? 'warn' : ''}`}>
                      {stats.drift >= 0 ? '+' : ''}{stats.drift.toFixed(3)}s
                    </td>
                    <td>
                      <span className={`dt-dot ${offline ? 'offline' : driftWarn ? 'warn' : 'ok'}`} />
                      {offline ? 'OFFLINE' : driftWarn ? 'DRIFT' : 'LOCKED'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!isHost && p2pRole === 'client' && (
          <p className="dt-hint">接続中のカメラ一覧はマスター端末に表示されます。</p>
        )}
      </DesktopPanel>
    </div>
  );
}
