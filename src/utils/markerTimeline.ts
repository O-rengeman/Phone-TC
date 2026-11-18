import Timecode from 'smpte-timecode';

// Pure layout math for <MarkerTimeline>: turns logged markers into
// percentage positions on a single horizontal track. No DOM/React here so it
// stays unit-testable like the export builders.

import type { Marker } from './export';

export interface MarkerTimelineItem {
  marker: Marker;
  /** The marker's own TC string (what recallTimecode consumes). */
  tc: string;
  /** Absolute frame count the position was computed from. */
  frame: number;
  /** Horizontal position across the padded range, 0–100. */
  leftPct: number;
}

export interface MarkerTimelineLayout {
  /** Oldest→newest, left→right. */
  items: MarkerTimelineItem[];
  /** Actual marker frame bounds (before padding). */
  minFrame: number;
  maxFrame: number;
  /** Padded view bounds that leftPct is relative to. */
  viewMinFrame: number;
  viewMaxFrame: number;
  /** Markers skipped because their TC string did not parse. */
  skippedCount: number;
}

/** Seconds of timeline shown behind the playhead in the live follow window. */
export const LIVE_TIMELINE_PAST_SECONDS = 120;
/** Seconds of near-future timeline shown ahead of the playhead. */
export const LIVE_TIMELINE_FUTURE_SECONDS = 40;

export interface LiveTimelineOptions {
  /** Override for the past window width, in frames. */
  pastFrames?: number;
  /** Override for the future window width, in frames. */
  futureFrames?: number;
}

export interface LiveMarkerTimelineLayout {
  /** Oldest→newest, left→right; only markers inside the view window. */
  items: MarkerTimelineItem[];
  /** Playhead anchor across the track, 0–100 (75 with default windows). */
  playheadPct: number;
  /** Sliding view bounds that leftPct is relative to. */
  viewMinFrame: number;
  viewMaxFrame: number;
  /** Markers skipped because their TC string did not parse. */
  skippedCount: number;
  /** Parseable markers outside the view window (omitted from items). */
  outsideCount: number;
}

/**
 * Parses "HH:MM:SS:FF" (also accepts the ';'/'.' separators smpte-timecode
 * allows) into an absolute frame count. Returns null instead of throwing so
 * callers can skip corrupt stored markers.
 */
export function parseTcFrame(tc: string, fps: number, drop: boolean): number | null {
  try {
    return Timecode(tc, fps, drop).frameCount;
  } catch {
    return null;
  }
}

const EMPTY_LAYOUT: MarkerTimelineLayout = {
  items: [],
  minFrame: 0,
  maxFrame: 0,
  viewMinFrame: 0,
  viewMaxFrame: 1,
  skippedCount: 0,
};

/**
 * Lays markers out on a 0–100% track.
 *
 * Positions come from smpte-timecode frameCount (same math as the exporters),
 * so drop-frame labels land correctly. The visible range is the marker span
 * padded ~5% on each side (minimum 1 frame of pad) so edge markers aren't
 * flush against the strip ends; a single marker still renders, centred.
 */
export function markerTimelineLayout(
  markers: Marker[],
  fps: number,
  drop: boolean,
): MarkerTimelineLayout {
  const parsed: { marker: Marker; frame: number }[] = [];
  let skippedCount = 0;
  for (const marker of markers) {
    const frame = parseTcFrame(marker.tc, fps, drop);
    if (frame === null) {
      skippedCount += 1;
      console.warn(`markerTimelineLayout: skipping marker ${marker.id} with unparseable TC "${marker.tc}"`);
    } else {
      parsed.push({ marker, frame });
    }
  }
  if (parsed.length === 0) {
    return { ...EMPTY_LAYOUT, skippedCount };
  }

  // Reverse first so same-frame ties keep oldest→newest order (the app stores
  // markers newest-first), then stable-sort by frame.
  const ordered = [...parsed].reverse().sort((a, b) => a.frame - b.frame);
  const frames = ordered.map(p => p.frame);
  const minFrame = Math.min(...frames);
  const maxFrame = Math.max(...frames);

  const rawSpan = maxFrame - minFrame;
  const pad = Math.max(1, Math.round(rawSpan * 0.05));
  const viewMinFrame = minFrame - pad;
  const viewMaxFrame = maxFrame + pad;
  const viewSpan = Math.max(1, viewMaxFrame - viewMinFrame);

  const items = ordered.map(({ marker, frame }) => ({
    marker,
    tc: marker.tc,
    frame,
    leftPct: ((frame - viewMinFrame) / viewSpan) * 100,
  }));

  return { items, minFrame, maxFrame, viewMinFrame, viewMaxFrame, skippedCount };
}

/**
 * Lays markers out on a live "follow" window that tracks the current TC.
 *
 * The visible range is [currentFrame - pastFrames, currentFrame + futureFrames]
 * (default: 120s behind / 40s ahead) so the playhead is anchored at
 * past/(past+future) ≈ 75% of the track — past takes flow left while running
 * and the strip always moves. Markers outside the window are omitted from
 * items and counted in outsideCount; since the window slides instead of the
 * playhead clamping, the head never pins at the right edge.
 */
export function liveMarkerTimelineLayout(
  markers: Marker[],
  fps: number,
  drop: boolean,
  currentFrame: number,
  options: LiveTimelineOptions = {},
): LiveMarkerTimelineLayout {
  const pastFrames = options.pastFrames ?? Math.round(LIVE_TIMELINE_PAST_SECONDS * fps);
  const futureFrames = options.futureFrames ?? Math.round(LIVE_TIMELINE_FUTURE_SECONDS * fps);

  const viewMinFrame = currentFrame - pastFrames;
  const viewMaxFrame = currentFrame + futureFrames;
  const viewSpan = Math.max(1, viewMaxFrame - viewMinFrame);
  const playheadPct = (pastFrames / Math.max(1, pastFrames + futureFrames)) * 100;

  const parsed: { marker: Marker; frame: number }[] = [];
  let skippedCount = 0;
  for (const marker of markers) {
    const frame = parseTcFrame(marker.tc, fps, drop);
    if (frame === null) {
      skippedCount += 1;
      console.warn(`liveMarkerTimelineLayout: skipping marker ${marker.id} with unparseable TC "${marker.tc}"`);
    } else {
      parsed.push({ marker, frame });
    }
  }

  // Reverse first so same-frame ties keep oldest→newest order (the app stores
  // markers newest-first), then stable-sort by frame.
  const ordered = [...parsed].reverse().sort((a, b) => a.frame - b.frame);

  const items: MarkerTimelineItem[] = [];
  let outsideCount = 0;
  for (const { marker, frame } of ordered) {
    if (frame < viewMinFrame || frame > viewMaxFrame) {
      outsideCount += 1;
      continue;
    }
    items.push({
      marker,
      tc: marker.tc,
      frame,
      leftPct: ((frame - viewMinFrame) / viewSpan) * 100,
    });
  }

  return { items, playheadPct, viewMinFrame, viewMaxFrame, skippedCount, outsideCount };
}
