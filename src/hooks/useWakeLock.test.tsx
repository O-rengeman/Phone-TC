import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

/**
 * Mirrors WakeLockSentinel: `released` flips to true once the lock is gone,
 * whether we released it or the OS revoked it on backgrounding.
 */
function makeFakeLock() {
  const lock = {
    addEventListener: vi.fn(),
    released: false,
    release: vi.fn().mockImplementation(() => {
      lock.released = true;
      return Promise.resolve();
    }),
  };
  return lock;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe('useWakeLock', () => {
  it('requests a screen wake lock when isRunning becomes true', async () => {
    const lock = makeFakeLock();
    const request = vi.fn().mockResolvedValue(lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { rerender } = renderHook(({ isRunning }) => useWakeLock(isRunning), {
      initialProps: { isRunning: false },
    });
    await act(async () => { await Promise.resolve(); });
    expect(request).not.toHaveBeenCalled();

    rerender({ isRunning: true });
    await act(async () => { await Promise.resolve(); });

    expect(request).toHaveBeenCalledWith('screen');
  });

  it('releases the wake lock when isRunning becomes false', async () => {
    const lock = makeFakeLock();
    const request = vi.fn().mockResolvedValue(lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { rerender } = renderHook(({ isRunning }) => useWakeLock(isRunning), {
      initialProps: { isRunning: true },
    });
    await act(async () => { await Promise.resolve(); });

    rerender({ isRunning: false });
    await act(async () => { await Promise.resolve(); });

    expect(lock.release).toHaveBeenCalled();
  });

  it('releases the wake lock on unmount', async () => {
    const lock = makeFakeLock();
    const request = vi.fn().mockResolvedValue(lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { unmount } = renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });

    unmount();
    expect(lock.release).toHaveBeenCalled();
  });

  it('does nothing when the Wake Lock API is unavailable', () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('re-acquires the lock when the app returns to the foreground after the OS revoked it', async () => {
    const first = makeFakeLock();
    const second = makeFakeLock();
    const request = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledTimes(1);

    // Backgrounding the app revokes the sentinel without notifying us.
    first.released = true;
    await act(async () => { setVisibility('visible'); await Promise.resolve(); });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not request a second lock if the current one survived the foreground return', async () => {
    const lock = makeFakeLock();
    const request = vi.fn().mockResolvedValue(lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { setVisibility('visible'); await Promise.resolve(); });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not re-acquire the lock while the app is hidden', async () => {
    const lock = makeFakeLock();
    const request = vi.fn().mockResolvedValue(lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });
    lock.released = true;

    await act(async () => { setVisibility('hidden'); await Promise.resolve(); });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stops watching visibility once playback stops', async () => {
    const lock = makeFakeLock();
    const request = vi.fn().mockResolvedValue(lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { rerender } = renderHook(({ isRunning }) => useWakeLock(isRunning), {
      initialProps: { isRunning: true },
    });
    await act(async () => { await Promise.resolve(); });

    rerender({ isRunning: false });
    await act(async () => { await Promise.resolve(); });

    await act(async () => { setVisibility('visible'); await Promise.resolve(); });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that resolved after playback already stopped', async () => {
    const lock = makeFakeLock();
    let resolveRequest: (l: typeof lock) => void = () => {};
    const request = vi.fn().mockImplementation(() => new Promise((res) => { resolveRequest = res; }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { rerender } = renderHook(({ isRunning }) => useWakeLock(isRunning), {
      initialProps: { isRunning: true },
    });

    rerender({ isRunning: false });
    await act(async () => { resolveRequest(lock); await Promise.resolve(); });

    expect(lock.release).toHaveBeenCalled();
  });

  it('warns but does not throw when the wake lock request rejects', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });

    expect(warnSpy).toHaveBeenCalledWith('Wake Lock error', expect.any(Error));
    expect(result.current).toBe('error');
  });

  it('reports actual acquisition, OS release, reacquisition and stop', async () => {
    const first = makeFakeLock();
    const second = makeFakeLock();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { result, rerender } = renderHook(({ running }) => useWakeLock(running), { initialProps: { running: true } });
    expect(result.current).toBe('requesting');
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe('active');
    expect(first.addEventListener).toHaveBeenCalledWith('release', expect.any(Function), { once: true });
    act(() => {
      first.released = true;
      const onRelease = first.addEventListener.mock.calls[0][1] as () => void;
      onRelease();
    });
    expect(result.current).toBe('released');
    await act(async () => { setVisibility('visible'); await Promise.resolve(); });
    expect(result.current).toBe('active');
    rerender({ running: false });
    expect(result.current).toBe('inactive');
  });

  it('reports unsupported rather than active on browsers without the API', () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe('unsupported');
  });

  it('does not duplicate a pending request when visibility changes', async () => {
    let resolveRequest: (lock: ReturnType<typeof makeFakeLock>) => void = () => {};
    const request = vi.fn().mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    renderHook(() => useWakeLock(true));
    act(() => { setVisibility('visible'); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRequest(makeFakeLock()); await Promise.resolve(); });
  });
});
