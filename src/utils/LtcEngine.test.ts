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

describe('LtcEngine.getTimecodeForOffset', () => {
  it('returns a valid timecode string without mutating engine state', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:00:00');
    const before = engine.getTimecodeString();
    const tc = engine.getTimecodeForOffset(0);
    expect(tc).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
    expect(engine.getTimecodeString()).toBe(before);
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

describe('LtcEngine.jamSyncDirect', () => {
  it('jumps directly to the master TC when there is no latency', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:00:00');
    engine.jamSyncDirect('00:00:10:00', 0, false);
    expect(engine.getTimecodeString()).toBe('00:00:10:00');
  });

  it('adds latency-compensated frames when the master is running', () => {
    // 1000ms one-way latency at 30fps = 30 frames = 1s ahead.
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:00:00');
    engine.jamSyncDirect('00:00:10:00', 1000, true);
    expect(engine.getTimecodeString()).toBe('00:00:11:00');
  });

  it('does not add latency frames when the master is not running', () => {
    const engine = new LtcEngine(settings);
    engine.jamSyncDirect('00:00:10:00', 1000, false);
    expect(engine.getTimecodeString()).toBe('00:00:10:00');
  });
});

describe('LtcEngine.getCorrectedTc', () => {
  it('returns the latency-compensated TC without mutating engine state', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:05:00');
    const corrected = engine.getCorrectedTc('00:00:10:00', 1000, true);
    expect(corrected).toBe('00:00:11:00');
    // State must be untouched.
    expect(engine.getTimecodeString()).toBe('00:00:05:00');
  });
});

describe('LtcEngine.signedFrameDiffTo', () => {
  let engine: LtcEngine;
  beforeEach(() => {
    engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:10:00'); // 300 frames at 30fps
  });

  it('is positive when the target is ahead', () => {
    expect(engine.signedFrameDiffTo('00:00:11:00')).toBe(30);
  });

  it('is negative when the target is behind', () => {
    expect(engine.signedFrameDiffTo('00:00:09:00')).toBe(-30);
  });

  it('returns 0 for an unparseable target', () => {
    expect(engine.signedFrameDiffTo('garbage')).toBe(0);
  });
});

describe('LtcEngine.jamSyncIfNeeded', () => {
  let engine: LtcEngine;
  beforeEach(() => {
    engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:00:00');
  });

  it('syncs and returns true when drift meets the threshold', () => {
    const applied = engine.jamSyncIfNeeded('00:00:10:00', 0, false, 0.5);
    expect(applied).toBe(true);
    expect(engine.getTimecodeString()).toBe('00:00:10:00');
  });

  it('does nothing and returns false when drift is below the threshold', () => {
    engine.setManualTimecode('00:00:10:00');
    const applied = engine.jamSyncIfNeeded('00:00:10:01', 0, false, 0.5);
    expect(applied).toBe(false);
    expect(engine.getTimecodeString()).toBe('00:00:10:00');
  });
});

describe('LtcEngine.getTimecodeParts', () => {
  it('splits the current timecode into h/m/s/f', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('01:02:03:04');
    expect(engine.getTimecodeParts()).toEqual({ h: 1, m: 2, s: 3, f: 4 });
  });
});

describe('LtcEngine.dateForOffset', () => {
  it('returns a wall-clock date shifted by the offset', () => {
    const engine = new LtcEngine(settings);
    const base = engine.dateForOffset(0).getTime();
    const shifted = engine.dateForOffset(1000).getTime();
    expect(shifted - base).toBeGreaterThanOrEqual(995);
    expect(shifted - base).toBeLessThanOrEqual(1005);
  });
});

describe('LtcEngine.setFps', () => {
  it('re-parses the current TC at the new frame rate', () => {
    const engine = new LtcEngine(settings);
    engine.setManualTimecode('00:00:10:00');
    engine.setFps(25, false);
    // 25 frames at 25fps = exactly 1 second.
    expect(engine.getDiffSeconds('00:00:11:00')).toBeCloseTo(1, 3);
  });
});

describe('LtcEngine frame-rate math', () => {
  it('derives the NTSC rational for 29.97 DF', () => {
    const engine = new LtcEngine({ ...settings, fps: 29.97, isDropFrame: true });
    engine.setManualTimecode('00:00:10:00');
    // 30 frames at 30000/1001 ≈ 1.001s
    expect(engine.getDiffSeconds('00:00:11:00')).toBeCloseTo(1.001, 3);
  });

  it('derives the NTSC rational for 23.976', () => {
    const engine = new LtcEngine({ ...settings, fps: 23.976, isDropFrame: false });
    engine.setManualTimecode('00:00:10:00');
    expect(engine.getDiffSeconds('00:00:11:00')).toBeCloseTo(1.001, 3);
  });

  it('derives the NTSC rational for 59.94 DF', () => {
    const engine = new LtcEngine({ ...settings, fps: 59.94, isDropFrame: true });
    engine.setManualTimecode('00:00:10:00');
    expect(engine.getDiffSeconds('00:00:11:00')).toBeCloseTo(1.001, 3);
  });

  it('honours explicit fpsNum/fpsDen overrides', () => {
    const engine = new LtcEngine({ ...settings, fps: 30, fpsNum: 30000, fpsDen: 1000 });
    engine.setManualTimecode('00:00:10:00');
    expect(engine.getDiffSeconds('00:00:11:00')).toBeCloseTo(1, 3);
  });
});

describe('LtcEngine misc setters', () => {
  it('setUserBits pads, truncates and upper-cases without throwing', () => {
    const engine = new LtcEngine(settings);
    expect(() => engine.setUserBits('abc')).not.toThrow();
    expect(() => engine.setUserBits('AABBCCDDEE')).not.toThrow();
  });

  it('setVolume and updateSampleRate are safe to call', () => {
    const engine = new LtcEngine(settings);
    expect(() => engine.setVolume(2)).not.toThrow(); // clamped internally
    expect(() => engine.setVolume(-1)).not.toThrow();
    expect(() => engine.updateSampleRate(44100)).not.toThrow();
  });

  it('syncWithOffset and resetToSystemTime produce valid timecodes', () => {
    const engine = new LtcEngine(settings);
    engine.syncWithOffset(0);
    expect(engine.getTimecodeString()).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
    engine.resetToSystemTime();
    expect(engine.getTimecodeString()).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
  });
});
