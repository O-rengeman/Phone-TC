import { describe, it, expect } from 'vitest';
import { DriftMonitor, formatSyncAge } from './DriftMonitor';

describe('DriftMonitor', () => {
  it('reports no-sync state before any sample', () => {
    const m = new DriftMonitor();
    const s = m.getStatus(25, 1000);
    expect(s.hasSync).toBe(false);
    expect(s.confidence).toBe('none');
    expect(s.rejamRecommended).toBe(true);
    expect(s.msSinceSync).toBe(Infinity);
  });

  it('uses the assumed ppm until a rate can be measured', () => {
    const m = new DriftMonitor({ assumedPpm: 30 });
    m.addSync(0, 0);
    // 100s later, before a second sample: 30ppm * 100s = 3ms
    const s = m.getStatus(25, 100_000);
    expect(s.measured).toBe(false);
    expect(s.driftRatePpm).toBe(30);
    expect(s.estimatedDriftMs).toBeCloseTo(3, 5);
    // 3ms at 25fps = 0.075 frames
    expect(s.estimatedDriftFrames).toBeCloseTo(0.075, 5);
  });

  it('measures the real drift rate from two samples', () => {
    const m = new DriftMonitor({ rateSmoothing: 1 });
    m.addSync(0, 0);
    // offset grew 10ms over 100s => 100 ppm
    m.addSync(10, 100_000);
    const s = m.getStatus(25, 100_000);
    expect(s.measured).toBe(true);
    expect(s.driftRatePpm).toBeCloseTo(100, 5);
  });

  it('ignores intervals shorter than the minimum (jitter guard)', () => {
    const m = new DriftMonitor();
    m.addSync(0, 0);
    m.addSync(50, 500); // 0.5s apart -> too short to derive a rate
    expect(m.getStatus(25, 500).measured).toBe(false);
  });

  it('rejects implausible drift rates (>1000ppm)', () => {
    const m = new DriftMonitor();
    m.addSync(0, 0);
    m.addSync(5000, 2000); // 2.5e6 ppm — a bad NTP reading
    expect(m.getStatus(25, 2000).measured).toBe(false);
  });

  it('recommends re-jam once drift exceeds the frame threshold', () => {
    const m = new DriftMonitor({ assumedPpm: 100, rejamFrameThreshold: 0.5 });
    m.addSync(0, 0);
    // Need 0.5 frame at 25fps = 20ms. 100ppm => 20ms after 200s.
    const before = m.getStatus(25, 199_000);
    expect(before.rejamRecommended).toBe(false);
    const after = m.getStatus(25, 201_000);
    expect(after.rejamRecommended).toBe(true);
    expect(after.confidence).toBe('low');
  });

  it('recommends re-jam after the max sync age regardless of estimated drift', () => {
    const m = new DriftMonitor({ assumedPpm: 0.0001, maxSyncAgeMs: 3_600_000 });
    m.addSync(0, 0);
    expect(m.getStatus(25, 3_600_001).rejamRecommended).toBe(true);
  });

  it('classifies high confidence only with a measurement and tiny drift', () => {
    const m = new DriftMonitor({ rateSmoothing: 1, rejamFrameThreshold: 0.5 });
    m.addSync(0, 0);
    m.addSync(1, 100_000); // 10 ppm, measured
    const s = m.getStatus(25, 100_000); // essentially zero elapsed since last
    expect(s.measured).toBe(true);
    expect(s.confidence).toBe('high');
  });

  it('reset clears history and measurement', () => {
    const m = new DriftMonitor();
    m.addSync(0, 0);
    m.addSync(10, 100_000);
    m.reset();
    const s = m.getStatus(25, 100_000);
    expect(s.hasSync).toBe(false);
    expect(s.measured).toBe(false);
  });

  it('ignores non-finite samples', () => {
    const m = new DriftMonitor();
    m.addSync(Number.NaN, 0);
    m.addSync(0, Number.POSITIVE_INFINITY);
    expect(m.getStatus(25, 1000).hasSync).toBe(false);
  });

  it('msSinceSync is monotonic and floored at zero', () => {
    const m = new DriftMonitor();
    m.addSync(0, 5000);
    expect(m.msSinceSync(4000)).toBe(0); // clock skew / earlier "now"
    expect(m.msSinceSync(8000)).toBe(3000);
  });
});

describe('formatSyncAge', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatSyncAge(12_000)).toBe('12s');
    expect(formatSyncAge(3 * 60_000)).toBe('3m');
    expect(formatSyncAge(64 * 60_000)).toBe('1h04m');
  });

  it('handles non-finite input', () => {
    expect(formatSyncAge(Infinity)).toBe('—');
  });
});
