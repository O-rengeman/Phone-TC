import { useEffect, useState } from 'react';
import { HelpButton } from './HelpButton';
import type { Marker } from '../utils/export';
import { MarkerSyncBadge } from './MarkerSyncBadge';
import { MarkerTimeline } from './MarkerTimeline';
import { FPS_OPTIONS } from '../constants';
import './mobileTools.css';

// Playhead refresh for the timeline strip — the live TC lives in refs by
// design (no per-frame context state), so poll it at a lazy 2Hz.
const PLAYHEAD_POLL_MS = 500;

interface MarkerListProps {
  markers: Marker[];
  addMarker: (color: Marker['color']) => void;
  removeMarker: (id: Marker['id']) => void;
  updateMarkerComment: (id: Marker['id'], comment: string) => void;
  exportToEDL: () => void;
  exportToALE: () => void;
  exportToFCPXML: () => void;
  exportToResolve: () => void;
  exportToCSV: () => void;
  exportToOTIO: () => void;
  /** Timeline dot tap → context recallTimecode(marker.tc). */
  recallTimecode: (tc: string) => void;
  fpsIndex: number;
  /** Live TC source for the playhead; omit to hide it. */
  getCurrentTc?: () => string;
  isMobile: boolean;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

export function MarkerList({
  markers,
  addMarker,
  removeMarker,
  updateMarkerComment,
  exportToEDL,
  exportToALE,
  exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO,
  recallTimecode,
  fpsIndex,
  getCurrentTc,
  isMobile,
  tr,
}: MarkerListProps) {
  const [playheadTc, setPlayheadTc] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!getCurrentTc) return;
    const tick = () => setPlayheadTc(getCurrentTc());
    tick();
    const id = window.setInterval(tick, PLAYHEAD_POLL_MS);
    return () => window.clearInterval(id);
  }, [getCurrentTc]);

  const fpsOption = FPS_OPTIONS[fpsIndex];

  return (
    <>
      {isMobile && (
        <section className="tool-section-shell tool-section-shell-marks quick-marks-v2">
          <div className="control-section mobile-marker-section">
            <label className="section-label">{tr('label.quickMark')}</label>
            <div className="marker-buttons-grid">
              <button className="btn-mark-large red" onClick={() => addMarker('Red')}>
                <span className="qmk-swatch" aria-hidden="true" />
                <span className="qmk-label">{tr('color.red')}</span>
              </button>
              <button className="btn-mark-large blue" onClick={() => addMarker('Blue')}>
                <span className="qmk-swatch" aria-hidden="true" />
                <span className="qmk-label">{tr('color.blue')}</span>
              </button>
              <button className="btn-mark-large green" onClick={() => addMarker('Green')}>
                <span className="qmk-swatch" aria-hidden="true" />
                <span className="qmk-label">{tr('color.green')}</span>
              </button>
              <button className="btn-mark-large yellow" onClick={() => addMarker('Yellow')}>
                <span className="qmk-swatch" aria-hidden="true" />
                <span className="qmk-label">{tr('color.yellow')}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <section className={`tool-section-shell marker-section-pro${isMobile ? ' take-log-v2' : ''}`}>
        <div className={`marker-header${isMobile ? ' take-log-head-v2' : ''}`}>
          <label>
            {tr('label.loggedTakes')}
            <HelpButton topic="markers" tr={tr} variant="inline" />
          </label>
          <div className={isMobile ? 'export-group export-chips-v2' : 'export-group'}>
            <button className="btn-export-pro" onClick={exportToEDL} disabled={markers.length === 0}>EDL</button>
            <button className="btn-export-pro" onClick={exportToALE} disabled={markers.length === 0}>ALE</button>
            <button className="btn-export-pro" onClick={exportToFCPXML} disabled={markers.length === 0}>FCPXML</button>
            <button className="btn-export-pro" onClick={exportToResolve} disabled={markers.length === 0}>Resolve</button>
            <button className="btn-export-pro" onClick={exportToCSV} disabled={markers.length === 0}>CSV</button>
            <button className="btn-export-pro" onClick={exportToOTIO} disabled={markers.length === 0}>OTIO</button>
          </div>
        </div>
        <div className={isMobile ? 'mtl-v2' : undefined}>
          <MarkerTimeline
            markers={markers}
            fps={fpsOption.value}
            drop={fpsOption.drop}
            onRecall={recallTimecode}
            tr={tr}
            currentTc={getCurrentTc ? playheadTc : undefined}
          />
        </div>
        <div className={isMobile ? 'marker-scroll marker-scroll-v2' : 'marker-scroll'}>
          {markers.length === 0 ? (
            <div className="empty-msg">{tr('markers.none')}</div>
          ) : (
            markers.map(m => (
              <div key={m.id} className={`marker-row-pro${isMobile ? ' marker-row-v2' : ''}`}>
                <div className="marker-row-top">
                  <div className="marker-row-left">
                    <div className={`color-dot ${m.color.toLowerCase()}`}>{m.color.charAt(0)}</div>
                    <div className="m-id-block">
                      <span className="m-tc">{m.tc}</span>
                      <span className="m-take">
                        {tr('marker.sceneTake', { scene: m.sceneName || '001', take: m.take })}
                      </span>
                    </div>
                  </div>
                  <div className="marker-row-right">
                    <span className="m-time">{m.time}</span>
                    <button className="btn-delete-marker" onClick={() => removeMarker(m.id)}>✕</button>
                  </div>
                </div>
                <div className={`marker-comment-row${isMobile ? ' m-comment-v2' : ''}`}>
                  <MarkerSyncBadge sync={m.sync} tr={tr} />
                  <input
                    type="text"
                    className="marker-comment-input"
                    value={m.comment || ''}
                    onChange={(e) => updateMarkerComment(m.id, e.target.value)}
                    placeholder={tr('placeholder.comment')}
                    maxLength={100}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
