import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';

import { LtcEngine } from './utils/LtcEngine';
import type { SyncMessage, SyncResponseMessage } from './utils/PeerSync';
import { TimecodeNativeBridge } from './utils/TimecodeNativeBridge';
import { DriftMonitor } from './utils/DriftMonitor';
import { t as translate, getInitialLang, persistLang } from './utils/i18n';
import type { Lang } from './utils/i18n';
import toast from 'react-hot-toast';
import type { DriftStatus } from './utils/DriftMonitor';
import type { Marker } from './utils/export';
import { debug } from './utils/log';
import {
  FPS_OPTIONS,
  MAX_SYNC_INTERVAL_MS,
  DRIFT_RESYNC_THRESHOLD_SEC,
  HEARTBEAT_RESYNC_THRESHOLD_SEC,
  JAM_THRESHOLD_SEC,
  MAX_VALID_RTT_MS,
  RTT_HISTORY_LEN,
  RTT_SPIKE_FACTOR,
  RTT_STABLE_FLOOR_MS,
  HEARTBEAT_ASSUMED_LATENCY_MS,
  CLIENT_REPORT_WINDOW_MS,
  CLIENT_REPORT_WINDOW_SLACK_MS,
} from './constants';
import { STORAGE_KEYS, readStored, writeStoredString } from './utils/storage';
import { parseTcParts, shiftTimecode } from './utils/timecode';
import { useBatteryMonitor } from './hooks/useBatteryMonitor';
import { useWakeLock } from './hooks/useWakeLock';
import type { WakeLockStatus } from './hooks/useWakeLock';
import { useAudioContextRecovery } from './hooks/useAudioContextRecovery';
import { useMarkers } from './hooks/useMarkers';
import { useNetworkSync } from './hooks/useNetworkSync';
import { useP2P } from './hooks/useP2P';
import { useLtcEngine } from './hooks/useLtcEngine';
import { shouldUseMobileLayout } from './utils/layout';
import { SlateTimeContext } from './slateTimeContext';
import { MasterDriftContext } from './masterDriftContext';

export type SyncMode = 'system' | 'network' | 'p2p' | 'freerun';
export type ToastLevel = 'info' | 'warn' | 'error';
export type Toast = { id: number; msg: string; level: ToastLevel };

const getIsMobileLayout = () => {
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;

  return shouldUseMobileLayout({
    width: window.innerWidth,
    height: window.innerHeight,
    hasTouchInput: navigator.maxTouchPoints > 0 || hasCoarsePointer,
  });
};

// Native lock-screen/notification TC freshness — ~2Hz is plenty for a
// display that only needs to look live; the bridge call crosses IPC so it
// must not run at RAF rate.
const PLAYBACK_STATUS_INTERVAL_MS = 500;

// Split into two contexts so that a consumer reading only stable actions/refs
// doesn't re-render on every volatile state tick (masterDrift, clients,
// nowTick, ...). useLTC() below merges both back into one object so every
// existing consumer (App/VideoPlayer/ConnectionManager) keeps working
// unchanged.
//
// Caveat: several of the functions in LTCActionsType (addMarker,
// handleStartStop/handlePause/beginStopHold, handleManualResync,
// setupP2PMaster/setupP2PClient, removeMarker, exportToEDL/exportToALE)
// close directly over frequently-changing state (markers, isRunning,
// syncMode, ...) and aren't memoized at their source — see the useCallback
// commit that preceded this one for why.
// So the actions bucket recomputes on those functions' own triggers; that's
// an intentional, incremental step. Fully stabilizing the rest would mean
// converting those hooks' state reads to refs, deferred pending Phase 7
// device verification.
interface LTCStateType {
  isRunning: boolean;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  fpsIndex: number;
  setFpsIndex: React.Dispatch<React.SetStateAction<number>>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  syncStatus: { offset: number; latency: number; fromCache?: boolean } | null;
  syncMode: SyncMode;
  setSyncMode: React.Dispatch<React.SetStateAction<SyncMode>>;
  isPreparing: boolean;
  manualTimecode: string;
  setManualTimecode: React.Dispatch<React.SetStateAction<string>>;
  p2pRole: 'master' | 'client' | null;
  activeTab: 'main' | 'sync' | 'tools';
  setActiveTab: React.Dispatch<React.SetStateAction<'main' | 'sync' | 'tools'>>;
  isMobile: boolean;
  outputMode: 'stereo' | 'mono-l';
  setOutputMode: React.Dispatch<React.SetStateAction<'stereo' | 'mono-l'>>;
  autoUserBits: boolean;
  setAutoUserBits: React.Dispatch<React.SetStateAction<boolean>>;
  isSlateFlashing: boolean;
  isVisualSlate: boolean;
  setIsVisualSlate: React.Dispatch<React.SetStateAction<boolean>>;
  nowTick: number;
  userBits: string;
  setUserBits: React.Dispatch<React.SetStateAction<string>>;
  markers: Marker[];
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  defaultReelName: string;
  setDefaultReelName: React.Dispatch<React.SetStateAction<string>>;
  outputLevel: 'mic' | 'line';
  setOutputLevel: React.Dispatch<React.SetStateAction<'mic' | 'line'>>;
  outputOffset: number;
  setOutputOffset: React.Dispatch<React.SetStateAction<number>>;
  peerId: string;
  targetId: string;
  setTargetId: React.Dispatch<React.SetStateAction<string>>;
  p2pStatus: string;
  isHost: boolean;
  driftStatus: DriftStatus | null;
  isPaused: boolean;
  stopHoldPct: number;
  p2pSyncSource: 'manual' | 'network';
  setP2pSyncSource: React.Dispatch<React.SetStateAction<'manual' | 'network'>>;
  showGuide: boolean;
  setShowGuide: React.Dispatch<React.SetStateAction<boolean>>;
  isResyncing: boolean;
  isP2PSetupPending: boolean;
  lang: Lang;
  setLang: React.Dispatch<React.SetStateAction<Lang>>;
  batteryLevel: number | null;
  isCharging: boolean;
  batteryEta: number | null;
  wakeLockStatus: WakeLockStatus;
  markerFlash: { tc: string; color: string; count: number } | null;
  clients: Record<string, { rtt: number; drift: number; lastSeen: number }>;
  packetLossRate: number;
  setPacketLossRate: React.Dispatch<React.SetStateAction<number>>;
  sceneName: string;
  setSceneName: React.Dispatch<React.SetStateAction<string>>;
}

