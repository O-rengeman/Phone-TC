import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLtcEngine } from './useLtcEngine';
import type { Lang } from '../utils/i18n';
import type { Dispatch, SetStateAction } from 'react';
import { TimeSync } from '../utils/TimeSync';

const startBackgroundMode = vi.fn(() => Promise.resolve());
const stopBackgroundMode = vi.fn(() => Promise.resolve());
vi.mock('../utils/TimecodeNativeBridge', () => ({
  TimecodeNativeBridge: {
    startBackgroundMode: () => startBackgroundMode(),
    stopBackgroundMode: () => stopBackgroundMode(),
  },
}));

function makeParams(overrides: Partial<Parameters<typeof useLtcEngine>[0]> = {}) {
  return {
    fpsIndex: 2,
    volume: 0.5,
    outputLevel: 'line' as const,
    userBits: '00000000',
    outputMode: 'stereo' as const,
    outputOffset: 0,
    manualTimecode: '00:00:00:00',
    syncMode: 'network' as const,
    p2pRole: null,
    p2pSyncSource: 'network' as const,
    isRunning: true,
    setIsRunning: vi.fn(),
    isPaused: false,
    setIsPaused: vi.fn(),
    setIsPreparing: vi.fn(),
    setStopHoldPct: vi.fn(),
    setSlateTime: vi.fn(),
    isVisualSlateRef: { current: false },
    audioCtxRef: { current: null },
    engineRef: { current: null }, // mount effect replaces it with a real LtcEngine
    workletNodeRef: { current: null },
    currentTcRef: { current: '00:00:00:00' },
    analyserRef: { current: null },
    micStreamRef: { current: null },
    driftMonitorRef: { current: { reset: vi.fn(), addSync: vi.fn() } as unknown as import('../utils/DriftMonitor').DriftMonitor },
    lastNetworkOffsetRef: { current: null },
    peerSyncRef: { current: null },
    lastSyncTimeRef: { current: 0 },
    setSyncStatus: vi.fn(),
    setDriftStatus: vi.fn(),
    langRef: { current: 'en' as Lang },
    addToast: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  startBackgroundMode.mockClear();
  stopBackgroundMode.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useLtcEngine — thin state-transition coverage', () => {
  it.each(['network', 'p2p'] as const)('clears the previous reference before a failed %s startup sync', async syncMode => {
    vi.spyOn(TimeSync, 'sync').mockRejectedValue(new Error('offline'));
    const setSyncStatus = vi.fn();
    const lastNetworkOffsetRef = { current: 123 as number | null };
    const audio = {
      state: 'running', sampleRate: 48000, __ltcWorkletAdded: true,
      createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null };
      connect = vi.fn();
    });
    const params = makeParams({ isRunning: false, syncMode, p2pRole: syncMode === 'p2p' ? 'master' : null,
      p2pSyncSource: 'network', audioCtxRef: { current: audio }, setSyncStatus, lastNetworkOffsetRef });
    const { result } = renderHook(() => useLtcEngine(params));
    await act(async () => { await result.current.handleStartStop(); });
    expect(TimeSync.sync).toHaveBeenCalledOnce();
    expect(setSyncStatus).toHaveBeenLastCalledWith(null);
    expect(lastNetworkOffsetRef.current).toBeNull();
    expect(params.driftMonitorRef.current.reset).toHaveBeenCalled();
    expect(params.setIsRunning).toHaveBeenCalledWith(true);
    expect(params.addToast).toHaveBeenCalledWith(expect.stringContaining('NTP'), 'error');
  });

  it('handlePause stops playback and clears drift status when running', () => {
    const setIsPaused = vi.fn();
    const setIsRunning = vi.fn();
    const setDriftStatus = vi.fn();
    const driftMonitorRef = { current: { reset: vi.fn(), addSync: vi.fn() } as unknown as import('../utils/DriftMonitor').DriftMonitor };

    const { result } = renderHook(() => useLtcEngine(makeParams({
      isRunning: true, setIsPaused, setIsRunning, setDriftStatus, driftMonitorRef,
    })));

    act(() => result.current.handlePause());

    expect(setIsPaused).toHaveBeenCalledWith(true);
    expect(setIsRunning).toHaveBeenCalledWith(false);
    expect(setDriftStatus).toHaveBeenCalledWith(null);
    expect(driftMonitorRef.current.reset).toHaveBeenCalled();
    expect(stopBackgroundMode).toHaveBeenCalled();
  });

  it('handlePause is a no-op when not running', () => {
    const setIsPaused = vi.fn();
    const { result } = renderHook(() => useLtcEngine(makeParams({ isRunning: false, setIsPaused })));

    act(() => result.current.handlePause());

    expect(setIsPaused).not.toHaveBeenCalled();
    expect(stopBackgroundMode).not.toHaveBeenCalled();
  });

  it('beginStopHold starts a hold-to-stop RAF progression and cancelStopHold aborts it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const setStopHoldPct = vi.fn<Dispatch<SetStateAction<number>>>();
    const { result } = renderHook(() => useLtcEngine(makeParams({ setStopHoldPct })));

    act(() => result.current.beginStopHold());
    // Advance partway through the 700ms hold window.
    act(() => { vi.advanceTimersByTime(100); });
    expect(setStopHoldPct).toHaveBeenCalled();
    const lastPct = setStopHoldPct.mock.calls.at(-1)?.[0];
    expect(lastPct).toBeGreaterThan(0);
    expect(lastPct).toBeLessThan(100);

    act(() => result.current.cancelStopHold());
    expect(setStopHoldPct).toHaveBeenLastCalledWith(0);
  });

  it('beginStopHold completing the full hold duration stops the engine', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const setIsRunning = vi.fn();
    const setIsPaused = vi.fn();
    const { result } = renderHook(() => useLtcEngine(makeParams({ setIsRunning, setIsPaused, isRunning: true })));

    act(() => result.current.beginStopHold());
    act(() => { vi.advanceTimersByTime(800); }); // past STOP_HOLD_MS

    expect(setIsRunning).toHaveBeenCalledWith(false);
    expect(setIsPaused).toHaveBeenCalledWith(false);
  });

  it('beginStopHold is idempotent while already holding', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { result } = renderHook(() => useLtcEngine(makeParams()));

    act(() => result.current.beginStopHold());
    const firstRaf = result.current.stopHoldPctRefs.stopHoldRafRef.current;
    act(() => result.current.beginStopHold()); // second call while already in progress
    expect(result.current.stopHoldPctRefs.stopHoldRafRef.current).toBe(firstRaf);
  });

  it('beep is a no-op without an active AudioContext', () => {
    const { result } = renderHook(() => useLtcEngine(makeParams({ audioCtxRef: { current: null } })));
    expect(() => result.current.beep(1000, 0.1)).not.toThrow();
  });

  it('hands the worklet numeric h/m/s/f for drop-frame timecode on start', async () => {
    // Regression: getTimecodeString() emits 'HH:MM:SS;FF' for drop-frame and
    // split(':') produced [h, m, NaN] — the worklet got s=NaN/f=undefined and
    // LTC output froze on every 29.97 DF run.
    let captured: Record<string, unknown> | null = null;
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null as unknown, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor(_ctx: unknown, _name: string, options?: { processorOptions?: Record<string, unknown> }) {
        captured = options?.processorOptions ?? null;
      }
    });
    const audio = {
      state: 'running', sampleRate: 48000, __ltcWorkletAdded: true,
      destination: {},
      createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
    } as unknown as AudioContext;
    const params = makeParams({
      isRunning: false, fpsIndex: 4, // 29.97 DF
      syncMode: 'freerun', manualTimecode: '00:00:00:00',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));
    await act(async () => { await result.current.handleStartStop(); });

    expect(captured).not.toBeNull();
    const opts = captured as unknown as Record<string, unknown>;
    expect(opts.isDrop).toBe(true);
    expect(opts.framesPerSec).toBe(30);
    for (const key of ['h', 'm', 's', 'f'] as const) {
      expect(Number.isFinite(opts[key])).toBe(true);
    }
    expect(opts).toMatchObject({ h: 0, m: 0, s: 0, f: 0 });
  });

  it('posts fps fields in the config message when fpsIndex changes while running', () => {
    // Regression: the worklet kept its construction-time fps until restart —
    // a mid-run rate change (P2P master sync or manual override) never
    // reached the AudioWorklet.
    const postMessage = vi.fn();
    const workletNode = {
      port: { postMessage, onmessage: null },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const params = makeParams({
      isRunning: true,
      workletNodeRef: { current: workletNode as unknown as AudioWorkletNode },
      fpsIndex: 2, // 25fps
    });
    const { rerender } = renderHook((p: typeof params) => useLtcEngine(p), { initialProps: params });

    const configCalls = () => postMessage.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((m) => m.type === 'config');

    expect(configCalls().at(-1)).toMatchObject({
      type: 'config', fps: 25, fpsNum: 25000, fpsDen: 1000, framesPerSec: 25, isDrop: false,
    });

    rerender({ ...params, fpsIndex: 5 }); // 30fps

    expect(configCalls().at(-1)).toMatchObject({
      type: 'config', fps: 30, fpsNum: 30000, fpsDen: 1000, framesPerSec: 30, isDrop: false,
    });
  });
});
