import { describe, it, expect } from 'vitest';
import { computeBackoffDelay, DEFAULT_BACKOFF } from './backoff';

/** Pins the jitter term to zero so the pure exponential curve is observable. */
const noJitter = () => 0.5;

describe('computeBackoffDelay', () => {
  it('returns the base delay for the first retry', () => {
    expect(computeBackoffDelay(0, {}, noJitter)).toBe(DEFAULT_BACKOFF.baseDelayMs);
  });

  it('doubles the delay on each successive attempt', () => {
    expect(computeBackoffDelay(1, {}, noJitter)).toBe(2000);
    expect(computeBackoffDelay(2, {}, noJitter)).toBe(4000);
    expect(computeBackoffDelay(3, {}, noJitter)).toBe(8000);
  });

  it('clamps growth to maxDelayMs', () => {
    expect(computeBackoffDelay(20, {}, noJitter)).toBe(DEFAULT_BACKOFF.maxDelayMs);
  });

  it('stays finite and clamped for an absurdly large attempt count', () => {
    // 2 ** 5000 is Infinity, which would make the whole product NaN/Infinity.
    const delay = computeBackoffDelay(5000, {}, noJitter);
    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBe(DEFAULT_BACKOFF.maxDelayMs);
  });

  it('treats negative attempts as the first retry', () => {
    expect(computeBackoffDelay(-3, {}, noJitter)).toBe(DEFAULT_BACKOFF.baseDelayMs);
  });

  it('honours custom base and max delays', () => {
    const options = { baseDelayMs: 250, maxDelayMs: 1000 };
    expect(computeBackoffDelay(0, options, noJitter)).toBe(250);
    expect(computeBackoffDelay(1, options, noJitter)).toBe(500);
    expect(computeBackoffDelay(9, options, noJitter)).toBe(1000);
  });

  it('spreads the delay downwards at the low end of the jitter range', () => {
    // random() === 0 -> delay * (1 - jitterRatio)
    expect(computeBackoffDelay(0, { jitterRatio: 0.5 }, () => 0)).toBe(500);
  });

  it('spreads the delay upwards at the high end of the jitter range', () => {
    // random() -> 1 -> delay * (1 + jitterRatio)
    expect(computeBackoffDelay(0, { jitterRatio: 0.5 }, () => 1)).toBe(1500);
  });

  it('produces an exact delay when jitter is disabled', () => {
    expect(computeBackoffDelay(2, { jitterRatio: 0 }, () => 0)).toBe(4000);
  });

  it('never returns a negative delay', () => {
    expect(computeBackoffDelay(0, { jitterRatio: 1 }, () => 0)).toBe(0);
  });
});