interface LTCActionsType {
  // The analyser is exposed as a ref (stable identity, no re-renders on
  // .current writes) so VuMeter can read live audio data via its own RAF
  // loop without threading ~60Hz vuLevel/isClipping state through this
  // context — that would re-render every consumer on every animation frame.
  analyserRef: React.RefObject<AnalyserNode | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.MutableRefObject<LtcEngine | null>;
  currentTcRef: React.MutableRefObject<string>;
  isVisualSlateRef: React.MutableRefObject<boolean>;
  slateTimeRef: React.MutableRefObject<string>;
  holdStoppedRef: React.MutableRefObject<boolean>;
  stopHoldStartRef: React.MutableRefObject<number>;
  stopHoldRafRef: React.MutableRefObject<number | null>;

  tr: (key: string, vars?: Record<string, string | number>) => string;
  addToast: (msg: string, level?: ToastLevel) => void;
  // setSlateTime lives here (not in state) because the dispatch identity is
  // stable — consumers never re-render from it. The slate *value* is exposed
  // via SlateTimeContext (slateTimeContext.ts) so ~30fps TC updates only
  // re-render <VisualSlate>.
  setSlateTime: React.Dispatch<React.SetStateAction<string>>;
  addMarker: (color: 'Red' | 'Blue' | 'Green' | 'Yellow') => void;
  removeMarker: (id: number) => void;
  updateMarkerComment: (id: number, comment: string) => void;
  exportToEDL: () => void;
  exportToALE: () => void;
  exportToFCPXML: () => void;
  exportToResolve: () => void;
  exportToCSV: () => void;
  exportToOTIO: () => void;
  handleSlateClick: () => void;
  resetP2P: () => void;
  setupP2PMaster: () => Promise<void>;
  setupP2PClient: (autoJoinId?: string) => Promise<void>;
  joinSession: () => void;
  handleStartStop: () => Promise<void>;
  handlePause: () => void;
  beginStopHold: () => void;
  cancelStopHold: () => void;
  handleManualResync: () => Promise<void>;
  /**
   * Recalls a logged marker's timecode: always becomes the manual/next-start
   * TC; jams the running worklet only in freerun, otherwise just toasts why
   * the live output was left alone.
   */
  recallTimecode: (tc: string) => void;
}

type LTCSyncContextType = LTCStateType & LTCActionsType;

const LTCStateContext = createContext<LTCStateType | null>(null);
const LTCActionsContext = createContext<LTCActionsType | null>(null);

