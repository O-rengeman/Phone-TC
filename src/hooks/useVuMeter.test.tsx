import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVuMeter } from './useVuMeter';

/**
 * Minimal fake AnalyserNode: getFloatTimeDomainData fills the buffer with a
 * peak value that can be updated later (peakHolder.value), so a test can
 * simulate signal level changing across RAF frames.
 */
function makeAnalyserRef(peak = 0.1) {
  const peakHolder = { value: peak };
  const ref = {
    current: {
      fftSize: 4,
      getFloatTimeDomainData: (arr: Float32Array) => {
        arr.fill(0);
        arr[0] = peakHolder.value;
      },
    } as unknown as AnalyserNode,
  };
  return { ref, peakHolder };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useVuMeter', () => {
  it('starts at zero level and not clipping', () => {
    const { ref } = makeAnalyserRef(0);
    const { result } = renderHook(() => useVuMeter(ref, false, 'stereo'));
    expect(result.current.vuLevel).toBe(0);
    expect(result.current.isClipping).toBe(false);
  });

  it('does not run the RAF loop unless running in mono-l mode', () => {
    const { ref } = makeAnalyserRef(0.5);
    const { result } = renderHook(() => useVuMeter(ref, true, 'stereo'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.vuLevel).toBe(0);
  });

  it('does not run the RAF loop when not running, even in mono-l mode', () => {
    const { ref } = makeAnalyserRef(0.5);
    const { result } = renderHook(() => useVuMeter(ref, false, 'mono-l'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.vuLevel).toBe(0);
  });

  it('reports the peak level while running in mono-l mode', () => {
    const { ref } = makeAnalyserRef(0.42);
    const { result } = renderHook(() => useVuMeter(ref, true, 'mono-l'));
    act(() => { vi.advanceTimersByTime(16); });
    expect(result.current.vuLevel).toBeCloseTo(0.42, 5);
  });

  it('flags clipping when the peak crosses the threshold and clears it after the hold time', () => {
    const { ref, peakHolder } = makeAnalyserRef(0.98);
    const { result } = renderHook(() => useVuMeter(ref, true, 'mono-l'));

    act(() => { vi.advanceTimersByTime(16); });
    expect(result.current.isClipping).toBe(true);

    // Drop the signal below the clip threshold before waiting out the hold
    // time — with a constant high peak the hook would legitimately keep
    // resetting its 3000ms hold timer on every RAF frame and never clear.
    peakHolder.value = 0.1;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.isClipping).toBe(false);
  });

  it('resets vuLevel and isClipping when the meter stops (mode change)', () => {
    const { ref } = makeAnalyserRef(0.98);
    const { result, rerender } = renderHook(
      ({ mode }: { mode: string }) => useVuMeter(ref, true, mode),
      { initialProps: { mode: 'mono-l' } },
    );
    act(() => { vi.advanceTimersByTime(16); });
    expect(result.current.vuLevel).toBeGreaterThan(0);

    rerender({ mode: 'stereo' });
    expect(result.current.vuLevel).toBe(0);
    expect(result.current.isClipping).toBe(false);
  });

  it('is a no-op when the analyser ref is empty', () => {
    const analyserRef = { current: null };
    const { result } = renderHook(() => useVuMeter(analyserRef, true, 'mono-l'));
    expect(() => act(() => { vi.advanceTimersByTime(16); })).not.toThrow();
    expect(result.current.vuLevel).toBe(0);
  });
});
