interface FooterControlsProps {
  isRunning: boolean;
  isPreparing: boolean;
  isPaused: boolean;
  stopHoldPct: number;
  holdStoppedRef: { current: boolean };
  handleStartStop: () => Promise<void>;
  beginStopHold: () => void;
  cancelStopHold: () => void;
  handlePause: () => void;
  addMarker: (color: 'Red' | 'Blue' | 'Green' | 'Yellow') => void;
  syncMode: string;
  p2pRole: 'master' | 'client' | null;
  tr: (key: string) => string;
}

export function FooterControls({
  isRunning,
  isPreparing,
  isPaused,
  stopHoldPct,
  holdStoppedRef,
  handleStartStop,
  beginStopHold,
  cancelStopHold,
  handlePause,
  addMarker,
  syncMode,
  p2pRole,
  tr,
}: FooterControlsProps) {
  return (
    <footer className="fixed-footer">
      <div className="footer-buttons">
        <div className="footer-left">
          <button
            className={`btn-main-action ${isRunning ? 'running danger' : isPreparing ? 'preparing' : 'start'}`}
            onClick={() => {
              if (holdStoppedRef.current) { holdStoppedRef.current = false; return; }
              if (!isRunning) void handleStartStop();
            }}
            onPointerDown={() => { if (isRunning) beginStopHold(); }}
            onPointerUp={cancelStopHold}
            onPointerLeave={cancelStopHold}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isPreparing || (syncMode === 'p2p' && p2pRole === 'client')}
          >
            {isRunning && <div className="stop-hold-fill" style={{ width: `${stopHoldPct}%` }} />}
            <div className="btn-icon"></div>
            <div className="btn-text">
              {isRunning ? (stopHoldPct > 0 ? tr('btn.holding') : tr('btn.holdToStop')) : isPreparing ? tr('btn.prep') : isPaused ? tr('btn.resume') : tr('btn.start')}
            </div>
          </button>
          {isRunning && (
            <button 
              className="btn-main-action pause" 
              onClick={handlePause}
              disabled={syncMode === 'p2p' && p2pRole === 'client'}
            >
              <div className="btn-text">{tr('btn.pause')}</div>
            </button>
          )}
        </div>
        <div className="footer-right">
          <div className="mark-label">{tr('btn.mark')}</div>
          <div className="mark-colors-container">
            <button className="btn-mark-color red" onClick={() => addMarker('Red')} title={tr('marker.redTitle')}>R</button>
            <button className="btn-mark-color blue" onClick={() => addMarker('Blue')} title={tr('marker.blueTitle')}>B</button>
            <button className="btn-mark-color green" onClick={() => addMarker('Green')} title={tr('marker.greenTitle')}>G</button>
            <button className="btn-mark-color yellow" onClick={() => addMarker('Yellow')} title={tr('marker.yellowTitle')}>Y</button>
          </div>
        </div>
      </div>
    </footer>
  );
}