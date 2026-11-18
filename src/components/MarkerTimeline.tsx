import { useMemo } from 'react';

import type { Marker } from '../utils/export';
import { markerTimelineLayout, parseTcFrame } from '../utils/markerTimeline';
import { MARKER_HEX } from '../constants';
import './markerTimeline.css';

interface MarkerTimelineProps {
  markers: Marker[];
  /** FPS_OPTIONS[fpsIndex].value — the smpte-timecode rate (e.g. 29.97). */
  fps: number;
  /** FPS_OPTIONS[fpsIndex].drop — drop-frame counting for positions. */
  drop: boolean;
  /** Called with the marker's TC when its dot is tapped. */
  onRecall: (tc: string) => void;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  /**
   * Live "HH:MM:SS:FF" (or ';' DF variant) shown as a playhead. Optional —
   * parents that don't poll a live TC simply omit it.
   */
  currentTc?: string;
}

/**
 * Horizontal strip of the logged takes: each marker is a coloured dot placed
 * at its timecode position on a shared track. Tapping a dot recalls that
 * timecode via onRecall (the context's recallTimecode). Renders nothing when
 * no marker has a parseable TC — mounting is the parent's decision.
 */
export function MarkerTimeline({ markers, fps, drop, onRecall, tr, currentTc }: MarkerTimelineProps) {
  const layout = useMemo(
    () => markerTimelineLayout(markers, fps, drop),
    [markers, fps, drop],
  );

  const playheadPct = useMemo(() => {
    if (!currentTc || layout.items.length === 0) return null;
    const frame = parseTcFrame(currentTc, fps, drop);
    if (frame === null) return null;
    const span = layout.viewMaxFrame - layout.viewMinFrame;
    if (span <= 0) return null;
    return Math.min(100, Math.max(0, ((frame - layout.viewMinFrame) / span) * 100));
  }, [currentTc, fps, drop, layout]);

  if (layout.items.length === 0) return null;

  return (
    <div className="mtl" role="group" aria-label={tr('tl.aria')}>
      <div className="mtl-track">
        <span className="mtl-line" aria-hidden="true" />
        {layout.items.map(item => {
          const marker = item.marker;
          const label = tr('tl.dotLabel', {
            tc: item.tc,
            scene: marker.sceneName || '001',
            take: marker.take,
            comment: marker.comment ? ` — ${marker.comment}` : '',
          });
          return (
            <button
              key={marker.id}
              type="button"
              className="mtl-dot"
              style={{ left: `${item.leftPct}%` }}
              title={label}
              aria-label={label}
              onClick={() => onRecall(item.tc)}
            >
              <span
                className="mtl-dot-fill"
                style={{ backgroundColor: MARKER_HEX[marker.color] ?? '#9ca3af' }}
              />
            </button>
          );
        })}
        {playheadPct !== null && (
          <span className="mtl-playhead" style={{ left: `${playheadPct}%` }} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
