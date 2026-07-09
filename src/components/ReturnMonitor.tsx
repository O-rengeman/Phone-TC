import { VideoRenderer } from './VideoRenderer';

interface ReturnMonitorProps {
  stream: MediaStream | null;
  connected: boolean;
  onOpenFullscreen: () => void;
  pipEnabled: boolean;
  setPipEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ReturnMonitor({
  stream,
  connected,
  onOpenFullscreen,
  pipEnabled,
  setPipEnabled,
}: ReturnMonitorProps) {
  const hasSignal = stream !== null;

  return (
    <section className="return-monitor-card" aria-label="Return monitor">
      <div className="return-monitor-header">
        <div>
          <div className="return-monitor-title">RETURN MONITOR</div>
          <div className="return-monitor-subtitle">PROGRAM FEED FROM DIRECTOR</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {stream && (
            <button
              type="button"
              className={`pip-toggle-btn ${pipEnabled ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setPipEnabled(v => !v); }}
              style={{
                background: pipEnabled ? '#2563eb' : '#27272a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              PIP {pipEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          <span
            className={`return-monitor-status ${hasSignal ? 'live' : connected ? 'waiting' : 'offline'}`}
            aria-live="polite"
          >
            <span className="return-monitor-status-dot" />
            {hasSignal ? 'LIVE' : connected ? 'WAITING' : 'OFFLINE'}
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
                ? 'The selected PGM source will appear here'
                : 'Join a P2P master session to receive video'}
            </small>
          </span>
        )}
        <span className="return-monitor-fullscreen">FULL SCREEN</span>
      </button>
    </section>
  );
}
