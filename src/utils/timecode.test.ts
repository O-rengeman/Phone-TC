import { describe, it, expect, vi, afterEach } from 'vitest';
import { frameMs, offsetMsWithOutputOffset, shiftTimecode } from './timecode';

afterEach(() => vi.restoreAllMocks());

describe('timecode helpers', () => {
  it('frameMs', () => {
    expect(frameMs(25)).toBe(40);
    expect(frameMs(30)).toBeCloseTo(33.333, 2);
  });
  it('offsetMsWithOutputOffset adds frames*frameMs', () => {
    expect(offsetMsWithOutputOffset(100, 3, 25)).toBe(220);
    expect(offsetMsWithOutputOffset(0, 0, 25)).toBe(0);
  });
  it('shiftTimecode shifts by frames', () => {
    expect(shiftTimecode('01:00:00:00', 25, 25, false)).toBe('01:00:01:00');
    expect(shiftTimecode('01:00:00:10', -10, 25, false)).toBe('01:00:00:00');
    expect(shiftTimecode('00:00:01:00', -1, 25, false)).toBe('00:00:00:24');
  });
  it('shiftTimecode returns input and warns on invalid input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(shiftTimecode('bogus', 5, 25, false)).toBe('bogus');
    expect(warn).toHaveBeenCalled();
  });
});
