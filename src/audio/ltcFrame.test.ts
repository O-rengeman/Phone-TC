import { describe, it, expect } from 'vitest';
import { normalizeDropFrame, advanceTimecode, generateLtcBits } from './ltcFrame';

describe('normalizeDropFrame', () => {
  it('does nothing when isDrop is false', () => {
    expect(normalizeDropFrame(false, 1, 0, 0)).toBe(0);
    expect(normalizeDropFrame(false, 1, 0, 1)).toBe(1);
  });

  it('adjusts frames < 2 to 2 at the start of non-10th minutes when isDrop is true', () => {
    expect(normalizeDropFrame(true, 1, 0, 0)).toBe(2);
    expect(normalizeDropFrame(true, 1, 0, 1)).toBe(2);
    expect(normalizeDropFrame(true, 1, 0, 2)).toBe(2);
  });

  it('does not adjust frames on 10th minutes even when isDrop is true', () => {
    expect(normalizeDropFrame(true, 0, 0, 0)).toBe(0);
    expect(normalizeDropFrame(true, 10, 0, 1)).toBe(1);
  });
});

describe('advanceTimecode', () => {
  it('advances frames normally within a second', () => {
    const start = { hours: 1, minutes: 2, seconds: 3, frames: 10 };
    const next = advanceTimecode(start, false, 30);
    expect(next).toEqual({ hours: 1, minutes: 2, seconds: 3, frames: 11 });
  });

  it('rolls over frames to seconds at second boundary', () => {
    const start = { hours: 1, minutes: 2, seconds: 3, frames: 29 };
    const next = advanceTimecode(start, false, 30);
    expect(next).toEqual({ hours: 1, minutes: 2, seconds: 4, frames: 0 });
  });

  it('rolls over seconds to minutes at minute boundary', () => {
    const start = { hours: 1, minutes: 2, seconds: 59, frames: 29 };
    const next = advanceTimecode(start, false, 30);
    expect(next).toEqual({ hours: 1, minutes: 3, seconds: 0, frames: 0 });
  });

  it('drops frames 0 and 1 on minute boundary rollover if isDrop is true and not 10th minute', () => {
    // 01:00:59:29 -> 01:01:00:02 (frames 0 and 1 are skipped)
    const start = { hours: 1, minutes: 0, seconds: 59, frames: 29 };
    const next = advanceTimecode(start, true, 30);
    expect(next).toEqual({ hours: 1, minutes: 1, seconds: 0, frames: 2 });
  });

  it('does NOT drop frames on 10th minute boundary rollover if isDrop is true', () => {
    // 00:09:59:29 -> 00:10:00:00 (10th minute, no skip)
    const start = { hours: 0, minutes: 9, seconds: 59, frames: 29 };
    const next = advanceTimecode(start, true, 30);
    expect(next).toEqual({ hours: 0, minutes: 10, seconds: 0, frames: 0 });
  });

  it('rolls over minutes to hours', () => {
    const start = { hours: 1, minutes: 59, seconds: 59, frames: 29 };
    const next = advanceTimecode(start, false, 30);
    expect(next).toEqual({ hours: 2, minutes: 0, seconds: 0, frames: 0 });
  });

  it('rolls over 23:59:59:29 to 00:00:00:00', () => {
    const start = { hours: 23, minutes: 59, seconds: 59, frames: 29 };
    const next = advanceTimecode(start, false, 30);
    expect(next).toEqual({ hours: 0, minutes: 0, seconds: 0, frames: 0 });
  });
});

describe('generateLtcBits', () => {
  it('generates an 80-bit array', () => {
    const tc = { hours: 12, minutes: 34, seconds: 56, frames: 15 };
    const bits = generateLtcBits(tc, false, '00000000', 30);
    expect(bits).toHaveLength(80);
  });

  it('correctly sets sync word at the end', () => {
    const tc = { hours: 1, minutes: 2, seconds: 3, frames: 4 };
    const bits = generateLtcBits(tc, false, '00000000', 30);
    const sync = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
    expect(bits.slice(64)).toEqual(sync);
  });

  it('sets drop-frame flag bit 10 to 1 if drop-frame, 0 otherwise', () => {
    const tc = { hours: 0, minutes: 0, seconds: 0, frames: 0 };
    expect(generateLtcBits(tc, true, '00000000', 30)[10]).toBe(1);
    expect(generateLtcBits(tc, false, '00000000', 30)[10]).toBe(0);
  });

  it('ensures even parity of zero bits for non-25fps BPC (bit 59)', () => {
    const tc = { hours: 1, minutes: 2, seconds: 3, frames: 4 };
    const bits = generateLtcBits(tc, false, '00000000', 30);
    const zeros = bits.filter(b => b === 0).length;
    expect(zeros % 2).toBe(0);
  });

  it('ensures even parity of zero bits for 25fps BPC (bit 27)', () => {
    const tc = { hours: 1, minutes: 2, seconds: 3, frames: 4 };
    const bits = generateLtcBits(tc, false, '00000000', 25);
    const zeros = bits.filter(b => b === 0).length;
    expect(zeros % 2).toBe(0);
  });
});
