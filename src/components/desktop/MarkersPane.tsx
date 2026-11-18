import { useEffect, useState } from 'react';
import { useLTC } from '../../LTCSyncContext';
import { DesktopPanel, DesktopSection } from './DesktopPanel';
import { MarkerSyncBadge } from '../MarkerSyncBadge';
import { MarkerTimeline } from '../MarkerTimeline';
import { FPS_OPTIONS } from '../../constants';

// Playhead refresh — the live TC lives in refs by design, so poll lazily.
const PLAYHEAD_POLL_MS = 500;

/**
 * The take log: markers laid down during a shot, the metadata that ends up in
 * the exported EDL/ALE, and the export actions themselves. Kept off the
 * timecode tab because it is reviewed between takes, not during one.
 *
 * Controls come first in the markup so they land in the left column like
 * every other tab, which also puts them first in keyboard tab order.
 */
export function MarkersPane() {
  const {
    markers, removeMarker, updateMarkerComment, exportToEDL, exportToALE,
    exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO,
    recallTimecode, fpsIndex, isRunning, engineRef, currentTcRef,
    defaultReelName, setDefaultReelName, sceneName, setSceneName,
    userBits, setUserBits, autoUserBits, setAutoUserBits,
    tr,
  } = useLTC();

  const [playheadTc, setPlayheadTc] = useState('');
  useEffect(() => {
    const tick = () => {
      const engine = engineRef.current;
      setPlayheadTc(isRunning ? currentTcRef.current : (engine ? engine.getTimecodeString() : ''));
    };
    tick();
    const id = window.setInterval(tick, PLAYHEAD_POLL_MS);
    return () => window.clearInterval(id);
  }, [isRunning, engineRef, currentTcRef]);

  const fpsOption = FPS_OPTIONS[fpsIndex];

  return (
    <div className="dt-pane dt-pane-markers">
      <DesktopPanel title={tr('dt.control')} help="markers" className="dt-panel-control" scroll>
        <DesktopSection title={tr('dt.metadata')}>
          <div className="dt-field">
            <span className="dt-field-label">{tr('label.defaultReel')}</span>
            <input
              className="dt-input"
              value={defaultReelName}
              onChange={e => setDefaultReelName(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="A001"
            />
          </div>
          <div className="dt-field">
            <span className="dt-field-label">{tr('label.defaultScene')}</span>
            <input
              className="dt-input"
              value={sceneName}
              onChange={e => setSceneName(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="001"
            />
          </div>
          <div className="dt-field">
            <span className="dt-field-label">{tr('label.userBits')}</span>
            <div className="dt-inline">
              <input
                className="dt-input dt-input-mono"
                value={userBits}
                onChange={e => setUserBits(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                maxLength={8}
                disabled={autoUserBits}
              />
              <button
                type="button"
                className={`dt-chip ${autoUserBits ? 'active' : ''}`}
                onClick={() => setAutoUserBits(!autoUserBits)}
              >
                {tr('btn.auto')}
              </button>
            </div>
          </div>
        </DesktopSection>

        <DesktopSection title={tr('dt.export')}>
          <div className="dt-export-row">
            <button type="button" className="dt-btn" onClick={exportToEDL} disabled={markers.length === 0}>
              EDL
            </button>
            <button type="button" className="dt-btn" onClick={exportToALE} disabled={markers.length === 0}>
              ALE
            </button>
            <button type="button" className="dt-btn" onClick={exportToFCPXML} disabled={markers.length === 0}>FCPXML</button>
            <button type="button" className="dt-btn" onClick={exportToResolve} disabled={markers.length === 0}>Resolve</button>
            <button type="button" className="dt-btn" onClick={exportToCSV} disabled={markers.length === 0}>CSV</button>
            <button type="button" className="dt-btn" onClick={exportToOTIO} disabled={markers.length === 0}>OTIO</button>
          </div>
          <p className="dt-hint">{tr('dt.hint.reelScene')}</p>
        </DesktopSection>
      </DesktopPanel>

      <DesktopPanel
        title={tr('label.loggedTakes')}
        aside={<span className="dt-count">{markers.length}</span>}
        grow
        scroll
      >
        <MarkerTimeline
          markers={markers}
          fps={fpsOption.value}
          drop={fpsOption.drop}
          onRecall={recallTimecode}
          tr={tr}
          currentTc={playheadTc}
        />
        {markers.length === 0 ? (
          <div className="dt-empty">
            <strong>{tr('markers.none')}</strong>
            <span>{tr('dt.hint.markKeys')}</span>
          </div>
        ) : (
          <table className="dt-table dt-table-markers">
            <thead>
              <tr>
                <th>#</th>
                <th>TC</th>
                <th>{tr('dt.scTk')}</th>
                <th>{tr('dt.color')}</th>
                <th>{tr('label.comment')}</th>
                <th aria-label="remove" />
              </tr>
            </thead>
            <tbody>
              {markers.map((marker, idx) => (
                <tr key={marker.id}>
                  <td className="dt-mono">{idx + 1}</td>
                  <td className="dt-mono dt-marker-tc">{marker.tc}<br /><MarkerSyncBadge sync={marker.sync} tr={tr} /></td>
                  <td className="dt-mono">{tr('marker.sceneTake', { scene: marker.sceneName || '001', take: marker.take })}</td>
                  <td>
                    <span className={`dt-marker-dot ${marker.color.toLowerCase()}`} />
                    {marker.color}
                  </td>
                  <td>
                    <input
                      className="dt-input dt-input-flush"
                      value={marker.comment || ''}
                      onChange={e => updateMarkerComment(marker.id, e.target.value)}
                      placeholder={tr('placeholder.comment')}
                      maxLength={100}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="dt-btn-icon"
                      onClick={() => removeMarker(marker.id)}
                      aria-label={`delete marker ${marker.tc}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DesktopPanel>
    </div>
  );
}
