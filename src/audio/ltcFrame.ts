// Pure SMPTE LTC frame logic, extracted from the AudioWorklet processor so it
// can be unit tested outside the AudioWorklet sandbox (jsdom/node cannot
// instantiate AudioWorkletProcessor or run worklet modules).
//
// These functions are self-contained by design: no imports, no closures over
// outer scope, only their own parameters and locals. This is required because
// ltcWorkletSource.ts re-serializes them via Function.prototype.toString()
// and splices the resulting source into the worklet's script text — anything
// referencing an import or an enclosing variable would be undefined inside
// that reassembled scope.

export interface TimecodeState {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
}

/** SMPTE drop-frame: :00 and :01 are invalid at the start of non-10th minutes. */
export function normalizeDropFrame(
  isDrop: boolean,
  minutes: number,
  seconds: number,
  frames: number,
): number {
  if (isDrop && minutes % 10 !== 0 && seconds === 0 && frames < 2) {
    return 2;
  }
  return frames;
}

/**
 * Advances timecode state by exactly one frame, handling second/minute/hour
 * rollover and the SMPTE drop-frame minute-boundary skip (frames 0 and 1 are
 * dropped at the start of every minute except every 10th).
 */
export function advanceTimecode(
  tc: TimecodeState,
  isDrop: boolean,
  framesPerSec: number,
): TimecodeState {
  let { hours, minutes, seconds, frames } = tc;
  frames++;
  if (frames >= framesPerSec) {
    frames = 0;
    seconds++;
    if (seconds >= 60) {
      seconds = 0;
      minutes++;
      if (minutes >= 60) {
        minutes = 0;
        hours++;
        if (hours >= 24) hours = 0;
      }
      if (isDrop && minutes % 10 !== 0) {
        frames = 2;
      }
    }
  }
  return { hours, minutes, seconds, frames };
}

/**
 * Builds the 80-bit SMPTE LTC frame: BCD-encoded timecode, drop-frame flag,
 * user bits, sync word, and the biphase-mark-polarity (BPC) correction bit.
 */
export function generateLtcBits(
  tc: TimecodeState,
  isDrop: boolean,
  ubit: string,
  framesPerSec: number,
): number[] {
  const { hours: h, minutes: m, seconds: s, frames: f } = tc;
  const bits = new Array(80).fill(0);
  const setBits = (arr: number[], start: number, count: number, val: number) => {
    for (let i = 0; i < count; i++) arr[start + i] = (val >> i) & 1;
  };
  setBits(bits, 0, 4, f % 10); setBits(bits, 8, 2, Math.floor(f / 10));
  bits[10] = isDrop ? 1 : 0;
  setBits(bits, 16, 4, s % 10); setBits(bits, 24, 3, Math.floor(s / 10));
  setBits(bits, 32, 4, m % 10); setBits(bits, 40, 3, Math.floor(m / 10));
  setBits(bits, 48, 4, h % 10); setBits(bits, 56, 2, Math.floor(h / 10));
  // User bits
  for (let i = 0; i < 8; i++) setBits(bits, 4 + (i * 8), 4, parseInt(ubit[i], 16) || 0);
  const sync = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
  for (let i = 0; i < 16; i++) bits[64 + i] = sync[i];
  // Biphase mark polarity correction (SMPTE 12M): set the BPC bit so the
  // 80-bit frame contains an even number of 0-bits, keeping the sync word
  // unambiguous regardless of payload. Bit 27 for 25-fps systems, bit 59
  // otherwise (both positions are otherwise unused).
  const bpc = framesPerSec === 25 ? 27 : 59;
  let zeros = 0;
  for (let i = 0; i < 80; i++) if (bits[i] === 0) zeros++;
  if (zeros % 2 !== 0) bits[bpc] = 1;
  return bits;
}
