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
