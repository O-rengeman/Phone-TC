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

// jsdom doesn't implement navigator.mediaDevices or URL.createObjectURL —
// tests that need them define the properties manually, so snapshot the
// originals here and restore them in afterEach (unstubAllGlobals doesn't
// cover defineProperty).
const navMediaDevicesDesc = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');
const urlCreateObjectURLDesc = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const urlRevokeObjectURLDesc = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  startBackgroundMode.mockClear();
  stopBackgroundMode.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (navMediaDevicesDesc) {
    Object.defineProperty(window.navigator, 'mediaDevices', navMediaDevicesDesc);
  } else {
    delete (window.navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  }
  if (urlCreateObjectURLDesc) {
    Object.defineProperty(URL, 'createObjectURL', urlCreateObjectURLDesc);
  } else {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  }
  if (urlRevokeObjectURLDesc) {
    Object.defineProperty(URL, 'revokeObjectURL', urlRevokeObjectURLDesc);
  } else {
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  }
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

// --- issue #41: Web Audio node/URL leaks ---------------------------------

function makeOscStub() {
  return {
    frequency: { value: 0 },
    type: 'sine',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
    onended: null as null | (() => void),
  };
}

function makeGainStub() {
  return {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

/** AudioContext stub that records every oscillator/gain it hands out. */
function makeAudioStub(overrides: Record<string, unknown> = {}) {
  const oscNodes: ReturnType<typeof makeOscStub>[] = [];
  const gainNodes: ReturnType<typeof makeGainStub>[] = [];
  const audio = {
    state: 'running',
    sampleRate: 48000,
    currentTime: 0,
    destination: {},
    __ltcWorkletAdded: true,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: () => {
      const node = makeOscStub();
      oscNodes.push(node);
      return node;
    },
    createGain: () => {
      const node = makeGainStub();
      gainNodes.push(node);
      return node;
    },
    ...overrides,
  } as unknown as AudioContext;
  return { audio, oscNodes, gainNodes };
}

function stubMediaDevices(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

function stubWorkletModuleUrl() {
  const createObjectURL = vi.fn(() => 'blob:ltc-worklet-module');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
  return { createObjectURL, revokeObjectURL };
}

describe('useLtcEngine — Web Audio resource cleanup (issue #41)', () => {
  it('ignores a second handleStartStop while the first start is still in flight', async () => {
    let workletCount = 0;
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() { workletCount += 1; }
    });
    // 'suspended' forces `await ctx.resume()` so p1 yields before finishing —
    // exactly the async gap the in-flight guard exists to close.
    const { audio } = makeAudioStub({ state: 'suspended' });
    const params = makeParams({
      isRunning: false, syncMode: 'freerun', manualTimecode: '00:00:00:00',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));

    await act(async () => {
      const p1 = result.current.handleStartStop();
      const p2 = result.current.handleStartStop();
      await Promise.all([p1, p2]);
    });

    expect(workletCount).toBe(1);
    expect(params.setIsRunning).toHaveBeenCalledTimes(1);
    expect(params.setIsRunning).toHaveBeenCalledWith(true);
  });

  it('lets a fresh handleStartStop run after the previous one settled', async () => {
    let workletCount = 0;
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() { workletCount += 1; }
    });
    const { audio } = makeAudioStub();
    const params = makeParams({
      isRunning: false, syncMode: 'freerun', manualTimecode: '00:00:00:00',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));

    await act(async () => { await result.current.handleStartStop(); });
    await act(async () => { await result.current.handleStartStop(); });

    // The guard releases in `finally`, so sequential starts still work.
    expect(workletCount).toBe(2);
  });

  it('disconnects the full mono-L input chain and stops mic tracks on stop', async () => {
    const trackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
    stubMediaDevices(vi.fn().mockResolvedValue(stream));

    const inputSource = { connect: vi.fn(), disconnect: vi.fn() };
    const analyser = { fftSize: 0, connect: vi.fn(), disconnect: vi.fn() };
    const workletNodes: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() { workletNodes.push(this); }
    });
    const { audio } = makeAudioStub({
      createMediaStreamSource: vi.fn(() => inputSource),
      createAnalyser: vi.fn(() => analyser),
    });
    const params = makeParams({
      isRunning: false, outputMode: 'mono-l', syncMode: 'freerun',
      audioCtxRef: { current: audio },
    });
    const { result, rerender } = renderHook((p: typeof params) => useLtcEngine(p), { initialProps: params });

    await act(async () => { await result.current.handleStartStop(); });

    expect(params.analyserRef.current).toBe(analyser);
    expect(params.micStreamRef.current).toBe(stream);
    expect(inputSource.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(workletNodes[0]);

    // Provider re-renders with isRunning=true once setIsRunning lands, then
    // the same handler takes the stop branch.
    rerender({ ...params, isRunning: true });
    await act(async () => { await result.current.handleStartStop(); });

    expect(workletNodes[0].disconnect).toHaveBeenCalled();
    expect(inputSource.disconnect).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(params.analyserRef.current).toBeNull();
    expect(params.micStreamRef.current).toBeNull();
    expect(trackStop).toHaveBeenCalled();
  });

  it('unwinds a partially-built mono-L graph when mic wiring fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const trackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
    stubMediaDevices(vi.fn().mockResolvedValue(stream));

    const inputSource = { connect: vi.fn(), disconnect: vi.fn() };
    const analyser = {
      fftSize: 0,
      connect: vi.fn(() => { throw new Error('wiring failed'); }),
      disconnect: vi.fn(),
    };
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
    });
    const { audio } = makeAudioStub({
      createMediaStreamSource: vi.fn(() => inputSource),
      createAnalyser: vi.fn(() => analyser),
    });
    const params = makeParams({
      isRunning: false, outputMode: 'mono-l', syncMode: 'freerun',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));

    await act(async () => { await result.current.handleStartStop(); });

    expect(inputSource.disconnect).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(params.analyserRef.current).toBeNull();
    expect(params.micStreamRef.current).toBeNull();
    expect(params.addToast).toHaveBeenCalledWith(expect.any(String), 'error');
    // LTC output still starts — the worklet connects to destination regardless.
    expect(params.setIsRunning).toHaveBeenCalledWith(true);
  });

  it('beep disconnects its oscillator and gain once the source ends', () => {
    const { audio, oscNodes, gainNodes } = makeAudioStub();
    const { result } = renderHook(() => useLtcEngine(makeParams({ audioCtxRef: { current: audio } })));

    result.current.beep(880, 0.2);

    expect(oscNodes).toHaveLength(1);
    expect(gainNodes).toHaveLength(1);
    const osc = oscNodes[0];
    expect(osc.onended).toBeTypeOf('function');
    osc.onended!();
    expect(osc.disconnect).toHaveBeenCalled();
    expect(gainNodes[0].disconnect).toHaveBeenCalled();
  });

  it('the silent start-unlock oscillator disconnects its nodes once ended', async () => {
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
    });
    const { audio, oscNodes, gainNodes } = makeAudioStub();
    const params = makeParams({
      isRunning: false, syncMode: 'freerun', manualTimecode: '00:00:00:00',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));

    await act(async () => { await result.current.handleStartStop(); });

    expect(oscNodes).toHaveLength(1);
    const osc = oscNodes[0];
    expect(osc.onended).toBeTypeOf('function');
    osc.onended!();
    expect(osc.disconnect).toHaveBeenCalled();
    expect(gainNodes[0].disconnect).toHaveBeenCalled();
  });

  it('revokes the AudioWorklet blob URL after addModule resolves', async () => {
    const { createObjectURL, revokeObjectURL } = stubWorkletModuleUrl();
    const addModule = vi.fn().mockResolvedValue(undefined);
    let workletCount = 0;
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() { workletCount += 1; }
    });
    const { audio } = makeAudioStub({
      __ltcWorkletAdded: false,
      audioWorklet: { addModule },
    });
    const params = makeParams({
      isRunning: false, syncMode: 'freerun', manualTimecode: '00:00:00:00',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));

    await act(async () => { await result.current.handleStartStop(); });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(addModule).toHaveBeenCalledWith('blob:ltc-worklet-module');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ltc-worklet-module');
    expect(workletCount).toBe(1);
    expect(params.setIsRunning).toHaveBeenCalledWith(true);
  });

  it('revokes the AudioWorklet blob URL even when addModule fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { revokeObjectURL } = stubWorkletModuleUrl();
    const addModule = vi.fn().mockRejectedValue(new Error('addModule failed'));
    let workletCount = 0;
    vi.stubGlobal('AudioWorkletNode', class {
      port = { onmessage: null, postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() { workletCount += 1; }
    });
    const { audio } = makeAudioStub({
      __ltcWorkletAdded: false,
      audioWorklet: { addModule },
    });
    const params = makeParams({
      isRunning: false, syncMode: 'freerun', manualTimecode: '00:00:00:00',
      audioCtxRef: { current: audio },
    });
    const { result } = renderHook(() => useLtcEngine(params));

    await act(async () => { await result.current.handleStartStop(); });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ltc-worklet-module');
    expect(workletCount).toBe(0);
    expect(params.setIsRunning).not.toHaveBeenCalledWith(true);
  });
});
