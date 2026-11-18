import { useMemo } from 'react';

import type { Marker } from '../utils/export';
import {
  liveMarkerTimelineLayout,
  markerTimelineLayout,
  parseTcFrame,
} from '../utils/markerTimeline';
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
   * parents that don't poll a live TC simply omit it and get the static
   * marker-span distribution instead.
   */
  currentTc?: string;
}

/**
 * Horizontal strip of the logged takes: each marker is a coloured dot placed
 * at its timecode position on a shared track. Tapping a dot recalls that
 * timecode via onRecall (the context's recallTimecode).
 *
 * When `currentTc` parses, the strip becomes a live follow window: the
 * playhead stays pinned at the layout's anchor (~75% across — past behind,
 * near-future ahead) while the dots flow left as time advances, so the strip
 * always looks alive while running. Without a parseable `currentTc` it falls
 * back to the legacy fixed marker-span distribution with no playhead, and
 * renders nothing only when that path has no parseable markers.
 */
export function MarkerTimeline({ markers, fps, drop, onRecall, tr, currentTc }: MarkerTimelineProps) {
  const state = useMemo(() => {
    const currentFrame = currentTc ? parseTcFrame(currentTc, fps, drop) : null;
    if (currentFrame !== null) {
      return {
        live: true as const,
        layout: liveMarkerTimelineLayout(markers, fps, drop, currentFrame),
      };
    }
    return { live: false as const, layout: markerTimelineLayout(markers, fps, drop) };
  }, [markers, fps, drop, currentTc]);

  // The live path renders even with zero items — an empty track with the
  // pinned playhead is correct while running. Only the legacy path may bail
  // out when no marker TC parses.
  if (!state.live && state.layout.items.length === 0) return null;

  const playheadPct = state.live ? state.layout.playheadPct : null;

  return (
    <div className="mtl" role="group" aria-label={tr('tl.aria')}>
      <div className="mtl-track">
        <span className="mtl-line" aria-hidden="true" />
        {state.layout.items.map(item => {
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
