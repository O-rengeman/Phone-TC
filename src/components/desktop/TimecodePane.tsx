import { useLTC } from '../../LTCSyncContext';
import { FPS_OPTIONS, OUTPUT_OFFSET_MAX, OUTPUT_OFFSET_MIN } from '../../constants';
import { DesktopPanel, DesktopSection } from './DesktopPanel';
import { PresetsPanel } from '../PresetsPanel';

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
    tr,
  } = useLTC();

  // A client follows its master's frame rate and offset; letting the operator
  // change them here would be silently overwritten on the next heartbeat.
  const followsMaster = syncMode === 'p2p' && p2pRole === 'client';
  const locked = isRunning || followsMaster;

  return (
    <div className="dt-pane dt-pane-timecode">
      <DesktopPanel
        title={tr('label.frameRate')}
        help="timecode"
        aside={locked ? <span className="dt-lock">{followsMaster ? tr('dt.followingMaster') : tr('dt.running')}</span> : undefined}
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
        <p className="dt-hint">{tr('dt.hint.fps')}</p>
      </DesktopPanel>

      <DesktopPanel title={tr('dt.output')}>
        <div className="dt-field">
          <span className="dt-field-label">{tr('label.outputMode')}</span>
          <div className="dt-segment">
            <button
              type="button"
              className={outputMode === 'stereo' ? 'active' : ''}
              onClick={() => onOutputModeChange('stereo')}
              disabled={isRunning}
            >
              {tr('out.stereoTc')}
            </button>
            <button
              type="button"
              className={outputMode === 'mono-l' ? 'active' : ''}
              onClick={() => onOutputModeChange('mono-l')}
              disabled={isRunning}
            >
              {tr('out.ltcRaudio')}
            </button>
          </div>
        </div>

        <div className="dt-field">
          <span className="dt-field-label">{tr('dt.level')}</span>
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
              {tr('dt.mic')}
            </button>
          </div>
        </div>
      </DesktopPanel>

      <DesktopPanel title={tr('dt.timing')} scroll>
        <DesktopSection title={tr('dt.tcOffset')}>
          <div className="dt-inline dt-inline-spread">
            <span className="dt-field-label">{tr('dt.frames')}</span>
            <span className="dt-value-lg">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
          </div>
          <input
            type="range"
            className="dt-range"
            min={OUTPUT_OFFSET_MIN}
            max={OUTPUT_OFFSET_MAX}
            step="1"
            value={outputOffset}
            onChange={e => setOutputOffset(parseInt(e.target.value, 10))}
            disabled={locked}
            aria-label={tr('cm.tcOffset')}
          />
          <div className="dt-range-scale">
            <span>{OUTPUT_OFFSET_MIN}</span><span>0</span><span>+{OUTPUT_OFFSET_MAX}</span>
          </div>
          <p className="dt-hint">{tr('dt.hint.offset')}</p>
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
          <p className="dt-hint">{tr('dt.hint.startTc')}</p>
        </DesktopSection>

        <DesktopSection title={tr('preset.title')}>
          <PresetsPanel />
        </DesktopSection>

        <p className="dt-hint dt-hint-keys">{tr('dt.hint.transport')}</p>
      </DesktopPanel>
    </div>
  );
}
