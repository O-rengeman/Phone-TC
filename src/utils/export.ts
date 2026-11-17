// Pure builders for marker export formats (EDL / ALE). Kept free of DOM/Blob
// side effects so they can be unit-tested; the download wiring lives in App.tsx.

import type { DriftConfidence } from './DriftMonitor';

export type MarkerColor = 'Red' | 'Blue' | 'Green' | 'Yellow';

export interface MarkerSync {
  method: 'network' | 'p2p' | 'system' | 'freerun';
  driftMs: number | null;
  driftFrames: number | null;
  msSinceSync: number | null;
  confidence: DriftConfidence | 'none';
}

export interface Marker {
  id: number;
  tc: string;
  time: string;
  color: MarkerColor;
  reelName: string;
  take: number;
  sceneName: string;
  comment: string;
  sync?: MarkerSync;
}

/** Strips characters that would corrupt the line-based EDL/ALE layout. */
function sanitize(s: string): string {
  return s.replace(/[\r\n\t]/g, '');
}

/**
 * Builds a CMX3600-style EDL string from logged markers.
 * Markers are emitted in chronological order (oldest first).
 */
export function buildEdl(markers: Marker[], isDropFrame: boolean): string {
  const fcm = isDropFrame ? 'DROP FRAME' : 'NON-DROP FRAME';
  let edl = `TITLE: Logged Takes\nFCM: ${fcm}\n\n`;

  // App stores newest-first; reverse so the EDL reads oldest-first.
  const ordered = [...markers].reverse();
  ordered.forEach((m, index) => {
    const eventNum = String(index + 1).padStart(3, '0');
    const reel = sanitize(m.reelName || 'AX').substring(0, 8).padEnd(8);
    const tc = sanitize(m.tc);
    const reelLabel = sanitize(m.reelName || 'AX');
    const sceneLabel = sanitize(m.sceneName || '001');
    const time = sanitize(m.time);
    const commentLabel = m.comment ? ` |N:${sanitize(m.comment)}` : '';
    edl += `${eventNum}  ${reel} V     C        ${tc} ${tc} ${tc} ${tc}\n`;
    edl += ` |C:ResolveColor${m.color} |M:Scene ${sceneLabel} Take ${m.take} (${reelLabel}) at ${time}${commentLabel} |D:1\n\n`;
  });

  return edl;
}

/** Builds an Avid ALE string from logged markers. */
export function buildAle(markers: Marker[], fpsLabel: string): string {
  const safeFps = sanitize(fpsLabel);
  let ale = `Heading\nFIELD_DELIM\tTABS\nVIDEO_FORMAT\t1080\nFPS\t${safeFps}\n\nColumn\nName\tTracks\tStart\tEnd\tScene\tTake\tDescription\tSync_Method\tSync_Drift_ms\tSync_Drift_Frames\tSync_Age_s\tSync_Confidence\n\nData\n`;
  markers.forEach((m) => {
    // Same sanitization rule as EDL: user-entered scene names/comments can
    // contain tabs/newlines that would corrupt the TAB-delimited ALE rows.
    const scene = sanitize(m.sceneName);
    const commentPart = m.comment ? ` - ${sanitize(m.comment)}` : '';
    const numeric = (value: number | null) => value !== null && Number.isFinite(value) ? String(value) : '';
    const sync = m.sync;
    const syncFields = sync ? [sanitize(sync.method), numeric(sync.driftMs), numeric(sync.driftFrames), numeric(sync.msSinceSync === null ? null : sync.msSinceSync / 1000), sanitize(sync.confidence)] : ['', '', '', '', ''];
    ale += `Scene ${scene} Take ${m.take}\tV\t${sanitize(m.tc)}\t${sanitize(m.tc)}\t${scene}\t${m.take}\t${m.color} marker at ${sanitize(m.time)}${commentPart}\t${syncFields.join('\t')}\n`;
  });
  return ale;
}
