import Timecode from 'smpte-timecode';

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

type ExportFrameRate = { value: number; fpsNum: number; fpsDen: number; drop: boolean };

function xml(value: string): string {
  return [...value].filter(c => c.charCodeAt(0) >= 32 || '\r\n\t'.includes(c)).join('').replace(/[&<>"'\r\n\t]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    '\r': '&#13;', '\n': '&#10;', '\t': '&#9;',
  })[c]!);
}

export function buildFcpxml(markers: Marker[], fps: ExportFrameRate, isDropFrame = fps.drop): string {
  const ordered = [...markers].reverse();
  const frames = ordered.map(m => Timecode(m.tc, fps.value, isDropFrame).frameCount);
  const first = frames.length ? Math.min(...frames) : 0;
  const duration = frames.length ? Math.max(...frames) - first + 1 : 1;
  const time = (n: number) => `${n * fps.fpsDen}/${fps.fpsNum}s`;
  const entries = ordered.map((m, i) => `            <marker start="${time(frames[i])}" duration="${time(1)}" value="${xml(`Scene ${m.sceneName} Take ${m.take}`)}" note="${xml(m.comment)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="${time(1)}" width="1920" height="1080"/>
  </resources>
  <library>
    <event name="Phone TC">
      <project name="Logged Takes">
        <sequence format="r1" duration="${time(duration)}" tcStart="${time(first)}" tcFormat="${isDropFrame ? 'DF' : 'NDF'}">
          <spine>
            <gap name="Logged Takes" offset="${time(first)}" start="${time(first)}" duration="${time(duration)}">
${entries}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

export function buildResolveMarkers(markers: Marker[], fps: ExportFrameRate): string {
  let edl = `TITLE: Logged Takes\nFCM: ${fps.drop ? 'DROP FRAME' : 'NON-DROP FRAME'}\n\n`;
  [...markers].reverse().forEach((m, i) => {
    const start = Timecode(m.tc, fps.value, fps.drop);
    const end = Timecode(start.frameCount + 1, fps.value, fps.drop).toString();
    const name = sanitize(`Scene ${m.sceneName} Take ${m.take}${m.comment ? ` - ${m.comment}` : ''}`);
    edl += `${String(i + 1).padStart(3, '0')}  ${sanitize(m.reelName || 'AX').substring(0, 8).padEnd(8)} V     C        ${start.toString()} ${end} ${start.toString()} ${end}\n`;
    edl += ` |C:ResolveColor${m.color} |M:${name} |D:1\n\n`;
  });
  return edl;
}

const CSV_COLUMNS: { header: string; value: (marker: Marker) => string | number }[] = [
  { header: 'Scene', value: m => m.sceneName },
  { header: 'Take', value: m => m.take },
  { header: 'Timecode', value: m => m.tc },
  { header: 'Reel', value: m => m.reelName },
  { header: 'Color', value: m => m.color },
  { header: 'Time', value: m => m.time },
  { header: 'Comment', value: m => m.comment },
];

export function buildCsv(markers: Marker[]): string {
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [CSV_COLUMNS.map(c => cell(c.header)).join(','), ...[...markers].reverse().map(m =>
    CSV_COLUMNS.map(c => cell(c.value(m))).join(','))].join('\r\n') + '\r\n';
}
