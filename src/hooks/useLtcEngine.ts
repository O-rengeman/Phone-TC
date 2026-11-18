import { useCallback, useEffect, useRef } from 'react';
import { LtcEngine } from '../utils/LtcEngine';
import type { LtcSettings } from '../utils/LtcEngine';
import { TimeSync } from '../utils/TimeSync';
import type { PeerSync } from '../utils/PeerSync';
import type { DriftMonitor, DriftStatus } from '../utils/DriftMonitor';
import { TimecodeNativeBridge } from '../utils/TimecodeNativeBridge';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { debug } from '../utils/log';
import { LTC_WORKLET_SOURCE } from '../audio/ltcWorkletSource';
import { FPS_OPTIONS } from '../constants';
import { effectiveOutputVolume } from '../utils/audioLevel';
import { offsetMsWithOutputOffset, parseTcParts, shiftTimecode } from '../utils/timecode';
import type { SyncMode } from '../LTCSyncContext';

type ToastLevel = 'info' | 'warn' | 'error';
type SyncStatus = { offset: number; latency: number } | null;
type OutputMode = 'stereo' | 'mono-l';
type OutputLevel = 'mic' | 'line';

const STOP_HOLD_MS = 700;

interface UseLtcEngineParams {
  fpsIndex: number;
  volume: number;
  outputLevel: OutputLevel;
  userBits: string;
  outputMode: OutputMode;
  outputOffset: number;
  manualTimecode: string;
  syncMode: SyncMode;
  p2pRole: 'master' | 'client' | null;
  p2pSyncSource: 'manual' | 'network';
  isRunning: boolean;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreparing: React.Dispatch<React.SetStateAction<boolean>>;
  setStopHoldPct: React.Dispatch<React.SetStateAction<number>>;
  setSlateTime: React.Dispatch<React.SetStateAction<string>>;
  isVisualSlateRef: React.RefObject<boolean>;
  // Refs owned by the main provider (shared with other already-extracted
  // hooks called earlier, e.g. useMarkers/useNetworkSync), so this hook
  // consumes them rather than creating its own copies.
  audioCtxRef: React.RefObject<AudioContext | null>;
  engineRef: React.RefObject<LtcEngine | null>;
  workletNodeRef: React.RefObject<AudioWorkletNode | null>;
  currentTcRef: React.RefObject<string>;
  analyserRef: React.RefObject<AnalyserNode | null>;
  micStreamRef: React.RefObject<MediaStream | null>;
  driftMonitorRef: React.RefObject<DriftMonitor>;
  lastNetworkOffsetRef: React.RefObject<number | null>;
  peerSyncRef: React.RefObject<PeerSync | null>;
  lastSyncTimeRef: React.RefObject<number>;
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>;
  setDriftStatus: React.Dispatch<React.SetStateAction<DriftStatus | null>>;
  langRef: React.RefObject<Lang>;
  addToast: (msg: string, level?: ToastLevel) => void;
}

interface UseLtcEngineResult {
  stopHoldPctRefs: {
    holdStoppedRef: React.RefObject<boolean>;
    stopHoldStartRef: React.RefObject<number>;
    stopHoldRafRef: React.RefObject<number | null>;
  };
  beep: (freq: number, duration: number) => void;
  handleStartStop: () => Promise<void>;
  handlePause: () => void;
  beginStopHold: () => void;
  cancelStopHold: () => void;
}

/**
 * Owns the LtcEngine start/stop/pause orchestration and AudioWorklet setup
 * that ties sync-mode decisions (system/network/p2p/freerun) to engine
 * playback. This is the last and most cross-cutting extraction:
 * startSequence/stopEngine legitimately need to read sync-mode, P2P, and
 * drift-monitor state, so the parameter list here is wide by necessity,
 * mirroring useP2P's dependency-injection pattern rather
 * than trying to force an artificial boundary.
 *
 * The audio/engine refs themselves stay owned by the main provider (they're
 * also passed into useMarkers/useNetworkSync, which are
 * called earlier) — this hook receives and mutates them, it doesn't create
 * its own copies.
 */
