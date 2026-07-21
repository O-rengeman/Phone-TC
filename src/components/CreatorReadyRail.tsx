interface CreatorReadyRailProps {
  isRunning: boolean;
  isPreparing: boolean;
  fpsLabel: string;
  syncMode: string;
  syncLatency: number | null;
  cameraCount: number;
  outputMode: 'stereo' | 'mono-l';
  outputOffset: number;
  lang: 'en' | 'ja';
  onOpenPro: () => void;
}

export function CreatorReadyRail({
  isRunning,
  isPreparing,
  fpsLabel,
  syncMode,
  syncLatency,
  cameraCount,
  outputMode,
  outputOffset,
  lang,
  onOpenPro,
}: CreatorReadyRailProps) {
  const status = isRunning
    ? (lang === 'ja' ? '収録中' : 'Recording')
    : isPreparing
      ? (lang === 'ja' ? '同期を準備中' : 'Preparing sync')
      : (lang === 'ja' ? '撮影準備OK' : 'Ready to roll');

  const statusHint = isRunning
    ? (lang === 'ja' ? 'TCを送出しています' : 'Timecode is running')
    : (lang === 'ja' ? '設定を確認して、そのまま開始できます' : 'Review the essentials, then start recording');

  const syncDetail = syncLatency === null
    ? (lang === 'ja' ? '待機中' : 'Standing by')
    : `${syncLatency.toFixed(1)} ms`;

  return (
    <section className={`creator-ready-rail ${isRunning ? 'is-live' : ''}`} aria-label={lang === 'ja' ? '撮影準備状況' : 'Shoot readiness'}>
      <div className="creator-ready-lead">
        <span className="creator-ready-indicator" aria-hidden="true" />
        <div>
          <small>SHOOT STATUS</small>
          <strong>{status}</strong>
          <span>{statusHint}</span>
        </div>
      </div>

      <div className="creator-ready-metrics">
        <div>
          <small>FRAME RATE</small>
          <strong>{fpsLabel}</strong>
          <span>fps</span>
        </div>
        <div>
          <small>SYNC</small>
          <strong>{syncMode === 'p2p' ? 'P2P' : syncMode.charAt(0).toUpperCase() + syncMode.slice(1)}</strong>
          <span>{syncDetail}</span>
        </div>
        <div>
          <small>CAMERAS</small>
          <strong>{cameraCount}</strong>
          <span>{lang === 'ja' ? '接続中' : 'connected'}</span>
        </div>
        <div>
          <small>OUTPUT</small>
          <strong>{outputMode === 'stereo' ? 'Stereo TC' : 'L-TC / R-Audio'}</strong>
          <span>{lang === 'ja' ? `オフセット ${outputOffset}` : `offset ${outputOffset}`}</span>
        </div>
      </div>

      <button type="button" className="creator-ready-pro-button" onClick={onOpenPro}>
        {lang === 'ja' ? 'Proコントロール' : 'Pro controls'}
      </button>
    </section>
  );
}
