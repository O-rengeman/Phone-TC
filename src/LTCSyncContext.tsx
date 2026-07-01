/* eslint-disable react-hooks/purity, react-hooks/refs, react-hooks/exhaustive-deps, react-refresh/only-export-components, @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

import { LtcEngine } from './utils/LtcEngine';
import type { LtcSettings } from './utils/LtcEngine';
import { TimeSync } from './utils/TimeSync';
import { PeerSync } from './utils/PeerSync';
import type { SyncMessage } from './utils/PeerSync';
import { TimecodeNativeBridge } from './utils/TimecodeNativeBridge';
import { DriftMonitor } from './utils/DriftMonitor';
import { estimateMinutesRemaining, trimSamples } from './utils/battery';
import { t as translate, getInitialLang, persistLang } from './utils/i18n';
import type { Lang } from './utils/i18n';
import toast from 'react-hot-toast';
import type { BatterySample } from './utils/battery';
import type { DriftStatus } from './utils/DriftMonitor';
import { buildEdl, buildAle } from './utils/export';
import type { Marker } from './utils/export';
import { resolveTally, adoptTally } from './utils/tally';
import type { TallyState, TallyPayload } from './utils/tally';
import { LTC_WORKLET_SOURCE } from './audio/ltcWorkletSource';

export const FPS_OPTIONS = [
  { label: '23.976', value: 23.976, drop: false, fpsNum: 24000, fpsDen: 1001 },
  { label: '24', value: 24, drop: false, fpsNum: 24000, fpsDen: 1000 },
  { label: '25', value: 25, drop: false, fpsNum: 25000, fpsDen: 1000 },
  { label: '29.97', value: 29.97, drop: false, fpsNum: 30000, fpsDen: 1001 },
  { label: '29.97 DF', value: 29.97, drop: true, fpsNum: 30000, fpsDen: 1001 },
  { label: '30', value: 30, drop: false, fpsNum: 30000, fpsDen: 1000 },
];

export const MARKER_HEX: Record<string, string> = {
  Red: '#ff3b40', Blue: '#3b82f6', Green: '#22c55e', Yellow: '#f59e0b',
};

export type SyncMode = 'system' | 'network' | 'p2p' | 'freerun';
export type ToastLevel = 'info' | 'warn' | 'error';
export type Toast = { id: number; msg: string; level: ToastLevel };

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
};

interface LTCSyncContextType {
  isRunning: boolean;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  fpsIndex: number;
  setFpsIndex: React.Dispatch<React.SetStateAction<number>>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  syncStatus: { offset: number; latency: number } | null;
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
  slateTime: string;
  setSlateTime: React.Dispatch<React.SetStateAction<string>>;
  setTallyTime: React.Dispatch<React.SetStateAction<string>>;
  setDirectorTime: React.Dispatch<React.SetStateAction<string>>;
  nowTick: number;
  userBits: string;
  setUserBits: React.Dispatch<React.SetStateAction<string>>;
  markers: Marker[];
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  defaultReelName: string;
  setDefaultReelName: React.Dispatch<React.SetStateAction<string>>;
  outputLevel: 'mic' | 'line';
  setOutputLevel: React.Dispatch<React.SetStateAction<'mic' | 'line'>>;
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
  tallyOpen: boolean;
  setTallyOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tallyMode: 'auto' | 'manual';
  setTallyMode: React.Dispatch<React.SetStateAction<'auto' | 'manual'>>;
  tallyTorchEnabled: boolean;
  setTallyTorchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  manualTally: TallyState;
  tallyPayload: TallyPayload | null;
  tallyTime: string;
  tallyDimmerOpacity: number;
  setTallyDimmerOpacity: React.Dispatch<React.SetStateAction<number>>;
  tallyTcSize: 'sm' | 'md' | 'lg';
  setTallyTcSize: React.Dispatch<React.SetStateAction<'sm' | 'md' | 'lg'>>;
  directorPanelOpen: boolean;
  setDirectorPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  directorTime: string;
  cameraLabels: Record<string, string>;
  setCameraLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tallyActionLog: { time: string; cam: string; state: string }[];
  isResyncing: boolean;
  lang: Lang;
  setLang: React.Dispatch<React.SetStateAction<Lang>>;
  batteryLevel: number | null;
  isCharging: boolean;
  batteryEta: number | null;
  markerFlash: { tc: string; color: string; count: number } | null;
  masterDrift: number | null;
  clients: Record<string, { rtt: number; drift: number; lastSeen: number }>;
  packetLossRate: number;
  setPacketLossRate: React.Dispatch<React.SetStateAction<number>>;
  vuLevel: number;
  isClipping: boolean;
  sceneName: string;
  setSceneName: React.Dispatch<React.SetStateAction<string>>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.MutableRefObject<LtcEngine | null>;
  currentTcRef: React.MutableRefObject<string>;
  isVisualSlateRef: React.MutableRefObject<boolean>;
  slateTimeRef: React.MutableRefObject<string>;
  tallyTimeRef: React.MutableRefObject<string>;
  tallyOpenRef: React.MutableRefObject<boolean>;
  directorTimeRef: React.MutableRefObject<string>;
  directorPanelOpenRef: React.MutableRefObject<boolean>;
  holdStoppedRef: React.MutableRefObject<boolean>;
  stopHoldStartRef: React.MutableRefObject<number>;
  stopHoldRafRef: React.MutableRefObject<number | null>;

  tr: (key: string, vars?: Record<string, string | number>) => string;
  playHapticFeedback: () => void;
  addToast: (msg: string, level?: ToastLevel) => void;
  addMarker: (color: 'Red' | 'Blue' | 'Green' | 'Yellow') => void;
  removeMarker: (id: number) => void;
  updateMarkerComment: (id: number, comment: string) => void;
  exportToEDL: () => void;
  exportToALE: () => void;
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
  handleManualTallyChange: (s: TallyState) => void;
  handleClientTallyChange: (clientId: string, s: TallyState) => void;
  handleAllTallyChange: (s: TallyState) => void;
  tallyState: TallyState;
  isTallyConnected: boolean;
  handleDimmerCycle: (e: React.MouseEvent) => void;
  handleTorchToggle: (e: React.MouseEvent) => void;
  handleTallyExit: (e: React.MouseEvent) => void;
}

const LTCSyncContext = createContext<LTCSyncContextType | null>(null);

export function LTCSyncProvider({ children }: { children: React.ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [fpsIndex, setFpsIndex] = useState(() => {
    try { const saved = localStorage.getItem('ltc-fps'); return saved ? parseInt(saved, 10) : 2; } catch { return 2; }
  });
  const [volume, setVolume] = useState(() => {
    try { const saved = localStorage.getItem('ltc-vol'); return saved ? parseFloat(saved) : 0.5; } catch { return 0.5; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [syncStatus, setSyncStatus] = useState<{ offset: number; latency: number } | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('network');
  const [isPreparing, setIsPreparing] = useState(false);
  const [manualTimecode, setManualTimecode] = useState('00:00:00:00');
  const [p2pRole, setP2pRole] = useState<'master' | 'client' | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'sync' | 'tools'>('main');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  const [outputMode, setOutputMode] = useState<'stereo' | 'mono-l'>(() => {
    try { const saved = localStorage.getItem('ltc-outmode'); return (saved === 'stereo' || saved === 'mono-l') ? saved : 'stereo'; } catch { return 'stereo'; }
  });
  const [autoUserBits, setAutoUserBits] = useState(() => {
    try { const saved = localStorage.getItem('ltc-autoub'); return saved ? saved === 'true' : true; } catch { return true; }
  });
  const [isSlateFlashing, setIsSlateFlashing] = useState(false);
  const [slateTime, setSlateTime] = useState('00:00:00:00');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
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

  const [markers, setMarkers] = useState<Marker[]>(() => {
    try {
      const saved = localStorage.getItem('ltc-markers');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [defaultReelName, setDefaultReelName] = useState('A001');
  const [sceneName, setSceneName] = useState(() => {
    try { const saved = localStorage.getItem('ltc-scene'); return saved || '001'; } catch { return '001'; }
  });
  const [outputLevel, setOutputLevel] = useState<'mic' | 'line'>(() => {
    try { const saved = localStorage.getItem('ltc-outlevel'); return (saved === 'mic' || saved === 'line') ? saved : 'line'; } catch { return 'line'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ltc-scene', sceneName);
    } catch { /* ignore */ }
  }, [sceneName]);

  useEffect(() => {
    try {
      localStorage.setItem('ltc-fps', fpsIndex.toString());
      localStorage.setItem('ltc-vol', volume.toString());
      localStorage.setItem('ltc-outmode', outputMode);
      localStorage.setItem('ltc-outlevel', outputLevel);
      localStorage.setItem('ltc-autoub', autoUserBits.toString());
    } catch { /* ignore */ }
  }, [fpsIndex, volume, outputMode, outputLevel, autoUserBits]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      setupP2PClient(joinId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P2P States
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [p2pStatus, setP2pStatus] = useState<string>('P2P DISCONNECTED');
  const [isHost, setIsHost] = useState(false);
  const rttHistoryRef = useRef<number[]>([]);
  const lastNetworkOffsetRef = useRef<number | null>(null);
  const driftMonitorRef = useRef<DriftMonitor>(new DriftMonitor());
  const [driftStatus, setDriftStatus] = useState<DriftStatus | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [stopHoldPct, setStopHoldPct] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  
  const [tallyOpen, setTallyOpen] = useState(false);
  const [tallyMode, setTallyMode] = useState<'auto' | 'manual'>('auto');
  const [tallyTorchEnabled, setTallyTorchEnabled] = useState(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const [manualTally, setManualTally] = useState<TallyState>('off');
  const [tallyPayload, setTallyPayload] = useState<TallyPayload | null>(null);
  const tallyRevRef = useRef<number>(0);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const [tallyTime, setTallyTime] = useState<string>('00:00:00:00');
  const tallyTimeRef = useRef<string>(tallyTime);
  const tallyOpenRef = useRef<boolean>(tallyOpen);
  const tallyControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tallyDimmerOpacity, setTallyDimmerOpacity] = useState(0);
  const [tallyTcSize, setTallyTcSize] = useState<'sm' | 'md' | 'lg'>(() => {
    try {
      const saved = localStorage.getItem('ltc-tally-tc-size');
      return (saved === 'sm' || saved === 'md' || saved === 'lg') ? saved : 'md';
    } catch { return 'md'; }
  });

  const playHapticFeedback = () => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 850;
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.05);
    } catch {
      // Ignore haptic audio errors on auto-play policy
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('ltc-tally-tc-size', tallyTcSize);
    } catch { /* ignore */ }
  }, [tallyTcSize]);
  
  const [directorPanelOpen, setDirectorPanelOpen] = useState(false);
  const [directorTime, setDirectorTime] = useState<string>('00:00:00:00');
  const directorTimeRef = useRef<string>(directorTime);
  const directorPanelOpenRef = useRef<boolean>(directorPanelOpen);
  const [cameraLabels, setCameraLabels] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('ltc-camera-labels');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [tallyActionLog, setTallyActionLog] = useState<{time: string; cam: string; state: string}[]>([]);

  const [isResyncing, setIsResyncing] = useState(false);
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const langRef = useRef<Lang>(lang);
  
  useEffect(() => {
    tallyOpenRef.current = tallyOpen;
    if (!tallyOpen) {
      if (tallyControlsTimerRef.current) {
        clearTimeout(tallyControlsTimerRef.current);
        tallyControlsTimerRef.current = null;
      }
    }
  }, [tallyOpen]);

  useEffect(() => {
    directorPanelOpenRef.current = directorPanelOpen;
  }, [directorPanelOpen]);

  const tr = (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars);
  useEffect(() => { langRef.current = lang; persistLang(lang); }, [lang]);

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [batteryEta, setBatteryEta] = useState<number | null>(null);
  const batterySamplesRef = useRef<BatterySample[]>([]);
  const [markerFlash, setMarkerFlash] = useState<{ tc: string; color: string; count: number } | null>(null);
  const markerFlashTimerRef = useRef<number | null>(null);

  const prevLevelRef = useRef<number | null>(null);
  const prevChargingRef = useRef<boolean | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    let batt: BatteryLike | null = null;
    let cancelled = false;
    const onLevel = () => {
      if (!batt) return;
      setBatteryLevel(batt.level);
      setIsCharging(batt.charging);
      
      const p = prevLevelRef.current;
      const c = batt.level;
      if (p !== null && !batt.charging) {
        if (p > 0.20 && c <= 0.20 && c > 0.10) {
           toast(translate('toast.batteryLow', langRef.current, { level: Math.round(c * 100) }), { icon: '🔋', style: { background: '#f5a623', color: '#000' } });
        } else if (p > 0.10 && c <= 0.10) {
           toast.error(translate('toast.batteryCritical', langRef.current, { level: Math.round(c * 100) }));
        }
      }
      prevLevelRef.current = c;
      prevChargingRef.current = batt.charging;

      if (batt.charging) {
        batterySamplesRef.current = [];
        setBatteryEta(null);
        return;
      }
      const now = Date.now();
      const buf = trimSamples([...batterySamplesRef.current, { level: batt.level, at: now }], now, 15 * 60_000);
      batterySamplesRef.current = buf;
      setBatteryEta(estimateMinutesRemaining(buf));
    };
    const onCharging = () => {
      if (!batt) return;
      setIsCharging(batt.charging);
      
      const p = prevChargingRef.current;
      const c = batt.charging;
      if (p !== null && p !== c) {
        if (c) {
          toast.success(translate('toast.chargingStarted', langRef.current));
        } else {
          toast(translate('toast.chargingStopped', langRef.current), { icon: '🔋' });
        }
      }
      prevChargingRef.current = c;

      if (batt.charging) {
        batterySamplesRef.current = [];
        setBatteryEta(null);
      }
    };
    nav.getBattery().then((b) => {
      if (cancelled) return;
      batt = b;
      setBatteryLevel(b.level);
      setIsCharging(b.charging);
      b.addEventListener('levelchange', onLevel);
      b.addEventListener('chargingchange', onCharging);
    }).catch(() => { /* battery info unavailable */ });
    return () => {
      cancelled = true;
      if (batt) {
        batt.removeEventListener('levelchange', onLevel);
        batt.removeEventListener('chargingchange', onCharging);
      }
    };
  }, []);

  useEffect(() => () => {
    if (markerFlashTimerRef.current !== null) clearTimeout(markerFlashTimerRef.current);
  }, []);

  const stopHoldRafRef = useRef<number | null>(null);
  const holdStoppedRef = useRef(false);
  const stopHoldStartRef = useRef(0);
  const [p2pSyncSource, setP2pSyncSource] = useState<'manual' | 'network'>('manual');
  const [masterDrift, setMasterDrift] = useState<number | null>(null);
  const [clients, setClients] = useState<Record<string, { rtt: number, drift: number, lastSeen: number }>>({});
  const [packetLossRate, setPacketLossRate] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    if (isRunning && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as any).wakeLock.request('screen').then((lock: any) => {
        wakeLockRef.current = lock;
      }).catch((err: any) => console.warn('Wake Lock error', err));
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isRunning]);
  const engineRef = useRef<LtcEngine | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const currentTcRef = useRef<string>('00:00:00:00');
  const peerSyncRef = useRef<PeerSync | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [vuLevel, setVuLevel] = useState(0);
  const [isClipping, setIsClipping] = useState(false);
  const clipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addToast = (msg: string, level: ToastLevel = 'info') => {
    if (level === 'error') {
      toast.error(msg);
    } else if (level === 'warn') {
      toast(msg, { icon: '⚠️' });
    } else {
      toast.success(msg);
    }
  };

  useEffect(() => {
    lastSyncTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [isHost]);

  useEffect(() => {
    const initMobile = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch {
        console.debug('StatusBar/Orientation unavailable (non-native environment)');
      }
    };
    initMobile();
  }, []);

  useEffect(() => {
    TimecodeNativeBridge.addInterruptionListener(async (state) => {
      if (state === 'began') {
        addToast(translate('toast.interruptBegan', langRef.current), 'error');
      } else {
        addToast(translate('toast.interruptEnded', langRef.current), 'info');
        const ctx = audioCtxRef.current;
        if (ctx && ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch (e) {
            console.warn('AudioContext resume after interruption failed', e);
          }
        }
      }
    });
  }, []);

  useEffect(() => {
    const settings: LtcSettings = {
      fps: FPS_OPTIONS[fpsIndex].value,
      sampleRate: 48000,
      volume: outputLevel === 'line' ? volume : volume * 0.1,
      isDropFrame: FPS_OPTIONS[fpsIndex].drop,
      userBits: userBits,
      outputMode: outputMode,
      fpsNum: FPS_OPTIONS[fpsIndex].fpsNum,
      fpsDen: FPS_OPTIONS[fpsIndex].fpsDen
    };
    engineRef.current = new LtcEngine(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setFps(FPS_OPTIONS[fpsIndex].value, FPS_OPTIONS[fpsIndex].drop);
    }
  }, [fpsIndex]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const node = workletNodeRef.current;
    if (isRunning && node) {
      node.port.postMessage({
        type: 'config',
        volume: outputLevel === 'line' ? volume : volume * 0.1,
        ubit: userBits,
        mode: outputMode,
      });
    }
  }, [volume, userBits, outputMode, outputLevel, isRunning]);

  const applySyncToWorklet = useCallback((masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    const corrected = engine.getCorrectedTc(masterTcStr, oneWayLatencyMs, isMasterRunning);
    const node = workletNodeRef.current;
    if (isRunning && node) {
      const diff = engine.getDiffSeconds(corrected);
      if (diff > 0.5) {
        const parts = corrected.split(':').map(Number);
        node.port.postMessage({ type: 'jam', h: parts[0], m: parts[1], s: parts[2], f: parts[3] });
      } else {
        const frameDiff = engine.signedFrameDiffTo(corrected);
        if (frameDiff !== 0) {
          node.port.postMessage({ type: 'nudge', dir: frameDiff > 0 ? 1 : -1 });
        }
      }
    } else {
      engine.setManualTimecode(corrected);
    }
  }, [isRunning]);

  const messageHandlerRef = useRef<(msg: SyncMessage) => void>(null);

  useEffect(() => {
    messageHandlerRef.current = (msg: SyncMessage) => {
      if (engineRef.current) {
        if (msg.type === 'sync-request' && isHost) {
          const response: SyncMessage = {
            type: 'sync-response',
            masterTimecode: isRunning ? currentTcRef.current : engineRef.current.getTimecodeString(),
            masterTimestamp: performance.now(),
            fps: FPS_OPTIONS[fpsIndex].value,
            isDropFrame: FPS_OPTIONS[fpsIndex].drop,
            isRunning: isRunning,
            clientTimestamp: msg.clientTimestamp
          };
          peerSyncRef.current?.send(response);
          
          if (msg.clientId) {
             setClients(prev => ({
               ...prev,
               [msg.clientId!]: {
                 ...prev[msg.clientId!] || { drift: 0 },
                 lastSeen: Date.now(),
                 rtt: msg.rtt || 0
               }
             }));
          }
        } else if (msg.type === 'report' && isHost) {
          if (msg.clientId) {
            setClients(prev => ({
              ...prev,
              [msg.clientId!]: {
                rtt: msg.rtt || 0,
                drift: msg.drift || 0,
                lastSeen: Date.now()
              }
            }));
          }
        } else if (msg.type === 'sync-response' && !isHost) {
          const now = performance.now();
          const rtt = now - (msg.clientTimestamp || now);
          
          if (rtt < 0 || rtt > 5000) {
            setP2pStatus(`SKIP (bad RTT ${rtt.toFixed(0)}ms)`);
            return;
          }
          
          const oneWayLatency = rtt / 2;
          const history = [...rttHistoryRef.current, rtt].slice(-15);
          rttHistoryRef.current = history;

          const diff = engineRef.current.getDiffSeconds(msg.masterTimecode);
          setMasterDrift(diff);

          const avgRtt = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : rtt;
          const isRttStable = rtt <= avgRtt * 1.5 || rtt < 80;

          const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
          const shouldSync = (Math.abs(diff) >= 0.03 && isRttStable) || timeSinceLastSync >= 15000;

          if (shouldSync) {
            applySyncToWorklet(
              msg.masterTimecode,
              oneWayLatency,
              msg.isRunning
            );
            lastSyncTimeRef.current = Date.now();
          }

          const bestRtt = history.length > 0 ? Math.min(...history, rtt) : rtt;
          setP2pStatus(`${shouldSync ? 'SYNCED' : 'OK'} (RTT ${rtt.toFixed(0)}ms / MIN ${bestRtt.toFixed(0)}ms)`);

          peerSyncRef.current?.send({
            type: 'report',
            masterTimecode: '',
            masterTimestamp: 0,
            fps: 0,
            isDropFrame: false,
            isRunning: false,
            rtt: bestRtt,
            drift: diff
          });
        } else if (msg.type === 'heartbeat' && !isHost) {
          const diff = engineRef.current.getDiffSeconds(msg.masterTimecode);
          setMasterDrift(diff);

          const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
          const shouldSync = Math.abs(diff) >= 0.05 || timeSinceLastSync >= 15000;

          if (shouldSync) {
            applySyncToWorklet(msg.masterTimecode, 0.03, msg.isRunning);
            lastSyncTimeRef.current = Date.now();
          }
          setP2pStatus(`${shouldSync ? 'SYNCED' : 'OK'} (HB)`);

          if (msg.tally) {
            setTallyPayload(prev => adoptTally(prev, msg.tally!));
          }

          lastHeartbeatTimeRef.current = Date.now();

          if (Date.now() % 5000 < 500) {
             peerSyncRef.current?.send({
                type: 'report',
                masterTimecode: '',
                masterTimestamp: 0,
                fps: 0,
                isDropFrame: false,
                isRunning: false,
                rtt: rttHistoryRef.current.length > 0 ? Math.min(...rttHistoryRef.current) : 0,
                drift: diff
             });
          }
        } else if (msg.type === 'tally' && !isHost) {
          if (msg.tally) {
            setTallyPayload(prev => adoptTally(prev, msg.tally!));
          }
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

  const backupMarkers = async (m: Marker[]) => {
    try {
      if ((window as any).Capacitor?.isNative) {
        await Filesystem.writeFile({
          path: 'ltc_sync_pro_backup.json',
          data: JSON.stringify(m, null, 2),
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
      }
    } catch (e) {
      console.warn('Backup to filesystem failed:', e);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('ltc-markers', JSON.stringify(markers));
      backupMarkers(markers);
    } catch { /* ignore */ }
  }, [markers]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setUserBits(userBits);
    }
  }, [userBits]);

  useEffect(() => {
    if (engineRef.current) {
      const vol = outputLevel === 'line' ? volume : volume * 0.1;
      engineRef.current.setVolume(vol);
    }
  }, [outputLevel, volume]);

  const addMarker = (color: 'Red' | 'Blue' | 'Green' | 'Yellow') => {
    const currentTC = engineRef.current ? engineRef.current.getTimecodeString() : '00:00:00:00';
    const nextTake = markers.length > 0 ? Math.max(...markers.map(m => m.take || 0)) + 1 : 1;
    const newMarker: Marker = {
      id: Date.now(),
      tc: currentTC,
      time: new Date().toLocaleTimeString(),
      color,
      reelName: defaultReelName,
      take: nextTake,
      sceneName: sceneName,
      comment: ''
    };
    setMarkers(prev => [newMarker, ...prev]);

    setMarkerFlash({ tc: currentTC, color, count: markers.length + 1 });
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(40);
    }
    if (markerFlashTimerRef.current !== null) clearTimeout(markerFlashTimerRef.current);
    markerFlashTimerRef.current = window.setTimeout(() => setMarkerFlash(null), 1300);
  };

  const removeMarker = (id: number) => {
    setMarkers(markers.filter(m => m.id !== id));
  };

  const updateMarkerComment = (id: number, comment: string) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, comment } : m));
  };

  const exportFile = async (content: string, filename: string) => {
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNative;
    if (isNative) {
      try {
        await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
        addToast(translate('toast.exportSaved', langRef.current, { path: `Documents/${filename}` }));
      } catch (e) {
        console.error('File export failed', e);
        addToast('File export failed', 'error');
      }
    } else {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const exportToEDL = () => {
    if (markers.length === 0) return;
    const edl = buildEdl(markers, FPS_OPTIONS[fpsIndex].drop);
    exportFile(edl, `PHONE_TC_${new Date().toISOString().slice(0, 10)}.edl`);
  };

  const exportToALE = () => {
    if (markers.length === 0) return;
    const ale = buildAle(markers, FPS_OPTIONS[fpsIndex].label);
    exportFile(ale, `PHONE_TC_${new Date().toISOString().slice(0, 10)}.ale`);
  };

  const handleSlateClick = () => {
    setIsSlateFlashing(true);
    beep(1000, 0.1);
    setTimeout(() => setIsSlateFlashing(false), 150);
  };

  const resetP2P = () => {
    if (peerSyncRef.current) {
      peerSyncRef.current.destroy();
      peerSyncRef.current = null;
    }
    setP2pRole(null);
    setIsHost(false);
    setPeerId('');
    if (syncMode === 'p2p') setSyncMode('network');
    setP2pStatus('P2P RESET');
  };

  const setupP2PMaster = async () => {
    resetP2P();
    setP2pRole('master');
    setIsHost(true);
    setSyncMode('p2p');
    try {
      const ps = new PeerSync(
        (msg) => messageHandlerRef.current?.(msg),
        (status) => setP2pStatus(status)
      );
      const id = await ps.initialize();
      setPeerId(id);
      peerSyncRef.current = ps;
    } catch (e) {
      console.warn('P2P master init failed', e);
      setP2pStatus('PEER INIT FAILED');
      addToast(translate('toast.p2pInitFailed', langRef.current), 'error');
    }
  };

  const setupP2PClient = async (autoJoinId?: string) => {
    resetP2P();
    setP2pRole('client');
    setIsHost(false);
    setSyncMode('p2p');
    try {
      const ps = new PeerSync(
        (msg) => messageHandlerRef.current?.(msg),
        (status) => setP2pStatus(status)
      );
      const id = await ps.initialize();
      setPeerId(id);
      peerSyncRef.current = ps;

      if (autoJoinId) {
        setTargetId(autoJoinId);
        ps.connect(autoJoinId);
      }
    } catch (e) {
      console.warn('P2P client init failed', e);
      setP2pStatus('PEER INIT FAILED');
      addToast(translate('toast.p2pClientFailed', langRef.current), 'error');
    }
  };

  useEffect(() => {
    if (engineRef.current && p2pRole === 'master' && !isRunning && !isPaused) {
      try {
        engineRef.current.setManualTimecode(manualTimecode);
      } catch {
        // Ignore invalid format
      }
    }
  }, [manualTimecode, p2pRole, isRunning, isPaused]);

  // Emergency Mode: Auto-reconnect & notify when disconnected during playback
  useEffect(() => {
    if (p2pRole === 'client' && p2pStatus.includes('CLOSED') && targetId) {
      if (isRunning) {
        addToast(translate('toast.p2pDisconnectedEmergency', langRef.current), 'error');
      }
      
      const reconnectTimer = setTimeout(() => {
        if (peerSyncRef.current && targetId) {
          setP2pStatus('RECONNECTING...');
          peerSyncRef.current.connect(targetId);
        }
      }, 5000);
      return () => clearTimeout(reconnectTimer);
    }
  }, [p2pRole, p2pStatus, targetId, isRunning]);

  const joinSession = () => {
    if (!peerSyncRef.current || !targetId) return;
    peerSyncRef.current.connect(targetId);
    setSyncMode('p2p');
    lastHeartbeatTimeRef.current = Date.now();
  };

  useEffect(() => {
    if (!peerSyncRef.current) return;

    const interval = setInterval(() => {
      if (!isHost && p2pRole === 'client') {
        const diff = masterDrift !== null ? Math.abs(masterDrift) : 0;
        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
        
        if (diff >= 0.03 || timeSinceLastSync >= 15000) {
          const sendSync = (delay = 0) => {
            setTimeout(() => {
              peerSyncRef.current?.broadcast({
                type: 'sync-request',
                masterTimecode: '',
                masterTimestamp: 0,
                fps: 0,
                isDropFrame: false,
                isRunning: false,
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
          masterTimecode: isRunning ? currentTcRef.current : engineRef.current!.getTimecodeString(),
          masterTimestamp: Date.now(),
          fps: FPS_OPTIONS[fpsIndex].value,
          isDropFrame: FPS_OPTIONS[fpsIndex].drop,
          isRunning: isRunning,
          tally: tallyPayload ?? undefined
        });
      }, 100);
    }

    return () => {
      clearInterval(interval);
      if (hbInterval) clearInterval(hbInterval);
    };
  }, [isHost, p2pRole, fpsIndex, masterDrift, isRunning, tallyPayload]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      peerSyncRef.current?.setLossRate(packetLossRate);
    }
  }, [packetLossRate]);

  useEffect(() => {
    if (!isRunning || outputMode !== 'mono-l') {
      return;
    }
    let rafId: number;
    const update = () => {
      if (analyserRef.current) {
        const data = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
        setVuLevel(peak);
        if (peak >= 0.95) {
          setIsClipping(true);
          if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
          clipTimeoutRef.current = setTimeout(() => {
            setIsClipping(false);
          }, 3000);
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(rafId);
      setVuLevel(0);
      setIsClipping(false);
      if (clipTimeoutRef.current) {
        clearTimeout(clipTimeoutRef.current);
        clipTimeoutRef.current = null;
      }
    };
  }, [isRunning, outputMode]);

  useEffect(() => {
    if (syncMode !== 'network' || !isRunning) return;

    const interval = setInterval(async () => {
      try {
        const result = await TimeSync.sync(1);
        setSyncStatus(result);
        driftMonitorRef.current.addSync(result.offset);
        const engine = engineRef.current;
        if (!engine || p2pRole === 'master') return;

        const lastOffset = lastNetworkOffsetRef.current;
        const offsetDelta = lastOffset !== null ? Math.abs(result.offset - lastOffset) : Infinity;
        const targetTc = engine.getTimecodeForOffset(result.offset);
        const driftSec = engine.getDiffSeconds(targetTc);
        const shouldCorrect = offsetDelta >= 33 || driftSec >= 0.033;

        if (shouldCorrect) {
          applySyncToWorklet(targetTc, 0, true);
          engine.syncWithOffset(result.offset);
          lastNetworkOffsetRef.current = result.offset;
        }
      } catch (e) {
        console.warn('Background sync failed', e);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [syncMode, isRunning, p2pRole, applySyncToWorklet]);

  useEffect(() => {
    if (syncMode !== 'network' || !isRunning) return;
    const fps = FPS_OPTIONS[fpsIndex].value;
    const tick = () => setDriftStatus(driftMonitorRef.current.getStatus(fps));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [syncMode, isRunning, fpsIndex]);

  const STOP_HOLD_MS = 700;

  const cancelStopHold = () => {
    if (stopHoldRafRef.current !== null) {
      cancelAnimationFrame(stopHoldRafRef.current);
      stopHoldRafRef.current = null;
    }
    setStopHoldPct(0);
  };

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

  const handleManualResync = async () => {
    if (syncMode !== 'network') return;
    setIsResyncing(true);
    try {
      const result = await TimeSync.sync();
      setSyncStatus(result);
      driftMonitorRef.current.addSync(result.offset);
      const engine = engineRef.current;
      if (engine && p2pRole !== 'master') {
        engine.syncWithOffset(result.offset);
        lastNetworkOffsetRef.current = result.offset;
        if (isRunning) {
          applySyncToWorklet(engine.getTimecodeForOffset(result.offset), 0, true);
        }
      }
      addToast(translate('toast.resynced', langRef.current), 'info');
    } catch {
      addToast(translate('toast.resyncFailed', langRef.current), 'error');
    } finally {
      setIsResyncing(false);
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
        addToast(`SAMPLE RATE: ${ctx.sampleRate}Hz - LTC TIMING MAY DRIFT`, 'warn');
      }

      if (engineRef.current) {
        engineRef.current.updateSampleRate(ctx.sampleRate);
      }

      await startSequence();
    }
  };

  const startSequence = async () => {
    setIsPreparing(true);
    try {
      let offset = 0;
      
      if (!isPaused) {
        if (syncMode === 'network' || (syncMode === 'p2p' && p2pRole === 'master' && p2pSyncSource === 'network')) {
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
            const msg: SyncMessage = {
              type: 'sync-request',
              masterTimecode: '',
              masterTimestamp: 0,
              fps: 0,
              isDropFrame: false,
              isRunning: false,
              clientTimestamp: performance.now()
            };
            peerSyncRef.current.broadcast(msg);
          }
          lastSyncTimeRef.current = Date.now();
        } else if (engineRef.current) {
          if (syncMode === 'freerun' || (syncMode === 'p2p' && p2pRole === 'master' && p2pSyncSource === 'manual')) {
            engineRef.current.setManualTimecode(manualTimecode);
          } else {
            engineRef.current.syncWithOffset(offset);
          }
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

  const beep = (freq: number, duration: number) => {
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
  };

  const startEngine = async () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const workletCode = LTC_WORKLET_SOURCE;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    
    try {
      await ctx.audioWorklet.addModule(url);
    } catch (e) {
      console.error('Worklet addition failed', e);
      return;
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
        volume: outputLevel === 'line' ? volume : volume * 0.1,
        ubit: userBits,
        mode: outputMode,
        h: currentTC[0], m: currentTC[1], s: currentTC[2], f: currentTC[3]
      }
    });
    workletNode.port.onmessage = (e) => {
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
    TimecodeNativeBridge.startBackgroundMode();
  };

  const stopEngine = (reset = false) => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    analyserRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setVuLevel(0);
    setIsRunning(false);
    driftMonitorRef.current.reset();
    setDriftStatus(null);
    if (reset && engineRef.current) {
      if (syncMode === 'freerun') {
        engineRef.current.setManualTimecode(manualTimecode);
      } else if (syncMode === 'network' && lastNetworkOffsetRef.current !== null) {
        engineRef.current.syncWithOffset(lastNetworkOffsetRef.current);
      } else {
        engineRef.current.resetToSystemTime();
      }
      currentTcRef.current = engineRef.current.getTimecodeString();
    }
    TimecodeNativeBridge.stopBackgroundMode();
  };

  const handlePause = () => {
    if (isRunning && engineRef.current) {
      setIsPaused(true);
      stopEngine();
    }
  };

  const handleManualTallyChange = (s: TallyState) => {
    setManualTally(s);
    if (isHost) {
      tallyRevRef.current += 1;
      const newPayload: TallyPayload = {
        rev: tallyRevRef.current,
        all: s,
        assignments: {}
      };
      setTallyPayload(newPayload);
      peerSyncRef.current?.broadcast({
        type: 'tally',
        masterTimecode: '',
        masterTimestamp: 0,
        fps: 0,
        isDropFrame: false,
        isRunning: false,
        tally: newPayload
      });
    }
  };

  const handleClientTallyChange = (clientId: string, s: TallyState) => {
    if (isHost) {
      tallyRevRef.current += 1;
      const newPayload: TallyPayload = {
        rev: tallyRevRef.current,
        all: tallyPayload?.all ?? manualTally,
        assignments: {
          ...tallyPayload?.assignments,
          [clientId]: s
        }
      };
      setTallyPayload(newPayload);
      peerSyncRef.current?.broadcast({
        type: 'tally',
        masterTimecode: '',
        masterTimestamp: 0,
        fps: 0,
        isDropFrame: false,
        isRunning: false,
        tally: newPayload
      });
      const camLabel = cameraLabels[clientId] || clientId.slice(0, 6);
      const stateKey = s === 'standby' ? 'preview' : s;
      const tc = currentTcRef.current;
      setTallyActionLog(prev => [{ time: tc, cam: camLabel, state: stateKey }, ...prev].slice(0, 10));
    }
  };

  useEffect(() => {
    try { localStorage.setItem('ltc-camera-labels', JSON.stringify(cameraLabels)); } catch { /* ignore */ }
  }, [cameraLabels]);

  const isTallyConnected = p2pRole === 'client' && (nowTick - lastHeartbeatTimeRef.current < 3000);
  const tallyState = resolveTally(tallyPayload, peerId, {
    connected: isTallyConnected,
    autoMode: tallyMode === 'auto',
    selfIsRunning: isRunning,
    manualState: manualTally,
  });

  useEffect(() => {
    if (isHost && tallyMode === 'auto') {
      const stateToBroadcast = isRunning ? 'live' : 'standby';
      if (tallyPayload?.all !== stateToBroadcast) {
        tallyRevRef.current += 1;
        const newPayload: TallyPayload = {
          rev: tallyRevRef.current,
          all: stateToBroadcast,
          assignments: {}
        };
        setTallyPayload(newPayload);
        peerSyncRef.current?.broadcast({
          type: 'tally',
          masterTimecode: '',
          masterTimestamp: 0,
          fps: 0,
          isDropFrame: false,
          isRunning: isRunning,
          tally: newPayload
        });
      }
    }
  }, [isHost, tallyMode, isRunning, tallyPayload?.all]);

  useEffect(() => {
    const turnOn = tallyTorchEnabled && tallyState === 'live';
    const applyTorch = async (on: boolean) => {
      await TimecodeNativeBridge.setTorch(on);
      const isNative = (window as any).Capacitor?.isNative;
      if (!isNative) {
        try {
          if (on) {
            if (!videoTrackRef.current) {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
              });
              videoTrackRef.current = stream.getVideoTracks()[0];
            }
            if (videoTrackRef.current) {
              await videoTrackRef.current.applyConstraints({ advanced: [{ torch: true }] } as unknown as MediaTrackConstraints);
            }
          } else {
            if (videoTrackRef.current) {
              await videoTrackRef.current.applyConstraints({ advanced: [{ torch: false }] } as unknown as MediaTrackConstraints);
              videoTrackRef.current.stop();
              videoTrackRef.current = null;
            }
          }
        } catch (e) {
          console.warn('Web fallback torch failed:', e);
        }
      }
    };
    applyTorch(turnOn);
    return () => {
      if (turnOn) applyTorch(false);
    };
  }, [tallyState, tallyTorchEnabled]);

  const handleDimmerCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyDimmerOpacity(prev => {
      if (prev === 0) return 0.5;
      if (prev === 0.5) return 0.85;
      return 0;
    });
  };

  const handleTorchToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyTorchEnabled(prev => !prev);
  };

  const handleTallyExit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyOpen(false);
  };

  const handleAllTallyChange = (s: TallyState) => {
    if (!isHost) return;
    tallyRevRef.current += 1;
    const newPayload: TallyPayload = {
      rev: tallyRevRef.current,
      all: s,
      assignments: {}
    };
    setTallyPayload(newPayload);
    setManualTally(s);
    peerSyncRef.current?.broadcast({
      type: 'tally',
      masterTimecode: '',
      masterTimestamp: 0,
      fps: 0,
      isDropFrame: false,
      isRunning: false,
      tally: newPayload
    });
  };

  return (
    <LTCSyncContext.Provider value={{
      isRunning, setIsRunning,
      fpsIndex, setFpsIndex,
      volume, setVolume,
      syncStatus,
      syncMode, setSyncMode,
      isPreparing,
      manualTimecode, setManualTimecode,
      p2pRole,
      activeTab, setActiveTab,
      isMobile,
      outputMode, setOutputMode,
      autoUserBits, setAutoUserBits,
      isVisualSlate, setIsVisualSlate,
      isSlateFlashing,
      slateTime, setSlateTime,
      setTallyTime,
      setDirectorTime,
      userBits, setUserBits,
      markers, setMarkers,
      defaultReelName, setDefaultReelName,
      outputLevel, setOutputLevel,
      peerId,
      targetId, setTargetId,
      p2pStatus,
      isHost,
      driftStatus,
      isPaused,
      stopHoldPct,
      p2pSyncSource, setP2pSyncSource,
      showGuide, setShowGuide,
      tallyOpen, setTallyOpen,
      tallyMode, setTallyMode,
      tallyTorchEnabled, setTallyTorchEnabled,
      manualTally,
      tallyPayload,
      tallyTime,
      tallyDimmerOpacity, setTallyDimmerOpacity,
      tallyTcSize, setTallyTcSize,
      directorPanelOpen, setDirectorPanelOpen,
      directorTime,
      cameraLabels, setCameraLabels,
      tallyActionLog,
      isResyncing,
      lang, setLang,
      batteryLevel,
      isCharging,
      batteryEta,
      markerFlash,
      masterDrift,
      clients,
      packetLossRate, setPacketLossRate,
      vuLevel,
      isClipping,
      sceneName, setSceneName,
      nowTick,
      canvasRef,
      engineRef,
      currentTcRef,
      isVisualSlateRef,
      slateTimeRef,
      tallyTimeRef,
      tallyOpenRef,
      directorTimeRef,
      directorPanelOpenRef,
      holdStoppedRef,
      stopHoldStartRef,
      stopHoldRafRef,
      tr,
      playHapticFeedback,
      addToast,
      addMarker,
      removeMarker,
      updateMarkerComment,
      exportToEDL,
      exportToALE,
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
      handleManualTallyChange,
      handleClientTallyChange,
      handleAllTallyChange,
      tallyState,
      isTallyConnected,
      handleDimmerCycle,
      handleTorchToggle,
      handleTallyExit
    }}>
      {children}
    </LTCSyncContext.Provider>
  );
}

export function useLTC() {
  const context = useContext(LTCSyncContext);
  if (!context) {
    throw new Error('useLTC must be used within a LTCSyncProvider');
  }
  return context;
}