export function useLtcEngine({
  fpsIndex, volume, outputLevel, userBits, outputMode, outputOffset, manualTimecode,
  syncMode, p2pRole, p2pSyncSource,
  isRunning, setIsRunning, isPaused, setIsPaused, setIsPreparing, setStopHoldPct, setSlateTime,
  isVisualSlateRef, audioCtxRef, engineRef, workletNodeRef, currentTcRef, analyserRef, micStreamRef,
  driftMonitorRef, lastNetworkOffsetRef, peerSyncRef, lastSyncTimeRef,
  setSyncStatus, setDriftStatus, langRef, addToast,
}: UseLtcEngineParams): UseLtcEngineResult {
  const stopHoldRafRef = useRef<number | null>(null);
  const holdStoppedRef = useRef(false);
  const stopHoldStartRef = useRef(0);
  // Local to this hook: the mono-L mic source node has no shared consumer
  // (unlike analyserRef, which the VU meter reads), so it gets its own ref
  // purely so stopEngine can disconnect it. startInFlightRef guards
  // handleStartStop's async gap before isRunning flips — a state value would
  // lag a render and let a double-tap spawn two worklet nodes.
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const startInFlightRef = useRef(false);

  useEffect(() => {
    const settings: LtcSettings = {
      fps: FPS_OPTIONS[fpsIndex].value,
      sampleRate: 48000,
      volume: effectiveOutputVolume(volume, outputLevel),
      isDropFrame: FPS_OPTIONS[fpsIndex].drop,
      userBits: userBits,
      outputMode: outputMode,
      fpsNum: FPS_OPTIONS[fpsIndex].fpsNum,
      fpsDen: FPS_OPTIONS[fpsIndex].fpsDen
    };
    engineRef.current = new LtcEngine(settings);
    // Mount-only: builds the engine from the initial settings snapshot. Later
    // changes to fps/volume/userBits/outputMode are pushed by dedicated
    // effects below, not by re-running this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const opt = FPS_OPTIONS[fpsIndex];
    try {
      engine.setFps(opt.value, opt.drop);
    } catch {
      // smpte-timecode rejects labels that can't exist at the new rate —
      // e.g. frame count >= the new fps after a rate drop, or frames 0/1 at
      // a non-10th minute when switching to drop-frame. Re-anchor the TC at
      // the nearest valid label for the new rate, then retry.
      const parts = parseTcParts(engine.getTimecodeString());
      if (parts) {
        const [h, m, s] = parts;
        const framesPerSec = Math.round(opt.fpsNum / opt.fpsDen);
        let f = Math.min(parts[3], framesPerSec - 1);
        if (opt.drop && m % 10 !== 0 && s === 0 && f < 2) f = 2;
        const pad = (n: number) => String(n).padStart(2, '0');
        try {
          engine.setManualTimecode(`${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`);
          engine.setFps(opt.value, opt.drop);
        } catch {
          // Leave the engine at its previous rate rather than crash the effect.
        }
      }
    }
  }, [fpsIndex, engineRef]);

  // The engine's stored volume is the *effective* output volume — mic inputs
  // are attenuated. This effect is the single writer; the worklet receives
  // the same value via 'config' messages below.
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setVolume(effectiveOutputVolume(volume, outputLevel));
    }
  }, [volume, outputLevel, engineRef]);

  useEffect(() => {
    const node = workletNodeRef.current;
    if (isRunning && node) {
      const opt = FPS_OPTIONS[fpsIndex];
      node.port.postMessage({
        type: 'config',
        volume: effectiveOutputVolume(volume, outputLevel),
        ubit: userBits,
        mode: outputMode,
        // fps fields let the worklet adopt a mid-run rate change (manual
        // override or P2P master fps sync) instead of staying at the
        // construction-time rate until restart.
        fps: opt.value,
        fpsNum: opt.fpsNum,
        fpsDen: opt.fpsDen,
        framesPerSec: Math.round(opt.fpsNum / opt.fpsDen),
        isDrop: opt.drop,
      });
    }
  }, [fpsIndex, volume, userBits, outputMode, outputLevel, isRunning, workletNodeRef]);

  const beep = useCallback((freq: number, duration: number) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Web Audio never auto-disconnects: without this every beep leaves the
    // oscillator+gain pair wired to the destination forever.
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* context may be closed */ }
    };
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }, [audioCtxRef]);

  const startEngine = async () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    // AudioContext.audioWorklet.addModule() throws if the same module is
    // added twice on the same context (e.g. stop/start without a fresh
    // AudioContext) — flag it on the context instance so we only add once.
    const customCtx = ctx as AudioContext & { __ltcWorkletAdded?: boolean };
    if (!customCtx.__ltcWorkletAdded) {
      const workletCode = LTC_WORKLET_SOURCE;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);

      try {
        await ctx.audioWorklet.addModule(url);
        customCtx.__ltcWorkletAdded = true;
      } catch (e) {
        console.error('Worklet addition failed', e);
        return;
      } finally {
        // addModule fetches+compiles the script before settling, so the blob
        // URL is dead weight on both the success and failure paths — revoke it
        // either way (one URL per AudioContext lifetime otherwise).
        URL.revokeObjectURL(url);
      }
    }

    // getTimecodeString() emits 'HH:MM:SS;FF' for drop-frame — parseTcParts
    // accepts ':'/';'/'.' so DF sessions don't hand NaN to the worklet.
    const currentTC: [number, number, number, number] =
      parseTcParts(engineRef.current!.getTimecodeString()) ?? [0, 0, 0, 0];
    const workletNode = new AudioWorkletNode(ctx, 'ltc-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        fps: FPS_OPTIONS[fpsIndex].value,
        isDrop: FPS_OPTIONS[fpsIndex].drop,
        fpsNum: FPS_OPTIONS[fpsIndex].fpsNum,
        fpsDen: FPS_OPTIONS[fpsIndex].fpsDen,
        framesPerSec: Math.round(FPS_OPTIONS[fpsIndex].fpsNum / FPS_OPTIONS[fpsIndex].fpsDen),
        volume: effectiveOutputVolume(volume, outputLevel),
        ubit: userBits,
        mode: outputMode,
        h: currentTC[0], m: currentTC[1], s: currentTC[2], f: currentTC[3]
      }
    });
    workletNode.port.onmessage = (e: MessageEvent<{ tc?: string }>) => {
      const tc = e.data?.tc;
      if (!tc) return;
      currentTcRef.current = tc;
      // The worklet emits 'HH:MM:SS:FF' labels that can briefly be illegal at
      // the engine's rate mid-rate-change (e.g. DF dropped labels while the
      // engine already flipped to drop-frame) — Timecode() throws on those.
      try {
        if (engineRef.current) engineRef.current.setManualTimecode(tc);
      } catch { /* next frame's label will parse */ }
      if (isVisualSlateRef.current) setSlateTime(tc);
    };

    if (outputMode === 'mono-l') {
      // Hoisted locals so the catch path can unwind a partially-built graph —
      // getUserMedia can succeed while a later wiring step throws.
      let stream: MediaStream | null = null;
      let inputSource: MediaStreamAudioSourceNode | null = null;
      let analyser: AnalyserNode | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        inputSource = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        inputSource.connect(analyser);
        analyser.connect(workletNode);
        inputSourceRef.current = inputSource;
        analyserRef.current = analyser;
      } catch (err) {
        console.warn('Mic access denied', err);
        addToast(translate('toast.micDenied', langRef.current), 'error');
        // Unwind whatever got built so the source/analyser nodes and the mic
        // tracks don't leak when wiring fails after getUserMedia succeeded.
        try { analyser?.disconnect(); } catch { /* ignore */ }
        try { inputSource?.disconnect(); } catch { /* ignore */ }
        if (analyserRef.current === analyser) analyserRef.current = null;
        if (inputSourceRef.current === inputSource) inputSourceRef.current = null;
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          if (micStreamRef.current === stream) micStreamRef.current = null;
        }
      }
    }

    workletNode.connect(ctx.destination);
    workletNodeRef.current = workletNode;
    setIsRunning(true);
    void TimecodeNativeBridge.startBackgroundMode();
  };

  const stopEngine = (reset = false) => {
    debug('[DEBUG-ENGINE] stopEngine execution. reset:', reset, 'hasWorkletNode:', !!workletNodeRef.current);
    if (workletNodeRef.current) {
      debug('[DEBUG-ENGINE] stopEngine: disconnecting workletNode');
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    // workletNode.disconnect() only removes its *outputs* — the mono-L input
    // chain (mic source → analyser → worklet) stays wired and retains all
    // three nodes unless it's torn down explicitly.
    if (inputSourceRef.current) {
      try { inputSourceRef.current.disconnect(); } catch { /* context may be closed */ }
      inputSourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* context may be closed */ }
      analyserRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsRunning(false);
    driftMonitorRef.current.reset();
    setDriftStatus(null);
    if (reset) {
      // Reset to the same starting timecode startSequence would compute —
      // previously this path had its own (different) branch logic that
      // ignored the p2p-master-manual case and duplicated the offset math.
      const baseOffset = syncMode === 'network' ? (lastNetworkOffsetRef.current ?? 0) : 0;
      applyInitialTimecode(baseOffset);
      currentTcRef.current = engineRef.current!.getTimecodeString();
    }
    void TimecodeNativeBridge.stopBackgroundMode();
  };

  // Single source of truth for "what timecode does the engine start from" —
  // used by both startSequence and stopEngine(reset). baseOffsetMs is the
  // network offset already measured by the caller (0 when unavailable).
  const applyInitialTimecode = useCallback((baseOffsetMs: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const fps = FPS_OPTIONS[fpsIndex].value;
    const drop = FPS_OPTIONS[fpsIndex].drop;
    if (syncMode === 'freerun' || (syncMode === 'p2p' && p2pRole === 'master' && p2pSyncSource === 'manual')) {
      engine.setManualTimecode(shiftTimecode(manualTimecode, outputOffset, fps, drop));
    } else {
      engine.syncWithOffset(offsetMsWithOutputOffset(baseOffsetMs, outputOffset, fps));
    }
  }, [syncMode, p2pRole, p2pSyncSource, manualTimecode, outputOffset, fpsIndex, engineRef]);

  const startSequence = async () => {
    setIsPreparing(true);
    try {
      let offset = 0;

      if (!isPaused) {
        if (syncMode === 'network' || (syncMode === 'p2p' && p2pRole === 'master' && p2pSyncSource === 'network')) {
          // This run will fall back to the local clock if acquisition fails.
          // Never leave a previous run's reference looking like a fresh sync.
          setSyncStatus(null);
          setDriftStatus(null);
          driftMonitorRef.current.reset();
          lastNetworkOffsetRef.current = null;
          try {
            const result = await TimeSync.sync();
            setSyncStatus(result);
            driftMonitorRef.current.addSync(result.offset);
            offset = result.offset;
            lastNetworkOffsetRef.current = result.offset;
            if (result.fromCache) {
              addToast(translate('toast.ntpCached', langRef.current), 'warn');
            }
          } catch {
            addToast(translate('toast.ntpFailed', langRef.current), 'error');
          }
        }

        if (engineRef.current && syncMode === 'p2p' && p2pRole === 'client') {
          if (peerSyncRef.current) {
            peerSyncRef.current.broadcast({
              type: 'sync-request',
              clientTimestamp: performance.now()
            });
          }
          lastSyncTimeRef.current = Date.now();
        } else {
          applyInitialTimecode(offset);
        }
      }

      setIsPaused(false);
      await startEngine();
    } catch (err) {
      console.error('Start sequence failed:', err);
      addToast(translate('toast.startFailed', langRef.current), 'error');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleStartStop = async () => {
    if (isRunning) {
      setIsPaused(false);
      stopEngine(true);
      return;
    }
    // isRunning only flips after the whole async start sequence resolves, so
    // a rapid double-tap would otherwise run startSequence twice and leave two
    // worklet nodes both emitting LTC. The ref closes that gap immediately.
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); } catch { /* context may be closed */ }
      };
      osc.start(0);
      osc.stop(0.1);

      if (ctx.sampleRate !== 48000 && ctx.sampleRate !== 44100) {
        addToast(translate('toast.sampleRate', langRef.current, { rate: ctx.sampleRate }), 'warn');
      }

      if (engineRef.current) {
        engineRef.current.updateSampleRate(ctx.sampleRate);
      }

      await startSequence();
    } finally {
      startInFlightRef.current = false;
    }
  };

  const handlePause = () => {
    debug('[DEBUG-ENGINE] handlePause execution. isRunning:', isRunning, 'engineExists:', !!engineRef.current);
    if (isRunning && engineRef.current) {
      debug('[DEBUG-ENGINE] handlePause inside branch. Pausing...');
      setIsPaused(true);
      stopEngine();
    }
  };

  const cancelStopHold = useCallback(() => {
    if (stopHoldRafRef.current !== null) {
      cancelAnimationFrame(stopHoldRafRef.current);
      stopHoldRafRef.current = null;
    }
    setStopHoldPct(0);
  }, [stopHoldRafRef, setStopHoldPct]);

  const beginStopHold = () => {
    if (stopHoldRafRef.current !== null) return;
    stopHoldStartRef.current = performance.now();
    const tick = () => {
      const pct = Math.min(100, ((performance.now() - stopHoldStartRef.current) / STOP_HOLD_MS) * 100);
      setStopHoldPct(pct);
      if (pct >= 100) {
        stopHoldRafRef.current = null;
        setStopHoldPct(0);
        setIsPaused(false);
        stopEngine(true);
        holdStoppedRef.current = true;
      } else {
        stopHoldRafRef.current = requestAnimationFrame(tick);
      }
    };
    stopHoldRafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => {
    if (stopHoldRafRef.current !== null) cancelAnimationFrame(stopHoldRafRef.current);
  }, []);

  return {
    stopHoldPctRefs: { holdStoppedRef, stopHoldStartRef, stopHoldRafRef },
    beep, handleStartStop, handlePause, beginStopHold, cancelStopHold,
  };
}
