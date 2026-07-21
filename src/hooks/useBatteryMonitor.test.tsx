import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBatteryMonitor } from './useBatteryMonitor';
import type { Lang } from '../utils/i18n';

// vi.mock factories are hoisted above regular const declarations — anything
// referenced inside one must be created via vi.hoisted() or the factory
// closes over a stale/undefined binding.
const { toastFn } = vi.hoisted(() => {
  const fn = vi.fn<(...args: unknown[]) => void>();
  return {
    toastFn: Object.assign(fn, {
      success: vi.fn<(...args: unknown[]) => void>(),
      error: vi.fn<(...args: unknown[]) => void>(),
    }),
  };
});

vi.mock('react-hot-toast', () => {
  const mockToast = (...args: unknown[]) => toastFn(...args);
  mockToast.success = (...args: unknown[]) => toastFn.success(...args);
  mockToast.error = (...args: unknown[]) => toastFn.error(...args);
  return {
    default: mockToast,
  };
});

/** Minimal fake BatteryManager: stores listeners and lets tests fire events. */
class FakeBattery {
  level: number;
  charging: boolean;
  private handlers: Record<string, Array<() => void>> = {};
  constructor(level: number, charging: boolean) {
    this.level = level;
    this.charging = charging;
  }
  addEventListener(type: string, cb: () => void) { (this.handlers[type] ||= []).push(cb); }
  removeEventListener(type: string, cb: () => void) {
    this.handlers[type] = (this.handlers[type] || []).filter(h => h !== cb);
  }
  emit(type: string) { (this.handlers[type] || []).forEach(h => h()); }
  setLevel(level: number) { this.level = level; this.emit('levelchange'); }
  setCharging(charging: boolean) { this.charging = charging; this.emit('chargingchange'); }
}

const testLangRef = { current: 'en' as Lang };

let fakeBattery: FakeBattery;

beforeEach(() => {
  fakeBattery = new FakeBattery(0.5, false);
  (navigator as unknown as { getBattery: () => Promise<FakeBattery> }).getBattery = () =>
    Promise.resolve(fakeBattery);
  toastFn.mockClear();
  toastFn.success.mockClear();
  toastFn.error.mockClear();
});

afterEach(() => {
  delete (navigator as unknown as { getBattery?: unknown }).getBattery;
  vi.restoreAllMocks();
});

describe('useBatteryMonitor', () => {
  it('reports null/false until the Battery API resolves', () => {
    const { result } = renderHook(() => useBatteryMonitor(testLangRef));
    expect(result.current.batteryLevel).toBeNull();
    expect(result.current.isCharging).toBe(false);
  });

  it('picks up the initial level/charging state once getBattery resolves', async () => {
    const { result } = renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.batteryLevel).toBe(0.5);
    expect(result.current.isCharging).toBe(false);
  });

  it('does nothing when the Battery API is unavailable', async () => {
    delete (navigator as unknown as { getBattery?: unknown }).getBattery;
    const { result } = renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.batteryLevel).toBeNull();
  });

  it('updates batteryLevel and isCharging on levelchange', async () => {
    const { result } = renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => fakeBattery.setLevel(0.3));
    expect(result.current.batteryLevel).toBe(0.3);
  });

  it('toasts a low-battery warning when level crosses below 20%% while discharging', async () => {
    fakeBattery = new FakeBattery(0.25, false);
    (navigator as unknown as { getBattery: () => Promise<FakeBattery> }).getBattery = () => Promise.resolve(fakeBattery);
    renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => fakeBattery.setLevel(0.18));
    expect(toastFn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ icon: 'BAT' }));
  });

  it('toasts a critical-battery error when level crosses below 10%%', async () => {
    fakeBattery = new FakeBattery(0.15, false);
    (navigator as unknown as { getBattery: () => Promise<FakeBattery> }).getBattery = () => Promise.resolve(fakeBattery);
    renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => fakeBattery.setLevel(0.08));
    expect(toastFn.error).toHaveBeenCalled();
  });

  it('does not toast low/critical battery warnings while charging', async () => {
    fakeBattery = new FakeBattery(0.25, true);
    (navigator as unknown as { getBattery: () => Promise<FakeBattery> }).getBattery = () => Promise.resolve(fakeBattery);
    renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => fakeBattery.setLevel(0.05));
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('clears the ETA and sample buffer immediately when charging starts', async () => {
    const { result } = renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => fakeBattery.setLevel(0.5)); // first discharge sample
    act(() => fakeBattery.setCharging(true));

    expect(result.current.batteryEta).toBeNull();
  });

  it('toasts charging-started and charging-stopped on chargingchange transitions', async () => {
    renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => fakeBattery.setCharging(true));
    expect(toastFn.success).toHaveBeenCalled();

    act(() => fakeBattery.setCharging(false));
    expect(toastFn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ icon: 'BAT' }));
  });

  it('unsubscribes battery event listeners on unmount', async () => {
    const removeSpy = vi.spyOn(fakeBattery, 'removeEventListener');
    const { unmount } = renderHook(() => useBatteryMonitor(testLangRef));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('levelchange', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('chargingchange', expect.any(Function));
  });
});
