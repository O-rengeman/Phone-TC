import { VideoRenderer } from './VideoRenderer';

interface ReturnMonitorProps {
  stream: MediaStream | null;
  connected: boolean;
  onOpenFullscreen: () => void;
}

export function ReturnMonitor({
  stream,
  connected,
  onOpenFullscreen,
}: ReturnMonitorProps) {
  const hasSignal = stream !== null;

  return (
    <section className="return-monitor-card" aria-label="Return monitor">
      <div className="return-monitor-header">
        <div>
          <div className="return-monitor-title">RETURN MONITOR</div>
          <div className="return-monitor-subtitle">PROGRAM FEED FROM DIRECTOR</div>
        </div>
        <span
          className={`return-monitor-status ${hasSignal ? 'live' : connected ? 'waiting' : 'offline'}`}
          aria-live="polite"
        >
          <span className="return-monitor-status-dot" />
          {hasSignal ? 'LIVE' : connected ? 'WAITING' : 'OFFLINE'}
        </span>
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
