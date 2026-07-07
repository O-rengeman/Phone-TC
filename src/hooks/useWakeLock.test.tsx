import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function makeFakeLock() {
  return { release: vi.fn().mockResolvedValue(undefined) };
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

  it('warns but does not throw when the wake lock request rejects', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });

    expect(warnSpy).toHaveBeenCalledWith('Wake Lock error', expect.any(Error));
  });
});
