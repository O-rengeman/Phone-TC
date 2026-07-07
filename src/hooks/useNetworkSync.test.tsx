import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkSync } from './useNetworkSync';
import { DriftMonitor } from '../utils/DriftMonitor';
import type { LtcEngine } from '../utils/LtcEngine';
import type { Lang } from '../utils/i18n';

// vi.mock factories are hoisted above regular const declarations — a
// variable referenced inside one must be created via vi.hoisted() or the
// factory closes over a stale/undefined binding (silently breaks call
// tracking and, worse, can leave the mocked fn uncallable — see useP2P's
// equivalent fix).
const { syncMock } = vi.hoisted(() => ({ syncMock: vi.fn() }));
vi.mock('../utils/TimeSync', () => ({
  TimeSync: { sync: (...args: unknown[]) => syncMock(...args) },
}));

function makeEngine(overrides: Partial<LtcEngine> = {}) {
  return {
    getTimecodeForOffset: vi.fn(() => '01:00:00:00'),
    getDiffSeconds: vi.fn(() => 0),
    syncWithOffset: vi.fn(),
    ...overrides,
  } as unknown as LtcEngine;
}

function makeParams(overrides: Partial<Parameters<typeof useNetworkSync>[0]> = {}) {
  return {
    syncMode: 'network' as const,
    isRunning: true,
    p2pRole: null,
    fpsIndex: 2,
    outputOffset: 0,
    engineRef: { current: makeEngine() },
    driftMonitorRef: { current: new DriftMonitor() },
    lastNetworkOffsetRef: { current: null as number | null },
    applySyncToWorklet: vi.fn(),
    langRef: { current: 'en' as Lang },
    addToast: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  syncMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useNetworkSync periodic sync effect', () => {
  it('does not sync when syncMode is not network', () => {
    // IMPORTANT: params must be created ONCE, outside the renderHook render
    // callback. If makeParams() were called inline (`renderHook(() =>
    // useNetworkSync(makeParams(...)))`), every re-render would produce a
    // brand-new engineRef/driftMonitorRef/lastNetworkOffsetRef object, which
    // breaks the hook's effect dependency comparisons — React would tear
    // down and recreate the interval (and, for the drift-status effect,
    // immediately re-fire its synchronous setState) on every single render,
    // causing an unbounded synchronous re-render loop that OOMs the worker.
    const params = makeParams({ syncMode: 'system' });
    renderHook(() => useNetworkSync(params));
    act(() => vi.advanceTimersByTime(30000));
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('does not sync when not running', () => {
    const params = makeParams({ isRunning: false });
    renderHook(() => useNetworkSync(params));
    act(() => vi.advanceTimersByTime(30000));
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('syncs every 30s while network mode is running and updates syncStatus', async () => {
    syncMock.mockResolvedValue({ offset: 10, latency: 5 });
    const params = makeParams();
    const { result } = renderHook(() => useNetworkSync(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(result.current.syncStatus).toEqual({ offset: 10, latency: 5 });
  });

  it('skips worklet correction entirely when this device is the P2P master', async () => {
    syncMock.mockResolvedValue({ offset: 500, latency: 5 });
    const applySyncToWorklet = vi.fn();
    const engine = makeEngine();
    const params = makeParams({
      p2pRole: 'master', applySyncToWorklet, engineRef: { current: engine },
    });
    renderHook(() => useNetworkSync(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(applySyncToWorklet).not.toHaveBeenCalled();
  });

  it('applies a worklet correction when drift exceeds the threshold', async () => {
    syncMock.mockResolvedValue({ offset: 500, latency: 5 });
    const applySyncToWorklet = vi.fn();
    const engine = makeEngine({ getDiffSeconds: vi.fn(() => 0.5) } as Partial<LtcEngine>);
    const lastNetworkOffsetRef = { current: 0 };
    const params = makeParams({
      applySyncToWorklet, engineRef: { current: engine }, lastNetworkOffsetRef,
    });
    renderHook(() => useNetworkSync(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(applySyncToWorklet).toHaveBeenCalledWith('01:00:00:00', 0, true);
    expect(engine.syncWithOffset).toHaveBeenCalledWith(500);
    expect(lastNetworkOffsetRef.current).toBe(500);
  });

  it('skips correction when offset delta and drift are both below threshold', async () => {
    syncMock.mockResolvedValue({ offset: 100, latency: 5 });
    const applySyncToWorklet = vi.fn();
    const engine = makeEngine({ getDiffSeconds: vi.fn(() => 0.01) } as Partial<LtcEngine>);
    const lastNetworkOffsetRef = { current: 100 };
    const params = makeParams({
      applySyncToWorklet, engineRef: { current: engine }, lastNetworkOffsetRef,
    });
    renderHook(() => useNetworkSync(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(applySyncToWorklet).not.toHaveBeenCalled();
  });

  it('swallows sync errors from the background interval without throwing', async () => {
    syncMock.mockRejectedValue(new Error('network down'));
    const params = makeParams();
    renderHook(() => useNetworkSync(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    // No assertion needed beyond "did not throw" — the interval's catch logs a warning.
  });
});

describe('useNetworkSync drift status polling', () => {
  it('publishes drift status once per second while network mode is running', () => {
    const driftMonitorRef = { current: new DriftMonitor() };
    driftMonitorRef.current.addSync(50);
    const params = makeParams({ driftMonitorRef });
    const { result } = renderHook(() => useNetworkSync(params));

    expect(result.current.driftStatus?.hasSync).toBe(true);
  });
});

describe('useNetworkSync.handleManualResync', () => {
  it('is a no-op outside network sync mode', async () => {
    const params = makeParams({ syncMode: 'p2p' });
    const { result } = renderHook(() => useNetworkSync(params));
    await act(async () => {
      await result.current.handleManualResync();
    });
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('syncs, applies the offset (including frame-offset compensation), and toasts success', async () => {
    syncMock.mockResolvedValue({ offset: 200, latency: 3 });
    const applySyncToWorklet = vi.fn();
    const engine = makeEngine();
    const addToast = vi.fn();
    const lastNetworkOffsetRef = { current: null as number | null };

    const params = makeParams({
      applySyncToWorklet, engineRef: { current: engine }, addToast, outputOffset: 2, lastNetworkOffsetRef,
    });
    const { result } = renderHook(() => useNetworkSync(params));

    await act(async () => {
      await result.current.handleManualResync();
    });

    // fpsIndex 2 -> 25fps -> frameMs = 40; outputOffset(2) * 40 = 80
    expect(engine.syncWithOffset).toHaveBeenCalledWith(280);
    expect(lastNetworkOffsetRef.current).toBe(200);
    expect(applySyncToWorklet).toHaveBeenCalledWith('01:00:00:00', 0, true);
    expect(addToast).toHaveBeenCalledWith(expect.any(String), 'info');
    expect(result.current.isResyncing).toBe(false);
  });

  it('does not push a worklet correction when not running', async () => {
    syncMock.mockResolvedValue({ offset: 200, latency: 3 });
    const applySyncToWorklet = vi.fn();
    const params = makeParams({ applySyncToWorklet, isRunning: false });
    const { result } = renderHook(() => useNetworkSync(params));

    await act(async () => {
      await result.current.handleManualResync();
    });

    expect(applySyncToWorklet).not.toHaveBeenCalled();
  });

  it('skips engine sync when this device is the P2P master', async () => {
    syncMock.mockResolvedValue({ offset: 200, latency: 3 });
    const engine = makeEngine();
    const params = makeParams({
      p2pRole: 'master', engineRef: { current: engine },
    });
    const { result } = renderHook(() => useNetworkSync(params));

    await act(async () => {
      await result.current.handleManualResync();
    });

    expect(engine.syncWithOffset).not.toHaveBeenCalled();
  });

  it('toasts a failure message and resets isResyncing when sync rejects', async () => {
    syncMock.mockRejectedValue(new Error('timeout'));
    const addToast = vi.fn();
    const params = makeParams({ addToast });
    const { result } = renderHook(() => useNetworkSync(params));

    await act(async () => {
      await result.current.handleManualResync();
    });

    expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(result.current.isResyncing).toBe(false);
  });
});
