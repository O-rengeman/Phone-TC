import { VideoRenderer } from './VideoRenderer';

interface ReturnMonitorProps {
  stream: MediaStream | null;
  sourceId: string | null;
  connected: boolean;
  onOpenFullscreen: () => void;
  pipEnabled: boolean;
  setPipEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ReturnMonitor({
  stream,
  sourceId,
  connected,
  onOpenFullscreen,
  pipEnabled,
  setPipEnabled,
}: ReturnMonitorProps) {
  const hasSignal = stream !== null;
  const sourceLabel = sourceId ? `PGM ${sourceId.slice(0, 6).toUpperCase()}` : 'PGM --';
  const statusLabel = hasSignal ? 'LIVE' : connected ? 'WAITING' : 'OFFLINE';

  return (
    <section className="return-monitor-card" aria-label="Return monitor">
      <div className="return-monitor-header">
        <div className="return-monitor-heading">
          <div className="return-monitor-title">RETURN MONITOR</div>
          <div className="return-monitor-subtitle">PROGRAM OUT FROM MASTER SWITCHER</div>
        </div>
        <div className="return-monitor-controls">
          <span className="return-monitor-source">{sourceLabel}</span>
          {stream && (
            <button
              type="button"
              className={`pip-toggle-btn ${pipEnabled ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setPipEnabled(v => !v); }}
            >
              PIP {pipEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          <span
            className={`return-monitor-status ${hasSignal ? 'live' : connected ? 'waiting' : 'offline'}`}
            aria-live="polite"
          >
            <span className="return-monitor-status-dot" />
            {statusLabel}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="return-monitor-viewport"
        onClick={onOpenFullscreen}
        aria-label={hasSignal ? 'Open return monitor full screen' : 'Open tally full screen'}
      >
        {hasSignal ? (
          <VideoRenderer
            stream={stream}
            className="return-monitor-video"
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <span className="return-monitor-placeholder">
            <strong>{connected ? 'NO PROGRAM SIGNAL' : 'CONNECT TO DIRECTOR'}</strong>
            <small>
              {connected
                ? 'Master PGM output appears here when a source is on air'
                : 'Join a P2P master session to receive video'}
            </small>
          </span>
        )}
        <span className="return-monitor-fullscreen">FULL SCREEN</span>
      </button>
    </section>
  );
}
