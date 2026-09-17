import { describe, it, expect } from 'vitest';
import { estimateMinutesRemaining, trimSamples, formatDuration } from './battery';

describe('estimateMinutesRemaining', () => {
  it('returns null with fewer than 2 samples', () => {
    expect(estimateMinutesRemaining([])).toBeNull();
    expect(estimateMinutesRemaining([{ level: 0.9, at: 0 }])).toBeNull();
  });

  it('returns null when the window is too short', () => {
    expect(estimateMinutesRemaining([
      { level: 0.90, at: 0 },
      { level: 0.89, at: 30_000 }, // 30s < 60s
    ])).toBeNull();
  });

  it('returns null when not draining (charging / flat)', () => {
    expect(estimateMinutesRemaining([
      { level: 0.50, at: 0 },
      { level: 0.55, at: 120_000 }, // rising
    ])).toBeNull();
    expect(estimateMinutesRemaining([
      { level: 0.50, at: 0 },
      { level: 0.50, at: 120_000 }, // flat
    ])).toBeNull();
  });

  it('estimates time to empty from a linear drain', () => {
    // Dropped 0.10 (50% -> 40%) over 10 minutes => 1%/min.
    // 40% left => 40 minutes remaining.
    const min = estimateMinutesRemaining([
      { level: 0.50, at: 0 },
      { level: 0.40, at: 10 * 60_000 },
    ]);
    expect(min).toBeCloseTo(40, 5);
  });

  it('uses first and last sample across a buffer', () => {
    const min = estimateMinutesRemaining([
      { level: 0.80, at: 0 },
      { level: 0.78, at: 4 * 60_000 },
      { level: 0.70, at: 20 * 60_000 }, // overall 0.10 over 20min = 0.5%/min
    ]);
    // 70% / 0.5%/min = 140 min
    expect(min).toBeCloseTo(140, 5);
  });
});

describe('trimSamples', () => {
  it('drops samples older than the window but keeps at least 2', () => {
    const now = 100 * 60_000;
    const samples = [
      { level: 0.9, at: 0 },
      { level: 0.8, at: 50 * 60_000 },
      { level: 0.7, at: 96 * 60_000 },
      { level: 0.69, at: 99 * 60_000 },
    ];
    const out = trimSamples(samples, now, 15 * 60_000); // keep last 15 min
    expect(out.length).toBe(2);
    expect(out[out.length - 1].at).toBe(99 * 60_000);
  });

  it('does not mutate the input', () => {
    const samples = [
      { level: 0.9, at: 0 },
      { level: 0.8, at: 10 },
      { level: 0.7, at: 20 },
    ];
    const copy = samples.slice();
    trimSamples(samples, 1_000_000, 1);
    expect(samples).toEqual(copy);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(187)).toBe('3h07m');
  });
  it('handles null / invalid', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});
