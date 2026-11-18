import Timecode from 'smpte-timecode';

// Pure builder for OpenTimelineIO (OTIO) export. Emits a Timeline.1 document
// whose single Video track holds one Marker.1 clip per logged take, positioned
// by marked_range on the rational frame rate. Kept DOM/Blob-free like the
// other builders in export.ts — the download wiring lives in useMarkers.ts.

import type { Marker, MarkerSync } from './export';

export interface OtioFrameRate {
  value: number;
  fpsNum: number;
  fpsDen: number;
  drop: boolean;
}

/** Same rule as buildAle: non-finite/null numerics export as empty. */
const numeric = (value: number | null) =>
  value !== null && Number.isFinite(value) ? String(value) : '';

/** Mirrors the five Sync_* columns buildAle appends to each ALE row. */
function syncComment(sync: MarkerSync | undefined): string {
  if (!sync) return '';
  const ageSeconds = sync.msSinceSync === null ? null : sync.msSinceSync / 1000;
  return ` | sync method=${sync.method} driftMs=${numeric(sync.driftMs)}`
    + ` driftFrames=${numeric(sync.driftFrames)} ageS=${numeric(ageSeconds)}`
    + ` confidence=${sync.confidence}`;
}

/**
 * Builds an OTIO JSON string from logged markers.
 * Markers are emitted oldest-first (the app stores newest-first).
 */
export function buildOtio(markers: Marker[], fps: OtioFrameRate): string {
  // RationalTime rate is fpsNum/fpsDen so 29.97 (DF or NDF) exports as the
  // exact 30000/1001 rate OTIO readers expect instead of a rounded 29.97.
  const rate = fps.fpsNum / fps.fpsDen;
  const children = [...markers].reverse().map(m => {
    const frames = Timecode(m.tc, fps.value, fps.drop).frameCount;
    const comment = `TC ${m.tc} | ${m.time} | ${m.color}`
      + `${m.comment ? ` | ${m.comment}` : ''}${syncComment(m.sync)}`;
    return {
      OTIO_SCHEMA: 'Marker.1',
      name: `Scene ${m.sceneName} Take ${m.take} — ${m.color}`,
      comment,
      // TimeRange.1: a one-frame marker at the take's timecode position.
      marked_range: {
        start_time: { value: frames, rate },
        duration: { value: 1, rate },
      },
    };
  });

  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Phone TC — Logged Takes',
    metadata: {
      app: 'LTC SYNC PRO',
      fps: `${fps.fpsNum}/${fps.fpsDen}`,
      dropFrame: fps.drop,
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          kind: 'Video',
          children,
        },
      ],
    },
  }, null, 2);
}
