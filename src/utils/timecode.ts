import Timecode from 'smpte-timecode';

/**
 * timecode.ts — shared timecode/frame math used by the sync paths.
 *
 * The frame↔millisecond conversion and the "shift a TC string by N frames"
 * pattern were previously re-implemented in useLtcEngine, useNetworkSync and
 * LTCSyncContext with subtly different fallbacks. Keeping them here makes the
 * offset rules single-sourced.
 */

/** Duration of one frame at the given frame rate, in milliseconds. */
export function frameMs(fps: number): number {
  return 1000 / fps;
}

/**
 * Adds the user's output offset (in frames) to a network time offset (ms).
 * This is the single place that decides how outputOffset participates in
 * NTP-style syncs — both the manual and the periodic resync paths must use it.
 */
export function offsetMsWithOutputOffset(
  baseOffsetMs: number,
  outputOffsetFrames: number,
  fps: number,
): number {
  return baseOffsetMs + outputOffsetFrames * frameMs(fps);
}

/**
 * Parses an SMPTE timecode string into [hours, minutes, seconds, frames].
 *
 * Accepts ':' (non-drop-frame), ';' (drop-frame — this is what
 * smpte-timecode's toString() emits when dropFrame is set) and '.' field
 * separators. Splitting on ':' alone turns 'HH:MM:SS;FF' into
 * [h, m, NaN], which previously jammed NaN/undefined into the AudioWorklet
 * on every drop-frame session.
 *
 * Returns null unless exactly four finite numeric fields are present, so
 * jam paths can skip malformed strings instead of posting garbage.
 */
export function parseTcParts(tc: string): [number, number, number, number] | null {
  const parts = tc.split(/[:;.]/).map(Number);
  if (parts.length !== 4 || !parts.every((n) => Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3]];
}

/**
 * Returns `tcStr` shifted by `frames` frames (negative shifts backwards).
 * On unparseable input the original string is returned unchanged and a
 * warning is logged — callers previously disagreed on whether failures were
 * silent or warned.
 */
export function shiftTimecode(
  tcStr: string,
  frames: number,
  fps: number,
  dropFrame: boolean,
): string {
  try {
    const tc = Timecode(tcStr, fps, dropFrame);
    tc.add(frames);
    return tc.toString();
  } catch (e) {
    console.warn('Failed to shift timecode:', e);
    return tcStr;
  }
}
