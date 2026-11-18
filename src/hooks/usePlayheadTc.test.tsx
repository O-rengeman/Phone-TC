import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayheadTc, PLAYHEAD_POLL_MS } from './usePlayheadTc';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlayheadTc', () => {
  it('calls getTc once on mount and returns the value', () => {
    const getTc = vi.fn(() => '01:00:00:00');
    const { result } = renderHook(() => usePlayheadTc(getTc));
    expect(getTc).toHaveBeenCalledTimes(1);
    expect(result.current).toBe('01:00:00:00');
  });

  it('updates after each interval tick', () => {
    let tc = '01:00:00:00';
    const getTc = vi.fn(() => tc);
    const { result } = renderHook(() => usePlayheadTc(getTc));

    tc = '01:00:00:12';
    act(() => { vi.advanceTimersByTime(PLAYHEAD_POLL_MS); });
    expect(result.current).toBe('01:00:00:12');
    expect(getTc).toHaveBeenCalledTimes(2);

    tc = '01:00:01:00';
    act(() => { vi.advanceTimersByTime(PLAYHEAD_POLL_MS); });
    expect(result.current).toBe('01:00:01:00');
    expect(getTc).toHaveBeenCalledTimes(3);
  });

  it('defaults to a 125ms poll (8 ticks per second)', () => {
    const getTc = vi.fn(() => '01:00:00:00');
    renderHook(() => usePlayheadTc(getTc));
    act(() => { vi.advanceTimersByTime(1000); });
    // 1 mount call + 8 interval ticks.
    expect(getTc).toHaveBeenCalledTimes(9);
  });

  it('honours a custom interval', () => {
    const getTc = vi.fn(() => '01:00:00:00');
    renderHook(() => usePlayheadTc(getTc, 500));
    act(() => { vi.advanceTimersByTime(1000); });
    // 1 mount call + 2 ticks at 500ms.
    expect(getTc).toHaveBeenCalledTimes(3);
  });

  it('stops polling on unmount', () => {
    const getTc = vi.fn(() => '01:00:00:00');
    const { unmount } = renderHook(() => usePlayheadTc(getTc));
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(getTc).toHaveBeenCalledTimes(1);
  });
});