export function LTCSyncProvider({ children }: { children: React.ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [fpsIndex, setFpsIndex] = useState(() => readStored(STORAGE_KEYS.fps, 2, (raw) => {
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 && n < FPS_OPTIONS.length ? n : undefined;
  }));
  const [volume, setVolume] = useState(() => readStored(STORAGE_KEYS.volume, 0.5, (raw) => {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('network');
  const [isPreparing, setIsPreparing] = useState(false);
  const [manualTimecode, setManualTimecode] = useState('00:00:00:00');
  const [p2pRole, setP2pRole] = useState<'master' | 'client' | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'sync' | 'tools'>('main');
  const [isMobile, setIsMobile] = useState(getIsMobileLayout);
  
  const [outputMode, setOutputMode] = useState<'stereo' | 'mono-l'>(() =>
    readStored(STORAGE_KEYS.outputMode, 'stereo' as const, (raw) =>
      raw === 'stereo' || raw === 'mono-l' ? raw : undefined));
  const [autoUserBits, setAutoUserBits] = useState(() =>
    readStored(STORAGE_KEYS.autoUserBits, true, (raw) =>
      raw === 'true' ? true : raw === 'false' ? false : undefined));
  const [isSlateFlashing, setIsSlateFlashing] = useState(false);
  const [slateTime, setSlateTime] = useState('00:00:00:00');

  useEffect(() => {
    const handleResize = () => setIsMobile(getIsMobileLayout());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [userBits, setUserBits] = useState('00000000');
  const [isVisualSlate, setIsVisualSlate] = useState(false);
  const isVisualSlateRef = useRef(false);
  const slateTimeRef = useRef(slateTime);

  useEffect(() => {
    isVisualSlateRef.current = isVisualSlate;
  }, [isVisualSlate]);

  useEffect(() => {
    slateTimeRef.current = slateTime;
  }, [slateTime]);

  const [defaultReelName, setDefaultReelName] = useState('A001');
  const [sceneName, setSceneName] = useState(() =>
    readStored(STORAGE_KEYS.scene, '001', (raw) => raw.length > 0 ? raw : undefined));
  const [outputLevel, setOutputLevel] = useState<'mic' | 'line'>(() =>
    readStored(STORAGE_KEYS.outputLevel, 'line' as const, (raw) =>
      raw === 'mic' || raw === 'line' ? raw : undefined));
  const [outputOffset, setOutputOffset] = useState(() =>
    readStored(STORAGE_KEYS.outputOffset, 0, (raw) => {
      const n = parseInt(raw, 10);
      return Number.isInteger(n) ? Math.min(10, Math.max(-10, n)) : undefined;
    }));

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.scene, sceneName);
  }, [sceneName]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.fps, fpsIndex.toString());
    writeStoredString(STORAGE_KEYS.volume, volume.toString());
    writeStoredString(STORAGE_KEYS.outputMode, outputMode);
    writeStoredString(STORAGE_KEYS.outputLevel, outputLevel);
    writeStoredString(STORAGE_KEYS.autoUserBits, autoUserBits.toString());
    writeStoredString(STORAGE_KEYS.outputOffset, outputOffset.toString());
  }, [fpsIndex, volume, outputMode, outputLevel, autoUserBits, outputOffset]);

  const lastNetworkOffsetRef = useRef<number | null>(null);
  const driftMonitorRef = useRef<DriftMonitor>(new DriftMonitor());
  const [isPaused, setIsPaused] = useState(false);
  const [stopHoldPct, setStopHoldPct] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const langRef = useRef<Lang>(lang);

  const tr = useCallback((key: string, vars?: Record<string, string | number>) => translate(key, lang, vars), [lang]);
  useEffect(() => { langRef.current = lang; persistLang(lang); }, [lang]);

  const { batteryLevel, isCharging, batteryEta } = useBatteryMonitor(langRef);

  const [p2pSyncSource, setP2pSyncSource] = useState<'manual' | 'network'>('manual');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const onMasterHeartbeatTimeoutRef = useRef<(() => void) | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockStatus = useWakeLock(isRunning);
  useAudioContextRecovery(audioCtxRef, isRunning);

  const engineRef = useRef<LtcEngine | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const currentTcRef = useRef<string>('00:00:00:00');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const addToast = useCallback((msg: string, level: ToastLevel = 'info') => {
    if (level === 'error') {
      toast.error(msg);
    } else if (level === 'warn') {
      toast(msg, { icon: '⚠️' });
    } else {
      toast.success(msg);
    }
  }, []);

  // Stable identity for useP2P's heartbeat-timeout watchdog — an inline arrow
  // here would get a new identity every provider render and churn the 500ms
  // interval effect inside useP2P.
  const onMasterHeartbeatTimeoutStable = useCallback(() => {
    onMasterHeartbeatTimeoutRef.current?.();
  }, []);

  const {
    peerId, targetId, setTargetId, p2pStatus, setP2pStatus, isHost,
    masterDrift, setMasterDrift, clients, setClients,
    packetLossRate, setPacketLossRate,
    peerSyncRef, messageHandlerRef, rttHistoryRef, lastSyncTimeRef, lastP2pSyncTimeRef, lastMasterContactTimeRef,
    connectAttemptedForRef,
    isP2PSetupPending,
    resetP2P, setupP2PMaster, setupP2PClient, joinSession,
  } = useP2P({
    syncMode,
    setSyncMode,
    p2pRole,
    setP2pRole,
    isRunning,
    isPaused,
    langRef,
    addToast,
    onMasterHeartbeatTimeout: onMasterHeartbeatTimeoutStable,
  });

  // Switching the sync source away from P2P must tear the session down —
  // otherwise the PeerJS peer, heartbeat broadcast and client watchdog keep
  // running underneath a different sync mode. Consumers get this guarded
  // setter; useP2P's own internal transitions keep the raw dispatch.
  const syncModeRef = useRef(syncMode);
  const p2pRoleRef = useRef(p2pRole);
  useEffect(() => {
    syncModeRef.current = syncMode;
    p2pRoleRef.current = p2pRole;
  }, [syncMode, p2pRole]);

  const setSyncModeGuarded = useCallback<React.Dispatch<React.SetStateAction<SyncMode>>>(
    (action) => {
      const next = typeof action === 'function'
        ? action(syncModeRef.current)
        : action;
      if (next !== 'p2p' && p2pRoleRef.current !== null) {
        resetP2P();
      }
      setSyncMode(next);
    },
    [resetP2P],
  );

  useEffect(() => {
    if (!p2pRole) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [p2pRole]);

  useEffect(() => {
    // StatusBar and ScreenOrientation are native-only. Calling them in a
    // browser throws on every load and buries real problems under plugin
    // warnings, so ask the platform first rather than catching afterwards.
    if (!Capacitor.isNativePlatform()) {
      debug('Skipping native StatusBar/Orientation setup (web environment)');
      return;
    }

    const initMobile = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (err) {
        debug('StatusBar/Orientation setup failed', err);
      }
    };
    void initMobile();
  }, []);

  useEffect(() => {
    // Returns the unsubscribe handle — StrictMode double-mount and tab
    // switches used to stack duplicate native listeners (double toasts).
    return TimecodeNativeBridge.addInterruptionListener((state) => {
      if (state === 'began') {
        addToast(translate('toast.interruptBegan', langRef.current), 'error');
      } else {
        addToast(translate('toast.interruptEnded', langRef.current), 'info');
        const ctx = audioCtxRef.current;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch((e: unknown) => console.warn('AudioContext resume after interruption failed', e));
        }
      }
    });
  }, [addToast]);

  const applySyncToWorklet = useCallback((masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    // getCorrectedTc returns null when the peer-supplied TC can't be parsed —
    // skip the correction rather than jamming a garbage label into the worklet.
    let corrected = engine.getCorrectedTc(masterTcStr, oneWayLatencyMs, isMasterRunning);
    if (corrected === null) return;

    if (outputOffset !== 0) {
      corrected = shiftTimecode(corrected, outputOffset, FPS_OPTIONS[fpsIndex].value, FPS_OPTIONS[fpsIndex].drop);
    }

    const node = workletNodeRef.current;
    if (isRunning && node) {
      const diff = engine.getDiffSeconds(corrected);
      if (diff > JAM_THRESHOLD_SEC) {
        // parseTcParts accepts ':'/';'/'.' — drop-frame TCs stringify with ';'.
        const parts = parseTcParts(corrected);
        if (parts) {
          const [h, m, s, f] = parts;
          node.port.postMessage({ type: 'jam', h, m, s, f });
        }
      } else {
        const frameDiff = engine.signedFrameDiffTo(corrected);
        if (frameDiff !== 0) {
          // Send the full magnitude: the worklet accumulates pendingNudge
          // and consumes one frame per frame period. Sending only dir used
          // to cap correction at 1 frame per resync (1 frame / 30 s on the
          // network path), leaving multi-frame offsets in place for minutes.
          node.port.postMessage({ type: 'nudge', dir: frameDiff > 0 ? 1 : -1, frames: Math.abs(frameDiff) });
        }
      }
    } else {
      engine.setManualTimecode(corrected);
    }
  }, [isRunning, outputOffset, fpsIndex]);

  // Marker-timeline recall: jumping back to a logged TC. manualTimecode is
  // always updated — it is both the idle display source and the freerun
  // start field, so the recalled value is what the next START emits.
  const recallTimecode = useCallback((tc: string) => {
    setManualTimecode(tc);
    const engine = engineRef.current;
    if (!engine) return;

    if (!isRunning) {
      // Idle path mirrors applySyncToWorklet: push the TC into the engine so
      // the readout and the next startEngine() pick it up. Paused counts as
      // idle here — the worklet is already disconnected.
      try {
        engine.setManualTimecode(tc);
        currentTcRef.current = engine.getTimecodeString();
      } catch {
        // Unparseable TC string — the manualTimecode state update above still
        // stands (the start-TC input validates on start, same as typing).
      }
      addToast(translate('toast.recallSet', langRef.current, { tc }), 'info');
      return;
    }

    if (p2pRole === 'client') {
      // A P2P client's TC is owned by the master session — jamming locally
      // would just be overwritten by the next heartbeat/sync-response.
      addToast(translate('toast.recallMasterControls', langRef.current), 'info');
      return;
    }

    if (syncMode === 'freerun') {
      // Free-run has no external clock to fight, so jam the live worklet.
      // parseTcParts accepts ':'/';'/'.' — drop-frame TCs stringify with ';'.
      const node = workletNodeRef.current;
      const parts = parseTcParts(tc);
      if (node && parts) {
        const [h, m, s, f] = parts;
        node.port.postMessage({ type: 'jam', h, m, s, f });
      }
      return;
    }

    // system/network/p2p while running: the resync loop would fight a manual
    // jam, so leave the output alone — the recall still applied to
    // manualTimecode for the next start.
    addToast(translate('toast.recallSynced', langRef.current), 'info');
  }, [isRunning, syncMode, p2pRole, engineRef, workletNodeRef, currentTcRef, addToast, langRef]);

  const {
    syncStatus, setSyncStatus, driftStatus, setDriftStatus,
    isResyncing, handleManualResync,
  } = useNetworkSync({
    syncMode, isRunning, p2pRole, fpsIndex, outputOffset,
    engineRef, driftMonitorRef, lastNetworkOffsetRef,
    applySyncToWorklet, langRef, addToast,
  });

  const {
    markers, setMarkers, markerFlash,
    addMarker, removeMarker, updateMarkerComment,
    exportToEDL, exportToALE, exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO,
  } = useMarkers({ engineRef, fpsIndex, defaultReelName, sceneName, langRef, addToast,
    syncMode, driftMonitorRef, p2pDriftSeconds: p2pRole === 'client' ? masterDrift : null,
    p2pLastSyncRef: lastP2pSyncTimeRef,
  });

  const {
    stopHoldPctRefs: { holdStoppedRef, stopHoldStartRef, stopHoldRafRef },
    beep, handleStartStop, handlePause, beginStopHold, cancelStopHold,
  } = useLtcEngine({
    fpsIndex, volume, outputLevel, userBits, outputMode, outputOffset, manualTimecode,
    syncMode, p2pRole, p2pSyncSource,
    isRunning, setIsRunning, isPaused, setIsPaused, setIsPreparing, setStopHoldPct, setSlateTime,
    isVisualSlateRef, audioCtxRef, engineRef, workletNodeRef, currentTcRef, analyserRef, micStreamRef,
    driftMonitorRef, lastNetworkOffsetRef, peerSyncRef, lastSyncTimeRef,
    setSyncStatus, setDriftStatus, langRef, addToast,
  });

  // Lock-screen / notification TC pump. This MUST live at provider level:
  // <VideoPlayer> unmounts whenever the operator leaves the main tab (and
  // DesktopShell keeps it mounted, but mobile tab switches don't), which
  // used to freeze the native playback status mid-take. setInterval rather
  // than RAF so it keeps ticking while the page is hidden — RAF stops
  // entirely then, which is exactly when the lock-screen TC matters.
  useEffect(() => {
    const pushPlaybackStatus = () => {
      const engine = engineRef.current;
      if (!engine) return;
      const tc = isRunning ? currentTcRef.current : engine.getTimecodeString();
      void TimecodeNativeBridge.updatePlaybackStatus(isRunning, tc);
    };
    pushPlaybackStatus();
    const id = setInterval(pushPlaybackStatus, PLAYBACK_STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning, engineRef, currentTcRef]);

  const syncClientToStoppedMaster = useCallback(() => {
    if (isRunning) {
      debug('[DEBUG-SYNC] Triggering handleStartStop to STOP');
      void handleStartStop();
      return;
    }

    if (isPaused) {
      debug('[DEBUG-SYNC] Clearing paused state after master stop/timeout');
      setIsPaused(false);
      if (engineRef.current) {
        engineRef.current.setManualTimecode(manualTimecode);
        currentTcRef.current = engineRef.current.getTimecodeString();
      }
    }
  }, [isRunning, isPaused, handleStartStop, setIsPaused, engineRef, manualTimecode, currentTcRef]);
  useEffect(() => {
    onMasterHeartbeatTimeoutRef.current = syncClientToStoppedMaster;
  }, [syncClientToStoppedMaster]);

  const getUnshiftedTc = useCallback((tcStr: string) => {
    if (outputOffset === 0) return tcStr;
    return shiftTimecode(tcStr, -outputOffset, FPS_OPTIONS[fpsIndex].value, FPS_OPTIONS[fpsIndex].drop);
  }, [outputOffset, fpsIndex]);

  // Shared by the sync-response and heartbeat branches below — both carry the
  // same master state and must reconcile fps/playback identically.
  const syncMasterFps = useCallback((fps: number, isDropFrame: boolean) => {
    const idx = FPS_OPTIONS.findIndex(o => o.value === fps && o.drop === isDropFrame);
    if (idx !== -1 && idx !== fpsIndex) setFpsIndex(idx);
  }, [fpsIndex]);

  const reconcilePlaybackWithMaster = useCallback((masterRunning: boolean, masterPaused: boolean, source: string) => {
    debug(`[DEBUG-SYNC] ${source}: masterRunning:`, masterRunning, 'masterPaused:', masterPaused, 'clientRunning:', isRunning, 'clientPaused:', isPaused);
    if (masterRunning === isRunning && masterPaused === isPaused) return;
    debug(`[DEBUG-SYNC] State mismatch detected in ${source}. Resolving...`);
    if (masterRunning && !isRunning) {
      debug('[DEBUG-SYNC] Triggering handleStartStop to START');
      void handleStartStop();
    } else if (!masterRunning) {
      if (masterPaused && isRunning) {
        debug('[DEBUG-SYNC] Triggering handlePause to PAUSE');
        handlePause();
      } else if (!masterPaused && (isRunning || isPaused)) {
        syncClientToStoppedMaster();
      }
    }
  }, [isRunning, isPaused, handleStartStop, handlePause, syncClientToStoppedMaster]);

  useEffect(() => {
    messageHandlerRef.current = (msg: SyncMessage) => {
      if (!engineRef.current) return;

      if (msg.type === 'sync-request' && isHost) {
        const response: SyncResponseMessage = {
          type: 'sync-response',
          masterTimecode: getUnshiftedTc(isRunning ? currentTcRef.current : engineRef.current.getTimecodeString()),
          masterTimestamp: performance.now(),
          fps: FPS_OPTIONS[fpsIndex].value,
          isDropFrame: FPS_OPTIONS[fpsIndex].drop,
          isRunning: isRunning,
          isPaused: isPaused,
          clientTimestamp: msg.clientTimestamp
        };
        if (msg.clientId) {
          // Answer ONLY the requester — broadcast send() would hand every
          // connected client a response echoing somebody else's
          // clientTimestamp (garbage RTT + a sync they never asked for).
          peerSyncRef.current?.sendTo(msg.clientId, response);

          // sync-request carries no rtt/drift — preserve whatever the client's
          // 'report' messages last reported instead of zeroing it out.
          setClients(prev => {
            const existing = prev[msg.clientId!] ?? { rtt: 0, drift: 0 };
            return { ...prev, [msg.clientId!]: { ...existing, lastSeen: Date.now() } };
          });
        }
      } else if (msg.type === 'report' && isHost) {
        if (msg.clientId) {
          setClients(prev => ({
            ...prev,
            [msg.clientId!]: {
              rtt: msg.rtt ?? 0,
              drift: msg.drift ?? 0,
              lastSeen: Date.now()
            }
          }));
        }
      } else if (msg.type === 'sync-response' && !isHost) {
        // Auth: only trust sync data from the master this device actually
        // DIALED — connectAttemptedForRef, not the editable targetId field
        // (retyping the field mid-session must not orphan the live conn).
        // clientId is stamped from the transport peer id, so a message from
        // any other peer (stray inbound conn, wrong session) is dropped
        // before it can move our timecode.
        if (msg.clientId !== connectAttemptedForRef.current) return;
        lastMasterContactTimeRef.current = Date.now();
        const now = performance.now();
        const rtt = now - (msg.clientTimestamp || now);

        if (rtt < 0 || rtt > MAX_VALID_RTT_MS) {
          setP2pStatus(`SKIP (bad RTT ${rtt.toFixed(0)}ms)`);
          return;
        }

        const oneWayLatency = rtt / 2;
        const history = [...rttHistoryRef.current, rtt].slice(-RTT_HISTORY_LEN);
        rttHistoryRef.current = history;

        // getDiffSeconds returns Infinity when the peer TC can't be parsed —
        // that's missing data, not a drift measurement. Store null so the
        // badge doesn't render "Infinity" and 'report' messages stay valid
        // (drift must be a finite number or absent per isSyncMessage).
        const rawDiff = engineRef.current.getDiffSeconds(msg.masterTimecode);
        const diff = Number.isFinite(rawDiff) ? rawDiff : null;
        setMasterDrift(diff);

        const avgRtt = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : rtt;
        const isRttStable = rtt <= avgRtt * RTT_SPIKE_FACTOR || rtt < RTT_STABLE_FLOOR_MS;

        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
        const shouldSync = ((diff !== null && Math.abs(diff) >= DRIFT_RESYNC_THRESHOLD_SEC) && isRttStable)
          || timeSinceLastSync >= MAX_SYNC_INTERVAL_MS;

        syncMasterFps(msg.fps, msg.isDropFrame);
        reconcilePlaybackWithMaster(msg.isRunning, msg.isPaused ?? false, 'sync-response');

        if (shouldSync && msg.isRunning) {
          applySyncToWorklet(msg.masterTimecode, oneWayLatency, msg.isRunning);
          lastSyncTimeRef.current = Date.now();
          lastP2pSyncTimeRef.current = lastSyncTimeRef.current;
        }

        const bestRtt = history.length > 0 ? Math.min(...history, rtt) : rtt;
        setP2pStatus(`${shouldSync ? 'SYNCED' : 'OK'} (RTT ${rtt.toFixed(0)}ms / MIN ${bestRtt.toFixed(0)}ms)`);

        peerSyncRef.current?.send({
          type: 'report',
          rtt: bestRtt,
          ...(diff !== null ? { drift: diff } : {})
        });
      } else if (msg.type === 'heartbeat' && !isHost) {
        if (msg.clientId !== connectAttemptedForRef.current) return;
        lastMasterContactTimeRef.current = Date.now();
        const rawDiff = engineRef.current.getDiffSeconds(msg.masterTimecode);
        const diff = Number.isFinite(rawDiff) ? rawDiff : null;
        setMasterDrift(diff);

        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
        const shouldSync = (diff !== null && Math.abs(diff) >= HEARTBEAT_RESYNC_THRESHOLD_SEC)
          || timeSinceLastSync >= MAX_SYNC_INTERVAL_MS;

        syncMasterFps(msg.fps, msg.isDropFrame);
        reconcilePlaybackWithMaster(msg.isRunning, msg.isPaused ?? false, 'heartbeat');

        if (shouldSync && msg.isRunning) {
          // Heartbeats carry no RTT sample — apply the assumed one-way latency.
          applySyncToWorklet(msg.masterTimecode, HEARTBEAT_ASSUMED_LATENCY_MS, msg.isRunning);
          lastSyncTimeRef.current = Date.now();
          lastP2pSyncTimeRef.current = lastSyncTimeRef.current;
        }
        setP2pStatus(`${shouldSync ? 'SYNCED' : 'OK'} (HB)`);

        if (Date.now() % CLIENT_REPORT_WINDOW_MS < CLIENT_REPORT_WINDOW_SLACK_MS) {
          peerSyncRef.current?.send({
            type: 'report',
            rtt: rttHistoryRef.current.length > 0 ? Math.min(...rttHistoryRef.current) : 0,
            ...(diff !== null ? { drift: diff } : {})
          });
        }
      }
    };
  });

  useEffect(() => {
    if (autoUserBits) {
      const updateAutoUB = () => {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const newUB = `${mm}${dd}${yy}01`;
        setUserBits(newUB);
      };
      updateAutoUB();
      const interval = setInterval(updateAutoUB, 60000);
      return () => clearInterval(interval);
    }
  }, [autoUserBits]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setUserBits(userBits);
    }
  }, [userBits]);

  const handleSlateClick = useCallback(() => {
    setIsSlateFlashing(true);
    const beepDuration = 1 / FPS_OPTIONS[fpsIndex].value;
    beep(1000, beepDuration);
    setTimeout(() => setIsSlateFlashing(false), Math.max(150, beepDuration * 1000 + 20));
  }, [fpsIndex, beep]);

  useEffect(() => {
    if (engineRef.current && p2pRole === 'master' && !isRunning && !isPaused) {
      try {
        engineRef.current.setManualTimecode(manualTimecode);
      } catch {
        // Ignore invalid format
      }
    }
  }, [manualTimecode, p2pRole, isRunning, isPaused]);

  // masterDrift updates ~10Hz (every heartbeat) — reading it through a ref
  // inside the interval keeps the 1s watchdog from being torn down and
  // recreated on every heartbeat, which used to starve it of ticks entirely.
  const masterDriftRef = useRef<number | null>(null);
  useEffect(() => {
    masterDriftRef.current = masterDrift;
  }, [masterDrift]);

  useEffect(() => {
    if (!peerSyncRef.current) return;

    const interval = setInterval(() => {
      if (!isHost && p2pRole === 'client') {
        const drift = masterDriftRef.current;
        const diff = drift !== null ? Math.abs(drift) : 0;
        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;

        if (diff >= DRIFT_RESYNC_THRESHOLD_SEC || timeSinceLastSync >= MAX_SYNC_INTERVAL_MS) {
          const sendSync = (delay = 0) => {
            setTimeout(() => {
              peerSyncRef.current?.broadcast({
                type: 'sync-request',
                clientTimestamp: performance.now()
              });
            }, delay);
          };
          
          sendSync(0);
          sendSync(100);
          sendSync(200);
        }
      }
    }, 1000);

    let hbInterval: ReturnType<typeof setInterval> | undefined;
    if (isHost) {
      hbInterval = setInterval(() => {
        peerSyncRef.current?.broadcast({
          type: 'heartbeat',
          masterTimecode: getUnshiftedTc(isRunning ? currentTcRef.current : engineRef.current!.getTimecodeString()),
          masterTimestamp: Date.now(),
          fps: FPS_OPTIONS[fpsIndex].value,
          isDropFrame: FPS_OPTIONS[fpsIndex].drop,
          isRunning: isRunning,
          isPaused: isPaused,
        });
      }, 100);
    }

    return () => {
      clearInterval(interval);
      if (hbInterval) clearInterval(hbInterval);
    };
    // masterDrift intentionally absent — it changes ~10Hz and is read via
    // masterDriftRef inside the interval; listing it would recreate both
    // intervals on every heartbeat and the 1s watchdog would never tick.
    // peerId IS required: setup assigns peerSyncRef.current only after
    // initialize() resolves, in the same batch that sets peerId — without it
    // this effect early-returns on the still-null ref and never re-runs, so
    // the heartbeat/watchdog intervals would never arm after P2P setup.
  }, [isHost, p2pRole, peerId, fpsIndex, isRunning, isPaused, getUnshiftedTc, lastSyncTimeRef, peerSyncRef]);

  // VU meter (peak level + clip detection for mono-L mic input) now lives in
  // useVuMeter() + <VuMeter>, consuming analyserRef directly, so its ~60Hz
  // state updates don't force this whole context's consumers to re-render.

  const stateValue = useMemo<LTCStateType>(() => ({
    isRunning, setIsRunning,
    fpsIndex, setFpsIndex,
    volume, setVolume,
    syncStatus,
    syncMode, setSyncMode: setSyncModeGuarded,
    isPreparing,
    isP2PSetupPending,
    manualTimecode, setManualTimecode,
    p2pRole,
    activeTab, setActiveTab,
    isMobile,
    outputMode, setOutputMode,
    autoUserBits, setAutoUserBits,
    isVisualSlate, setIsVisualSlate,
    isSlateFlashing,
    userBits, setUserBits,
    markers, setMarkers,
    defaultReelName, setDefaultReelName,
    outputLevel, setOutputLevel,
    outputOffset, setOutputOffset,
    peerId,
    targetId, setTargetId,
    p2pStatus,
    isHost,
    driftStatus,
    isPaused,
    stopHoldPct,
    p2pSyncSource, setP2pSyncSource,
    showGuide, setShowGuide,
    isResyncing,
    lang, setLang,
    batteryLevel,
    isCharging,
    batteryEta,
    wakeLockStatus,
    markerFlash,
    clients,
    packetLossRate, setPacketLossRate,
    sceneName, setSceneName,
    nowTick,
  }), [
    isRunning, fpsIndex, volume, syncStatus, syncMode, isPreparing, isP2PSetupPending, manualTimecode, p2pRole,
    activeTab, isMobile, outputMode, autoUserBits, isVisualSlate, isSlateFlashing,
    userBits, markers, defaultReelName, outputLevel, outputOffset,
    peerId, targetId, p2pStatus, isHost, driftStatus, isPaused, stopHoldPct, p2pSyncSource,
    showGuide,
    isResyncing, lang, batteryLevel, isCharging, batteryEta, wakeLockStatus, markerFlash, clients,
    packetLossRate, sceneName, nowTick,
    setIsRunning, setFpsIndex, setVolume, setSyncModeGuarded, setManualTimecode, setActiveTab, setOutputMode,
    setAutoUserBits, setIsVisualSlate, setUserBits, setMarkers, setDefaultReelName,
    setOutputLevel, setOutputOffset, setTargetId, setP2pSyncSource, setShowGuide,
    setLang, setPacketLossRate, setSceneName,
  ]);

  const actionsValue = useMemo<LTCActionsType>(() => ({
    analyserRef,
    canvasRef,
    engineRef,
    currentTcRef,
    isVisualSlateRef,
    slateTimeRef,
    holdStoppedRef,
    stopHoldStartRef,
    stopHoldRafRef,
    tr,
    addToast,
    setSlateTime,
    addMarker,
    removeMarker,
    updateMarkerComment,
    exportToEDL,
    exportToALE,
    exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO,
    handleSlateClick,
    resetP2P,
    setupP2PMaster,
    setupP2PClient,
    joinSession,
    handleStartStop,
    handlePause,
    beginStopHold,
    cancelStopHold,
    handleManualResync,
    recallTimecode,
  }), [
    analyserRef, canvasRef, engineRef, currentTcRef, isVisualSlateRef, slateTimeRef,
    holdStoppedRef, stopHoldStartRef, stopHoldRafRef,
    tr, addToast, setSlateTime, addMarker, removeMarker, updateMarkerComment, exportToEDL,
    exportToALE, exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO, handleSlateClick, resetP2P, setupP2PMaster, setupP2PClient, joinSession,
    handleStartStop, handlePause, beginStopHold, cancelStopHold, handleManualResync, recallTimecode,
  ]);

  return (
    <LTCStateContext.Provider value={stateValue}>
      <LTCActionsContext.Provider value={actionsValue}>
        <SlateTimeContext.Provider value={slateTime}>
          <MasterDriftContext.Provider value={masterDrift}>
            {children}
          </MasterDriftContext.Provider>
        </SlateTimeContext.Provider>
      </LTCActionsContext.Provider>
    </LTCStateContext.Provider>
  );
}

// Co-exporting this hook alongside LTCSyncProvider is the standard
// Context+Provider+hook pattern; splitting it into its own file would only
// relocate the "non-component export" fast-refresh limitation, not remove it.
// eslint-disable-next-line react-refresh/only-export-components
export function useLTC(): LTCSyncContextType {
  const state = useContext(LTCStateContext);
  const actions = useContext(LTCActionsContext);
  if (!state || !actions) {
    throw new Error('useLTC must be used within a LTCSyncProvider');
  }
  return { ...state, ...actions };
}
