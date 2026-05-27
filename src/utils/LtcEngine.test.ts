import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LtcEngine } from './LtcEngine';
import type { LtcSettings } from './LtcEngine';

const settings: LtcSettings = {
  fps: 30,
  sampleRate: 48000,
  volume: 1,
  isDropFrame: false,
  userBits: '00000000',
  outputMode: 'stereo',
};

// At 30fps integer: fpsNum=30000, fpsDen=1000
// diffSeconds = diffFrames * 1000 / 30000 = diffFrames / 30

describe('LtcEngine.getDiffSeconds', () => {
  it('returns correct diff in seconds for a valid TC string', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:01:00:00'); // 60*30 = 1800 frames
    const diff = engine.getDiffSeconds('00:00:00:00');
    expect(diff).toBeCloseTo(60, 1);
  });

  it('returns 0 when current and target TCs are identical', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:01:00:00');
    expect(engine.getDiffSeconds('00:01:00:00')).toBe(0);
  });

  it('returns Infinity for an invalid TC string', () => {
    const engine = new LtcEngine(settings);
    expect(engine.getDiffSeconds('not-a-timecode')).toBe(Infinity);
  });
});

describe('LtcEngine.softSync', () => {
  let engine: LtcEngine;

  beforeEach(() => {
    engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:00:00');
  });

  it('calls jamSyncDirect when drift exceeds 0.5s', () => {
    // 2s away at 30fps → far past threshold
    const spy = vi.spyOn(engine, 'jamSyncDirect').mockImplementation(() => {});
    engine.softSync('00:00:02:00', 0, false);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('00:00:02:00', 0, false);
  });

  it('nudges TC by exactly one frame when drift is small', () => {
    // 5 frames = ~0.167s < 0.5s threshold
    engine.softSync('00:00:00:05', 0, false);
    expect(engine.getTimecodeString()).toBe('00:00:00:01');
  });

  it('is a no-op when drift is zero', () => {
    engine.setManualTimecode('00:00:05:00');
    engine.softSync('00:00:05:00', 0, false);
    expect(engine.getTimecodeString()).toBe('00:00:05:00');
  });

  it('falls back to jamSyncDirect when inner TC parse throws', () => {
    // Mocking getDiffSeconds to return small drift so the inner try block executes;
    // passing an invalid TC string causes Timecode() to throw inside that block.
    vi.spyOn(engine, 'getDiffSeconds').mockReturnValueOnce(0.1);
    const jamSpy = vi.spyOn(engine, 'jamSyncDirect').mockImplementation(() => {});
    engine.softSync('INVALID-TC', 0, false);
    expect(jamSpy).toHaveBeenCalledWith('INVALID-TC', 0, false);
  });
});
