// Pure builders for marker export formats (EDL / ALE). Kept free of DOM/Blob
// side effects so they can be unit-tested; the download wiring lives in App.tsx.

export type MarkerColor = 'Red' | 'Blue' | 'Green' | 'Yellow';

export interface Marker {
  id: number;
  tc: string;
  time: string;
  color: MarkerColor;
  reelName: string;
  take: number;
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
    const time = sanitize(m.time);
    edl += `${eventNum}  ${reel} V     C        ${tc} ${tc} ${tc} ${tc}\n`;
    edl += ` |C:ResolveColor${m.color} |M:Take ${m.take} (${reelLabel}) at ${time} |D:1\n\n`;
  });

  return edl;
}

/** Builds an Avid ALE string from logged markers. */
export function buildAle(markers: Marker[], fpsLabel: string): string {
  let ale = `Heading\nFIELD_DELIM\tTABS\nVIDEO_FORMAT\t1080\nFPS\t${fpsLabel}\n\nColumn\nName\tTracks\tStart\tEnd\tDescription\n\nData\n`;
  markers.forEach((m) => {
    ale += `Take ${m.take}\tV\t${m.tc}\t${m.tc}\t${m.color} marker at ${m.time}\n`;
  });
  return ale;
}
