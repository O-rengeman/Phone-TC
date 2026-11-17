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
import { offsetMsWithOutputOffset, shiftTimecode } from '../utils/timecode';
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
    if (engineRef.current) {
      engineRef.current.setFps(FPS_OPTIONS[fpsIndex].value, FPS_OPTIONS[fpsIndex].drop);
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
      node.port.postMessage({
        type: 'config',
        volume: effectiveOutputVolume(volume, outputLevel),
        ubit: userBits,
        mode: outputMode,
      });
    }
  }, [volume, userBits, outputMode, outputLevel, isRunning, workletNodeRef]);

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
      }
    }

    const currentTC = engineRef.current!.getTimecodeString().split(':').map(Number);
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
      if (engineRef.current) engineRef.current.setManualTimecode(tc);
      if (isVisualSlateRef.current) setSlateTime(tc);
    };

    if (outputMode === 'mono-l') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        const inputSource = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        inputSource.connect(analyser);
        analyser.connect(workletNode);
        analyserRef.current = analyser;
      } catch (err) {
        console.warn('Mic access denied', err);
        addToast(translate('toast.micDenied', langRef.current), 'error');
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
    analyserRef.current = null;
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
    } else {
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
      osc.start(0);
      osc.stop(0.1);

      if (ctx.sampleRate !== 48000 && ctx.sampleRate !== 44100) {
        addToast(translate('toast.sampleRate', langRef.current, { rate: ctx.sampleRate }), 'warn');
      }

      if (engineRef.current) {
        engineRef.current.updateSampleRate(ctx.sampleRate);
      }

      await startSequence();
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
