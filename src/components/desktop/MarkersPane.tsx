import { useCallback } from 'react';
import { useLTC } from '../../LTCSyncContext';
import { DesktopPanel, DesktopSection } from './DesktopPanel';
import { MarkerSyncBadge } from '../MarkerSyncBadge';
import { MarkerTimeline } from '../MarkerTimeline';
import { FPS_OPTIONS } from '../../constants';
import { usePlayheadTc } from '../../hooks/usePlayheadTc';
import './markersPane.css';

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

  // Live TC lives in refs by design; the hook polls this getter at 125ms so
  // the timeline playhead glides instead of jumping twice a second.
  const getPlayheadTc = useCallback(() => {
    const engine = engineRef.current;
    return isRunning ? currentTcRef.current : (engine ? engine.getTimecodeString() : '');
  }, [isRunning, engineRef, currentTcRef]);
  const playheadTc = usePlayheadTc(getPlayheadTc);

  const fpsOption = FPS_OPTIONS[fpsIndex];

  return (
    <div className="dt-pane dt-pane-markers">
      <DesktopPanel title={tr('dt.control')} help="markers" className="dt-panel-control" scroll>
        <DesktopSection title={tr('dt.metadata')}>
          {/* Reel + scene are one pair of slate data — side by side they
              read together and save a field's worth of vertical space in
              the tight control column. */}
          <div className="dtv2-field-pair">
            <div className="dt-field">
              <span className="dt-field-label">{tr('label.defaultReel')}</span>
              <input
                className="dt-input dt-input-mono"
                value={defaultReelName}
                onChange={e => setDefaultReelName(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="A001"
              />
            </div>
            <div className="dt-field">
              <span className="dt-field-label">{tr('label.defaultScene')}</span>
              <input
                className="dt-input dt-input-mono"
                value={sceneName}
                onChange={e => setSceneName(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="001"
              />
            </div>
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
          <div className="dt-export-row dtv2-export">
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
        {/* A bordered rail sets the strip apart from the table below it;
            MarkerTimeline itself is shared markup, so only the wrapper
            and .desktop-view descendants carry the desktop styling. */}
        <div className="dtv2-timeline">
          <MarkerTimeline
            markers={markers}
            fps={fpsOption.value}
            drop={fpsOption.drop}
            onRecall={recallTimecode}
            tr={tr}
            currentTc={playheadTc}
          />
        </div>
        {markers.length === 0 ? (
          <div className="dt-empty">
            <strong>{tr('markers.none')}</strong>
            <span>{tr('dt.hint.markKeys')}</span>
          </div>
        ) : (
          <table className="dt-table dt-table-markers dtv2-markers-table">
            <thead>
              <tr>
                <th className="dtv2-num">#</th>
                <th>TC</th>
                <th>{tr('dt.scTk')}</th>
                <th>{tr('dt.color')}</th>
                <th>{tr('label.comment')}</th>
                <th className="dtv2-actions" />
              </tr>
            </thead>
            <tbody>
              {markers.map((marker, idx) => (
                <tr key={marker.id}>
                  <td className="dt-mono dtv2-num">{idx + 1}</td>
                  <td className="dt-mono dt-marker-tc dtv2-tc">{marker.tc}<br /><MarkerSyncBadge sync={marker.sync} tr={tr} /></td>
                  <td className="dt-mono dtv2-sctk">{tr('marker.sceneTake', { scene: marker.sceneName || '001', take: marker.take })}</td>
                  <td className="dtv2-color">
                    <span className={`dt-marker-dot ${marker.color.toLowerCase()}`} />
                    {marker.color}
                  </td>
                  <td className="dtv2-comment">
                    <input
                      className="dt-input dt-input-flush"
                      value={marker.comment || ''}
                      onChange={e => updateMarkerComment(marker.id, e.target.value)}
                      placeholder={tr('placeholder.comment')}
                      aria-label={`${tr('label.comment')} ${marker.tc}`}
                      maxLength={100}
                    />
                  </td>
                  <td className="dtv2-actions">
                    <button
                      type="button"
                      className="dt-btn-icon"
                      onClick={() => removeMarker(marker.id)}
                      aria-label={tr('marker.delete', { tc: marker.tc })}
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
