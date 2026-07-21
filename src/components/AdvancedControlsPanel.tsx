import { memo } from 'react';
import { useSync, useTally } from '../hooks/useAppDomains';
import { formatSyncAge } from '../utils/DriftMonitor';

interface AdvancedControlsPanelProps {
  lang: 'en' | 'ja';
  isHost: boolean;
  cameraLabels: Record<string, string>;
  onClose: () => void;
  onOpenDirector: () => void;
}

export const AdvancedControlsPanel = memo(function AdvancedControlsPanel({
  lang,
  isHost,
  cameraLabels,
  onClose,
  onOpenDirector,
}: AdvancedControlsPanelProps) {
  const sync = useSync();
  const tally = useTally();

  return (
    <aside className="advanced-side-panel" aria-label="Advanced controls">
      <div className="advanced-panel-head">
        <div>
          <span>{lang === 'ja' ? '上級コントロール' : 'Advanced controls'}</span>
          <strong>{lang === 'ja' ? '必要な時だけ開く' : 'Open only when needed'}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close advanced controls">×</button>
      </div>

      {isHost && (
        <section className="advanced-panel-section director-launch-card">
          <small>DIRECTOR</small>
          <strong>{lang === 'ja' ? 'マルチカムスイッチャー' : 'Multicam switcher'}</strong>
          <p>{lang === 'ja' ? 'ON AIRとNEXTを確認して、迷わずTAKE。' : 'See ON AIR and NEXT together, then take the shot.'}</p>
          <button type="button" className="advanced-primary-action" onClick={onOpenDirector}>
            {lang === 'ja' ? 'Directorを開く' : 'Open Director'}
          </button>
        </section>
      )}

      <section className="advanced-panel-section">
        <small>{lang === 'ja' ? '同期診断' : 'SYNC DIAGNOSTICS'}</small>
        <div className="advanced-metric-grid">
          <div><span>Mode</span><strong>{sync.syncMode.toUpperCase()}</strong></div>
          <div><span>Latency</span><strong>{sync.syncStatus ? `${sync.syncStatus.latency.toFixed(1)} ms` : '—'}</strong></div>
          <div><span>Offset</span><strong>{sync.syncStatus ? `${sync.syncStatus.offset.toFixed(1)} ms` : '—'}</strong></div>
          <div><span>Clients</span><strong>{Object.keys(sync.clients).length}</strong></div>
        </div>
        {sync.driftStatus?.hasSync && (
          <div className="advanced-drift-row">
            <span>{lang === 'ja' ? '最終同期' : 'Last sync'}</span>
            <strong>{formatSyncAge(sync.driftStatus.msSinceSync)}</strong>
          </div>
        )}
      </section>

      {isHost && Object.keys(tally.clients).length > 0 && (
        <section className="advanced-panel-section">
          <small>{lang === 'ja' ? '映像ビットレート' : 'VIDEO BITRATE'}</small>
          <div className="advanced-bitrate-list">
            {Object.entries(tally.clients).map(([id, stats], index) => (
              <label key={id} className="advanced-bitrate-row">
                <span>
                  <strong>{cameraLabels[id] || `CAM${index + 1}`}</strong>
                  <small>{stats.rtt.toFixed(0)} ms RTT</small>
                </span>
                <select
                  value={tally.clientBitrates[id] ?? 2_500_000}
                  onChange={(event) => tally.changeClientBitrate(id, Number(event.target.value))}
                >
                  <option value={1_000_000}>1 Mbps</option>
                  <option value={2_500_000}>2.5 Mbps</option>
                  <option value={5_000_000}>5 Mbps</option>
                  <option value={8_000_000}>8 Mbps</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
});
