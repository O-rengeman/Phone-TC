import { useLTC } from '../../LTCSyncContext';
import { FPS_OPTIONS } from '../../constants';
import { useMediaStreams } from '../../hooks/useMediaStreams';
import { resolveReturnFeed } from '../../utils/switcherRouting';
import { ReturnMonitor } from '../ReturnMonitor';
import { DesktopPanel, DesktopSection } from './DesktopPanel';

interface TimecodePaneProps {
  onOutputModeChange: (mode: 'stereo' | 'mono-l') => void;
}

/**
 * Everything that decides what the generator puts out: frame rate, the audio
 * output form, and the frame offset. These are set up before a take and left
 * alone during it, which is why they live together and away from the
 * connection controls.
 */
export function TimecodePane({ onOutputModeChange }: TimecodePaneProps) {
  const {
    isRunning, fpsIndex, setFpsIndex, syncMode, p2pRole,
    outputMode, outputLevel, setOutputLevel,
    outputOffset, setOutputOffset,
    manualTimecode, setManualTimecode,
    userBits, autoUserBits,
    targetId, isTallyConnected, pipEnabled, setPipEnabled,
    setTallyOpen, setDirectorPanelOpen, setIsVisualSlate,
    tr,
  } = useLTC();

  const mediaStreams = useMediaStreams();
  const returnFeed = resolveReturnFeed(targetId, mediaStreams);

  // A client follows its master's frame rate and offset; letting the operator
  // change them here would be silently overwritten on the next heartbeat.
  const followsMaster = syncMode === 'p2p' && p2pRole === 'client';
  const locked = isRunning || followsMaster;
  const isClient = p2pRole === 'client';

  return (
    <div className={`dt-pane dt-pane-timecode${isClient ? ' has-return' : ''}`}>
      <DesktopPanel
        title={tr('label.frameRate')}
        help="timecode"
        aside={locked ? <span className="dt-lock">{followsMaster ? 'FOLLOWING MASTER' : 'RUNNING'}</span> : undefined}
      >
        <div className="dt-fps-grid">
          {FPS_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              className={`dt-chip dt-chip-lg ${fpsIndex === i ? 'active' : ''}`}
              onClick={() => setFpsIndex(i)}
              disabled={locked}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="dt-hint">59.94p 撮影時は 29.97 を、50p 撮影時は 25 を選択してください。</p>
      </DesktopPanel>

      <DesktopPanel title={tr('dt.output')}>
        <div className="dt-field">
          <span className="dt-field-label">{tr('label.outputMode')}</span>
          <div className="dt-segment">
            <button
              type="button"
              className={outputMode === 'stereo' ? 'active' : ''}
              onClick={() => onOutputModeChange('stereo')}
            >
              STEREO TC
            </button>
            <button
              type="button"
              className={outputMode === 'mono-l' ? 'active' : ''}
              onClick={() => onOutputModeChange('mono-l')}
            >
              L-TC / R-AUDIO
            </button>
          </div>
        </div>

        <div className="dt-field">
          <span className="dt-field-label">LEVEL</span>
          <div className="dt-segment">
            <button
              type="button"
              className={outputLevel === 'line' ? 'active' : ''}
              onClick={() => setOutputLevel('line')}
            >
              LINE
            </button>
            <button
              type="button"
              className={outputLevel === 'mic' ? 'active' : ''}
              onClick={() => setOutputLevel('mic')}
            >
              MIC (-20dB)
            </button>
          </div>
        </div>
      </DesktopPanel>

      <DesktopPanel title={tr('dt.timing')} scroll>
        <DesktopSection title="TC OFFSET">
          <div className="dt-inline dt-inline-spread">
            <span className="dt-field-label">FRAMES</span>
            <span className="dt-value-lg">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
          </div>
          <input
            type="range"
            className="dt-range"
            min="-10"
            max="10"
            step="1"
            value={outputOffset}
            onChange={e => setOutputOffset(parseInt(e.target.value, 10))}
            disabled={locked}
            aria-label="TC OFFSET (FRAMES)"
          />
          <div className="dt-range-scale">
            <span>-10</span><span>0</span><span>+10</span>
          </div>
          <p className="dt-hint">カメラとの微差をフレーム単位で補正します。</p>
        </DesktopSection>

        <DesktopSection title={tr('dt.metadata')}>
          <div className="dt-field">
            <span className="dt-field-label">{tr('label.startTc')}</span>
            <input
              className="dt-input dt-input-mono"
              value={manualTimecode}
              onChange={e => setManualTimecode(e.target.value)}
              disabled={isRunning || syncMode !== 'freerun'}
              placeholder="HH:MM:SS:FF"
              inputMode="numeric"
              maxLength={11}
            />
          </div>
          <div className="dt-field">
            <span className="dt-field-label">{tr('label.userBits')}</span>
            <span className="dt-readout">{userBits}{autoUserBits ? ' · AUTO' : ''}</span>
          </div>
          <p className="dt-hint">開始TCは FREE RUN 時のみ編集できます。</p>
        </DesktopSection>
      </DesktopPanel>

      {/* A camera operator needs the return feed on their default tab, not
          buried behind a section they would have to go looking for. */}
      {isClient && (
        <DesktopPanel title="RETURN" className="dt-panel-return">
          <ReturnMonitor
            stream={returnFeed.stream}
            sourceId={returnFeed.peerId}
            connected={isTallyConnected}
            onOpenFullscreen={() => {
              setDirectorPanelOpen(false);
              setIsVisualSlate(false);
              setTallyOpen(true);
            }}
            pipEnabled={pipEnabled}
            setPipEnabled={setPipEnabled}
          />
        </DesktopPanel>
      )}
    </div>
  );
}
