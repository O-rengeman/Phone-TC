import { useId } from 'react';

import { useLTC } from '../../LTCSyncContext';
import { FPS_OPTIONS, OUTPUT_OFFSET_MAX, OUTPUT_OFFSET_MIN } from '../../constants';
import { DesktopPanel, DesktopSection } from './DesktopPanel';
import { PresetsPanel } from '../PresetsPanel';
import './timecodePane.css';

interface TimecodePaneProps {
  onOutputModeChange: (mode: 'stereo' | 'mono-l') => void;
}

/**
 * Everything that decides what the generator puts out: frame rate, the audio
 * output form, and the frame offset. These are set up before a take and left
 * alone during it, which is why they live together and away from the
 * connection controls.
 *
 * Layout: one row of three control cards (FPS / OUTPUT / TIMING), a
 * full-width PRESETS shelf underneath that owns the pane's only internal
 * scroll region, and a shortcut legend pinned to the foot. The `dtv2-cell-*`
 * hooks place the cards explicitly; the geometry lives in timecodePane.css.
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

  const uid = useId();
  const outputModeLabelId = `${uid}-outmode`;
  const outputLevelLabelId = `${uid}-outlevel`;
  const offsetInputId = `${uid}-offset`;
  const startTcInputId = `${uid}-starttc`;
  const startTcHintId = `${uid}-starttc-hint`;
  const userBitsLabelId = `${uid}-userbits`;

  // The shortcut legend ships as one localized "KEY: action · KEY: action"
  // sentence; splitting it here turns it into per-key chips without touching
  // the i18n table. A segment without a ':' falls back to plain text.
  const keyHints = tr('dt.hint.transport')
    .split('·')
    .map(part => part.trim())
    .filter(Boolean);

  return (
    <div className="dt-pane dt-pane-timecode">
      <DesktopPanel
        className="dt-panel-control dtv2-cell-fps"
        title={tr('label.frameRate')}
        help="timecode"
        aside={locked ? <span className="dt-lock">{followsMaster ? tr('dt.followingMaster') : tr('dt.running')}</span> : undefined}
      >
        <div className="dt-fps-grid" role="group" aria-label={tr('label.frameRate')}>
          {FPS_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              className={`dt-chip dt-chip-lg ${fpsIndex === i ? 'active' : ''}`}
              onClick={() => setFpsIndex(i)}
              disabled={locked}
              aria-pressed={fpsIndex === i}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="dt-hint">{tr('dt.hint.fps')}</p>
      </DesktopPanel>

      <DesktopPanel className="dt-panel-control dtv2-cell-output" title={tr('dt.output')}>
        <div className="dt-field">
          <span className="dt-field-label" id={outputModeLabelId}>{tr('label.outputMode')}</span>
          <div className="dt-segment" role="group" aria-labelledby={outputModeLabelId}>
            <button
              type="button"
              className={outputMode === 'stereo' ? 'active' : ''}
              onClick={() => onOutputModeChange('stereo')}
              disabled={isRunning}
              aria-pressed={outputMode === 'stereo'}
            >
              {tr('out.stereoTc')}
            </button>
            <button
              type="button"
              className={outputMode === 'mono-l' ? 'active' : ''}
              onClick={() => onOutputModeChange('mono-l')}
              disabled={isRunning}
              aria-pressed={outputMode === 'mono-l'}
            >
              {tr('out.ltcRaudio')}
            </button>
          </div>
        </div>

        <div className="dt-field">
          <span className="dt-field-label" id={outputLevelLabelId}>{tr('dt.level')}</span>
          <div className="dt-segment" role="group" aria-labelledby={outputLevelLabelId}>
            <button
              type="button"
              className={outputLevel === 'line' ? 'active' : ''}
              onClick={() => setOutputLevel('line')}
              aria-pressed={outputLevel === 'line'}
            >
              LINE
            </button>
            <button
              type="button"
              className={outputLevel === 'mic' ? 'active' : ''}
              onClick={() => setOutputLevel('mic')}
              aria-pressed={outputLevel === 'mic'}
            >
              {tr('dt.mic')}
            </button>
          </div>
        </div>
      </DesktopPanel>

      <DesktopPanel className="dt-panel-control dtv2-cell-timing" title={tr('dt.timing')}>
        <DesktopSection title={tr('dt.tcOffset')}>
          <div className="dt-inline dt-inline-spread">
            <label className="dt-field-label" htmlFor={offsetInputId}>{tr('dt.frames')}</label>
            <span className="dt-value-lg">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
          </div>
          <input
            type="range"
            id={offsetInputId}
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
            <label className="dt-field-label" htmlFor={startTcInputId}>{tr('label.startTc')}</label>
            <input
              id={startTcInputId}
              className="dt-input dt-input-mono"
              value={manualTimecode}
              onChange={e => setManualTimecode(e.target.value)}
              disabled={isRunning || syncMode !== 'freerun'}
              placeholder="HH:MM:SS:FF"
              inputMode="numeric"
              maxLength={11}
              aria-describedby={startTcHintId}
            />
          </div>
          <div className="dt-field" role="group" aria-labelledby={userBitsLabelId}>
            <span className="dt-field-label" id={userBitsLabelId}>{tr('label.userBits')}</span>
            <span className="dt-readout">{userBits}{autoUserBits ? ' · AUTO' : ''}</span>
          </div>
          <p className="dt-hint" id={startTcHintId}>{tr('dt.hint.startTc')}</p>
        </DesktopSection>
      </DesktopPanel>

      <DesktopPanel
        className="dt-panel-control dtv2-cell-presets"
        title={tr('preset.title')}
        scroll
      >
        <PresetsPanel />
      </DesktopPanel>

      <div className="dt-hint dt-hint-keys dtv2-keylegend">
        {keyHints.map(hint => {
          const sep = hint.indexOf(':');
          if (sep === -1) {
            return <span key={hint} className="dtv2-key">{hint}</span>;
          }
          return (
            <span key={hint} className="dtv2-key">
              <kbd className="dtv2-kbd">{hint.slice(0, sep).trim()}</kbd>
              <span className="dtv2-key-desc">{hint.slice(sep + 1).trim()}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
