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
  /** Touch layouts hide the [KEY] hints — those shortcuts never fire there. */
  isMobile?: boolean;
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
  isMobile,
  tr,
}: FooterControlsProps) {
  // Keyboard shortcuts (SPACE, R/B/G/Y) are wired to window keydown events,
  // which never fire on touch devices — don't advertise them there.
  const hint = (label: string, key: string) => (isMobile ? label : `${label} [${key}]`);

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
            onPointerCancel={cancelStopHold}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isPreparing || (syncMode === 'p2p' && p2pRole === 'client')}
            title={isRunning ? hint(tr('btn.holdToStop'), 'SPACE') : hint(isPaused ? tr('btn.resume') : tr('btn.start'), 'SPACE')}
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
            <button className="btn-mark-color red" onClick={() => addMarker('Red')} title={hint(tr('marker.redTitle'), 'R')}>R</button>
            <button className="btn-mark-color blue" onClick={() => addMarker('Blue')} title={hint(tr('marker.blueTitle'), 'B')}>B</button>
            <button className="btn-mark-color green" onClick={() => addMarker('Green')} title={hint(tr('marker.greenTitle'), 'G')}>G</button>
            <button className="btn-mark-color yellow" onClick={() => addMarker('Yellow')} title={hint(tr('marker.yellowTitle'), 'Y')}>Y</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
