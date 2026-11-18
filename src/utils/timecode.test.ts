import { describe, it, expect, vi, afterEach } from 'vitest';
import { frameMs, offsetMsWithOutputOffset, parseTcParts, shiftTimecode } from './timecode';

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

  it('parseTcParts parses colon-separated timecode', () => {
    expect(parseTcParts('01:02:03:04')).toEqual([1, 2, 3, 4]);
    expect(parseTcParts('23:59:59:29')).toEqual([23, 59, 59, 29]);
  });

  it('parseTcParts parses drop-frame semicolon separator', () => {
    // smpte-timecode emits 'HH:MM:SS;FF' when dropFrame is set — splitting on
    // ':' alone produced [h, m, NaN] and broke jam/init on every DF run.
    expect(parseTcParts('01:00:00;00')).toEqual([1, 0, 0, 0]);
    expect(parseTcParts('00:01:00;02')).toEqual([0, 1, 0, 2]);
  });

  it('parseTcParts accepts dot separator', () => {
    expect(parseTcParts('01:02:03.04')).toEqual([1, 2, 3, 4]);
  });

  it('parseTcParts returns null for malformed input', () => {
    expect(parseTcParts('')).toBeNull();
    expect(parseTcParts('bogus')).toBeNull();
    expect(parseTcParts('01:02:03')).toBeNull();
    expect(parseTcParts('01:02:03:04:05')).toBeNull();
    expect(parseTcParts('01:02:xx:04')).toBeNull();
    expect(parseTcParts('HH:MM:SS;FF')).toBeNull();
  });
});
