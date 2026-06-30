import { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { LtcEngine } from './utils/LtcEngine';
import type { LtcSettings } from './utils/LtcEngine';
import { TimeSync } from './utils/TimeSync';
import { PeerSync } from './utils/PeerSync';
import type { SyncMessage } from './utils/PeerSync';
import { QRCodeCanvas } from 'qrcode.react';
import { TimecodeNativeBridge } from './utils/TimecodeNativeBridge';
import { DriftMonitor, formatSyncAge } from './utils/DriftMonitor';
import { estimateMinutesRemaining, trimSamples, formatDuration } from './utils/battery';
import { t as translate, getInitialLang, persistLang } from './utils/i18n';
import type { Lang } from './utils/i18n';
import type { BatterySample } from './utils/battery';
import type { DriftStatus } from './utils/DriftMonitor';
import { buildEdl, buildAle } from './utils/export';
import type { Marker } from './utils/export';
import { resolveTally, adoptTally, TALLY_COLORS, tallyLabelKey } from './utils/tally';
import type { TallyState, TallyPayload } from './utils/tally';
import { LTC_WORKLET_SOURCE } from './audio/ltcWorkletSource';
import './App.css';


const FPS_OPTIONS = [
  { label: '23.976', value: 23.976, drop: false, fpsNum: 24000, fpsDen: 1001 },
  { label: '24', value: 24, drop: false, fpsNum: 24000, fpsDen: 1000 },
  { label: '25', value: 25, drop: false, fpsNum: 25000, fpsDen: 1000 },
  { label: '29.97', value: 29.97, drop: false, fpsNum: 30000, fpsDen: 1001 },
  { label: '29.97 DF', value: 29.97, drop: true, fpsNum: 30000, fpsDen: 1001 },
  { label: '30', value: 30, drop: false, fpsNum: 30000, fpsDen: 1000 },
];

type SyncMode = 'system' | 'network' | 'p2p' | 'freerun';
type ToastLevel = 'info' | 'warn' | 'error';
type Toast = { id: number; msg: string; level: ToastLevel };

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
};

const MARKER_HEX: Record<string, string> = {
  Red: '#ff3b40', Blue: '#3b82f6', Green: '#22c55e', Yellow: '#f59e0b',
};

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [fpsIndex, setFpsIndex] = useState(2); // Default 25
  const [volume, setVolume] = useState(0.5);
  // Using Canvas for GPU-accelerated, ultra-smooth TC display
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [syncStatus, setSyncStatus] = useState<{ offset: number, latency: number } | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('network');
  const [isPreparing, setIsPreparing] = useState(false);
  const [manualTimecode, setManualTimecode] = useState('00:00:00:00');
  const [p2pRole, setP2pRole] = useState<'master' | 'client' | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'sync' | 'tools'>('main');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  // New States for Advanced Features
  const [outputMode, setOutputMode] = useState<'stereo' | 'mono-l'>('stereo');
  const [autoUserBits, setAutoUserBits] = useState(true);
  const [isSlateFlashing, setIsSlateFlashing] = useState(false);
  const [slateTime, setSlateTime] = useState('00:00:00:00');


  // Resize handler
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [userBits, setUserBits] = useState('00000000');
  const [isVisualSlate, setIsVisualSlate] = useState(false);
  const isVisualSlateRef = useRef(false);
  // Mirror slateTime into a ref so the canvas RAF loop can compare against the
  // latest value without listing slateTime as an effect dependency (which would
  // tear down and rebuild the animation loop on every frame update).
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
  const [outputLevel, setOutputLevel] = useState<'mic' | 'line'>('line');

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
  // Hold-to-stop guard: stopping LTC mid-take ruins sync, so STOP requires a
  // deliberate press-and-hold. stopHoldPct (0..100) drives the fill UI.
  const [stopHoldPct, setStopHoldPct] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  // Tally lamp: full-screen on-camera indicator. Phase 1 is standalone (no
  // network payload yet): AUTO derives live/standby from LTC output, MANUAL is
  // set by the operator. tallyOpen toggles the full-screen overlay.
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
  const [tallyControlsOpen, setTallyControlsOpen] = useState(false);
  const [tallyDimmerOpacity, setTallyDimmerOpacity] = useState(0); // 0 = transparent (bright), 0.5 = dim, 0.9 = very dark
  const tallyControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [directorPanelOpen, setDirectorPanelOpen] = useState(false);
  const [directorTime, setDirectorTime] = useState<string>('00:00:00:00');
  const directorTimeRef = useRef<string>(directorTime);
  const directorPanelOpenRef = useRef<boolean>(directorPanelOpen);

  const [isResyncing, setIsResyncing] = useState(false);
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const langRef = useRef<Lang>(lang);
  
  useEffect(() => {
    tallyOpenRef.current = tallyOpen;
    if (!tallyOpen) {
      setTallyControlsOpen(false);
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
  // Battery readout: level, charging state and an estimated time-to-empty so
  // operators know whether the phone will last the shoot.
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [batteryEta, setBatteryEta] = useState<number | null>(null);
  const batterySamplesRef = useRef<BatterySample[]>([]);
  // Transient confirmation shown when a marker is logged.
  const [markerFlash, setMarkerFlash] = useState<{ tc: string; color: string; count: number } | null>(null);
  const markerFlashTimerRef = useRef<number | null>(null);

  // Subscribe to the Battery Status API where available (Android/Chromium).
  // iOS Safari lacks it, so the readout simply stays hidden there.
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    let batt: BatteryLike | null = null;
    let cancelled = false;
    const onLevel = () => {
      if (!batt) return;
      setBatteryLevel(batt.level);
      setIsCharging(batt.charging);
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
  // Set when a hold-to-stop completes; consumed to swallow the trailing click
  // (finger-lift) so STOP doesn't immediately re-trigger START.
  const holdStoppedRef = useRef(false);
  const stopHoldStartRef = useRef(0);
  const [p2pSyncSource, setP2pSyncSource] = useState<'manual' | 'network'>('manual');
  const [masterDrift, setMasterDrift] = useState<number | null>(null); // Drift in seconds from master
  const [clients, setClients] = useState<Record<string, { rtt: number, drift: number, lastSeen: number }>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [packetLossRate, setPacketLossRate] = useState(0);
  // Wall-clock tick used to drive time-dependent render output (e.g. client
  // offline detection) without reading Date.now() impurely during render.
  const [nowTick, setNowTick] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<LtcEngine | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const currentTcRef = useRef<string>('00:00:00:00'); // Latest TC emitted by the worklet (live source of truth)
  const peerSyncRef = useRef<PeerSync | null>(null);
  const lastSyncTimeRef = useRef<number>(0); // Track last forced sync time (initialised on mount)
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [vuLevel, setVuLevel] = useState(0);

  const addToast = (msg: string, level: ToastLevel = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, level }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Initialise the last-sync timestamp once on mount. Done here (not in the
  // ref initialiser) to keep render pure — Date.now() must not run during render.
  useEffect(() => {
    lastSyncTimeRef.current = Date.now();
  }, []);

  // Tick wall-clock every 5s while hosting so client offline status re-renders.
  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [isHost]);

  // Mobile Initialization
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

  // Surface native audio-session interruptions (incoming calls, etc.).
  // Native layer re-activates AVAudioSession; we must also resume the Web Audio context.
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

  // Initialize engine
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
    // Mount-only: builds the engine from the initial settings snapshot. Later
    // changes to fps/volume/userBits/outputMode are pushed by dedicated effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update FPS/Volume
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setFps(FPS_OPTIONS[fpsIndex].value, FPS_OPTIONS[fpsIndex].drop);
    }
  }, [fpsIndex]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setVolume(volume);
  }, [volume]);

  // Push live config (volume / user bits / output mode) into the running worklet,
  // which owns the emitted audio. Without this, changing them mid-run had no effect.
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

  /**
   * Push a latency-compensated correction into the AudioWorklet (the live audio
   * source of truth). Large drift => hard jam; small drift => single-frame nudge.
   * While idle the worklet doesn't exist, so we only update the engine used for
   * the on-screen display.
   */
  const applySyncToWorklet = useCallback((masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    const corrected = engine.getCorrectedTc(masterTcStr, oneWayLatencyMs, isMasterRunning);
    const node = workletNodeRef.current;
    if (isRunning && node) {
      // The engine mirrors the worklet's emitted TC (see worklet onmessage),
      // so diff/direction are measured against the actual output.
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

  // Update the message handler reference every render
  useEffect(() => {
    messageHandlerRef.current = (msg: SyncMessage) => {
      if (engineRef.current) {
        if (msg.type === 'sync-request' && isHost) {
          // Master: Reply with current time and raw timestamp
          const response: SyncMessage = {
            type: 'sync-response',
            masterTimecode: isRunning ? currentTcRef.current : engineRef.current.getTimecodeString(),
            masterTimestamp: performance.now(), // Sub-ms precision
            fps: FPS_OPTIONS[fpsIndex].value,
            isDropFrame: FPS_OPTIONS[fpsIndex].drop,
            isRunning: isRunning,
            clientTimestamp: msg.clientTimestamp
          };
          peerSyncRef.current?.send(response);
          
          // Identify client from connection if PeerSync provided it
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
          // Master: Update client status from report
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
          // Client: Calculate RTT and adjust sync
          const now = performance.now();
          const rtt = now - (msg.clientTimestamp || now);
          
          // Packet loss protection: ignore RTTs that are unreasonably large (>5s)
          // or negative (corrupted timestamp)
          if (rtt < 0 || rtt > 5000) {
            setP2pStatus(`SKIP (bad RTT ${rtt.toFixed(0)}ms)`);
            return;
          }
          
          const oneWayLatency = rtt / 2;
          
          const history = [...rttHistoryRef.current, rtt].slice(-15);
          rttHistoryRef.current = history;

          // Calculate drift BEFORE deciding whether to sync
          const diff = engineRef.current.getDiffSeconds(msg.masterTimecode);
          setMasterDrift(diff);

          // Latency protection: Only sync if RTT is stable (use ref, not stale state)
          const avgRtt = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : rtt;
          const isRttStable = rtt <= avgRtt * 1.5 || rtt < 80;

          // Ultra-tight sync conditions: diff >= 0.03s (approx 1 frame) OR 15 seconds
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

          // Report back to master
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
          // Heartbeat: update drift display, sync only if needed
          const diff = engineRef.current.getDiffSeconds(msg.masterTimecode);
          setMasterDrift(diff);

          const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
          
          // Persistent drift check: only sync if drift is > 0.03s for 3 consecutive beats (if HB)
          // For HB, we are less aggressive to avoid jitter-induced jumps
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

          // Periodically report during heartbeat too
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

  // Auto User Bits Logic
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
      // Also update periodically in case day changes during long session
      const interval = setInterval(updateAutoUB, 60000);
      return () => clearInterval(interval);
    }
  }, [autoUserBits]);

  // Persist markers to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ltc-markers', JSON.stringify(markers));
    } catch { /* ignore */ }
  }, [markers]);

  // Update Engine with Pro features
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
    const newMarker: Marker = {
      id: Date.now(),
      tc: currentTC,
      time: new Date().toLocaleTimeString(),
      color,
      reelName: defaultReelName
    };
    setMarkers(prev => [newMarker, ...prev]);

    // Confirmation feedback: brief on-screen flash + haptic so the operator
    // knows the mark registered without staring at the list.
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

  // Triggers a client-side download of the given text content.
  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToEDL = () => {
    if (markers.length === 0) return;
    const edl = buildEdl(markers, FPS_OPTIONS[fpsIndex].drop);
    downloadText(edl, `PHONE_TC_${new Date().toISOString().slice(0, 10)}.edl`);
  };

  const exportToALE = () => {
    if (markers.length === 0) return;
    const ale = buildAle(markers, FPS_OPTIONS[fpsIndex].label);
    downloadText(ale, `PHONE_TC_${new Date().toISOString().slice(0, 10)}.ale`);
  };

  const handleSlateClick = () => {
    // Digital Clapper Logic
    setIsSlateFlashing(true);
    beep(1000, 0.1); // 1kHz sync beep
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

  // P2P Setup
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

  const setupP2PClient = async () => {
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
        // Ignore invalid formats while typing
      }
    }
  }, [manualTimecode, p2pRole, isRunning, isPaused]);

  const joinSession = () => {
    if (!peerSyncRef.current || !targetId) return;
    peerSyncRef.current.connect(targetId);
    setSyncMode('p2p');
    lastHeartbeatTimeRef.current = Date.now();
  };

  // Periodic Heartbeat & Sync Requests (Optimized for low latency & packet loss)
  useEffect(() => {
    if (!peerSyncRef.current) return;

    // Control interval for checking status
    const interval = setInterval(() => {
      if (!isHost && p2pRole === 'client') {
        const diff = masterDrift !== null ? Math.abs(masterDrift) : 0;
        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
        
        // Δ > 0.03s or 15s interval
        if (diff >= 0.03 || timeSinceLastSync >= 15000) {
          // Packet Loss Countermeasure: Send a burst of 3 requests
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

    // High-frequency Heartbeat for Master (10Hz for extreme reliability)
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
      }, 100); // 10Hz Heartbeat
    }

    return () => {
      clearInterval(interval);
      if (hbInterval) clearInterval(hbInterval);
    };
  }, [isHost, p2pRole, fpsIndex, masterDrift, isRunning]);

  // Sync packetLossRate into PeerSync (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      peerSyncRef.current?.setLossRate(packetLossRate);
    }
  }, [packetLossRate]);

  // VU meter RAF loop for mono-l mic input
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
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    // Reset the meter when leaving the running mono-l state (cleanup runs on
    // the next deps change / unmount, not synchronously during this effect).
    return () => {
      cancelAnimationFrame(rafId);
      setVuLevel(0);
    };
  }, [isRunning, outputMode]);

  // Periodic Network Sync — apply offset drift to the live worklet while running
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
        // ~1 frame at 30fps, or NTP offset moved by ≥33ms
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

  // Drift / accuracy readout — recompute the estimated accumulated drift once a
  // second so the UI honestly reflects how stale the last sync is. Synchronising
  // with an external system (wall clock) is exactly what useEffect is for.
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

  // Press-and-hold to confirm STOP while LTC is being emitted.
  const beginStopHold = () => {
    if (stopHoldRafRef.current !== null) return;
    // eslint-disable-next-line react-hooks/purity -- runs from a pointer event, not render
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

  // One-tap manual re-sync (re-jam) available from the MAIN screen.
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
      setIsPaused(false); // Stop means fully reset
      stopEngine(true);
    } else {
      // Create/Resume AudioContext IMMEDIATELY on user gesture
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // iOS Silent Sound Trick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.1);

      if (ctx.sampleRate !== 48000 && ctx.sampleRate !== 44100) {
        addToast(`SAMPLE RATE: ${ctx.sampleRate}Hz — LTC TIMING MAY DRIFT`, 'warn');
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
      
      // Only sync if NOT resuming from pause
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

        // P2P client: force immediate sync on START
        if (engineRef.current && syncMode === 'p2p' && p2pRole === 'client') {
          // Send an immediate sync request and wait briefly
          if (peerSyncRef.current) {
            const msg: SyncMessage = {
              type: 'sync-request',
              masterTimecode: '',
              masterTimestamp: 0,
              fps: 0,
              isDropFrame: false,
              isRunning: false,
              // Runs from the START button handler (not render); clock read is intentional.
              // eslint-disable-next-line react-hooks/purity
              clientTimestamp: performance.now()
            };
            peerSyncRef.current.broadcast(msg);
          }
          // eslint-disable-next-line react-hooks/purity
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

    // Define Worklet Script inline for compatibility and speed
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
       // Worklet is the live source of truth; cache its latest emitted TC.
       currentTcRef.current = tc;
       // Mirror into the engine so drift / markers reflect the ACTUAL output.
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

  useEffect(() => {
    let rafId: number;
    
    const render = () => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) {
        rafId = requestAnimationFrame(render);
        return;
      }

      // While running the worklet drives the TC; when idle use the engine.
      const tc = isRunning ? currentTcRef.current : engine.getTimecodeString();
      TimecodeNativeBridge.updatePlaybackStatus(isRunning, tc);
      
      // Update Slate Time (state) for overlay components (QR, etc)
      // Only update when needed to avoid React re-renders unless necessary
      if (isVisualSlateRef.current && slateTimeRef.current !== tc) {
        setSlateTime(tc);
      }

      if (tallyOpenRef.current && tallyTimeRef.current !== tc) {
        tallyTimeRef.current = tc;
        setTallyTime(tc);
      }

      if (directorPanelOpenRef.current && directorTimeRef.current !== tc) {
        directorTimeRef.current = tc;
        setDirectorTime(tc);
      }

      // Draw Logic
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Ensure canvas size matches its display size * DPR
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Draw Timecode — auto-size to fill ~90% of the card width so the TC is
      // as large and legible as possible on any screen / orientation.
      const targetWidth = w * 0.9;
      // Cap by height first so a tall desktop card grows the TC to fill the
      // column; the width check below then shrinks it to fit if needed.
      const maxSize = isMobile ? 140 : 360;
      let fontSize = Math.min(maxSize, h * 0.72);
      ctx.font = `900 ${fontSize}px 'JetBrains Mono', monospace`;
      const measured = ctx.measureText(tc).width;
      if (measured > targetWidth && measured > 0) {
        fontSize = Math.floor(fontSize * (targetWidth / measured));
        ctx.font = `900 ${fontSize}px 'JetBrains Mono', monospace`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // High-contrast white; warmer/stronger glow while emitting LTC.
      ctx.shadowColor = isRunning ? 'rgba(255, 90, 120, 0.45)' : 'rgba(255, 255, 255, 0.3)';
      ctx.shadowBlur = isMobile ? 18 : 50;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tc, w / 2, h / 2);

      // Secondary sharper pass for crisp edges.
      ctx.shadowBlur = 4;
      ctx.fillText(tc, w / 2, h / 2);

      // REC indicator while LTC is being emitted.
      if (isRunning) {
        ctx.shadowBlur = 0;
        const r = Math.max(5, w * 0.013);
        const pad = Math.max(12, w * 0.045);
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 450));
        ctx.beginPath();
        ctx.arc(pad, pad, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 59, 113, ${pulse})`;
        ctx.fill();
        ctx.font = `800 ${Math.round(r * 2.1)}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3b71';
        ctx.fillText('REC', pad + r * 1.9, pad + 1);
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, isMobile]);

  // reset=true  -> STOP: return the timecode to its start reference.
  // reset=false -> PAUSE: keep the current position so RESUME continues.
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
      // PAUSE keeps the engine's current timecode; RESUME continues from it.
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
    }
  };

  // Phase 1/2: tally state resolution
  const tallyState = resolveTally(tallyPayload, peerId, {
    connected: p2pRole === 'client' && (Date.now() - lastHeartbeatTimeRef.current < 3000),
    autoMode: tallyMode === 'auto',
    selfIsRunning: isRunning,
    manualState: manualTally,
  });

  // Master: Tally Auto Mode Broadcast
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

  // Tally Torch Effect
  useEffect(() => {
    const turnOn = tallyTorchEnabled && tallyState === 'live';
    const applyTorch = async (on: boolean) => {
      await TimecodeNativeBridge.setTorch(on);
      // Web Fallback (when not on native capacitor)
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
              await videoTrackRef.current.applyConstraints({ advanced: [{ torch: true }] } as any);
            }
          } else {
            if (videoTrackRef.current) {
              await videoTrackRef.current.applyConstraints({ advanced: [{ torch: false }] } as any);
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

  const handleTallyScreenClick = () => {
    setTallyControlsOpen(prev => {
      const next = !prev;
      if (next) {
        if (tallyControlsTimerRef.current) clearTimeout(tallyControlsTimerRef.current);
        tallyControlsTimerRef.current = setTimeout(() => {
          setTallyControlsOpen(false);
        }, 3000);
      } else {
        if (tallyControlsTimerRef.current) {
          clearTimeout(tallyControlsTimerRef.current);
          tallyControlsTimerRef.current = null;
        }
      }
      return next;
    });
  };

  const handleDimmerCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyDimmerOpacity(prev => {
      if (prev === 0) return 0.5;
      if (prev === 0.5) return 0.85;
      return 0;
    });
    if (tallyControlsTimerRef.current) {
      clearTimeout(tallyControlsTimerRef.current);
      tallyControlsTimerRef.current = setTimeout(() => {
        setTallyControlsOpen(false);
      }, 3000);
    }
  };

  const handleTorchToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyTorchEnabled(prev => !prev);
    if (tallyControlsTimerRef.current) {
      clearTimeout(tallyControlsTimerRef.current);
      tallyControlsTimerRef.current = setTimeout(() => {
        setTallyControlsOpen(false);
      }, 3000);
    }
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
    <div className={`app-container pro-theme ${isMobile ? 'mobile-view' : 'desktop-view'} ${isRunning ? 'is-recording' : ''}`}>
      <header>
        <div className="logo-area">
          <div className="logo">LTC SYNC PRO</div>
          <div className="version">v1.3</div>
        </div>
        <div className="header-right">
          <div className="hdr-status">
            <div className={`status-pill ${isRunning ? 'live' : isPreparing ? 'prep' : 'idle'}`}>
              <span className="status-dot" />
              {isRunning ? tr('status.live') : isPreparing ? tr('status.syncing') : tr('status.ready')}
            </div>
            <div className="status-meta">
              <span>{FPS_OPTIONS[fpsIndex].label}</span>
              <span className="status-meta-sep">·</span>
              <span>{syncMode.toUpperCase()}</span>
            </div>
            {batteryLevel !== null && (
              <div className={`batt-chip ${batteryLevel <= 0.15 && !isCharging ? 'low' : ''}`}>
                <span className="batt-pct">{isCharging ? '⚡' : ''}{Math.round(batteryLevel * 100)}%</span>
                {!isCharging && isRunning && batteryEta !== null && (
                  <span className="batt-eta">{formatDuration(batteryEta)}</span>
                )}
              </div>
            )}
          </div>
          <div className="hdr-divider" />
          <div className="hdr-actions">
            <button
              type="button"
              className="lang-btn"
              onClick={() => setLang((l) => (l === 'en' ? 'ja' : 'en'))}
              aria-label="Toggle language"
              title="Language"
            >{lang === 'en' ? '日本語' : 'EN'}</button>
            <button
              type="button"
              className="help-btn"
              onClick={() => setShowGuide(true)}
              aria-label={tr('guide.aria')}
              title={tr('guide.aria')}
            >?</button>
          </div>
        </div>
      </header>

      {isMobile && (
        <nav className="tab-bar">
          <button className={activeTab === 'main' ? 'active' : ''} onClick={() => setActiveTab('main')}>{tr('tab.main')}</button>
          <button className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')}>{tr('tab.sync')}</button>
          <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>{tr('tab.tools')}</button>
        </nav>
      )}

      <main className={isMobile ? 'tab-content' : 'desktop-dashboard'}>
        {(isMobile ? activeTab === 'main' : true) && (
          <div className="tab-pane main-pane">
            <div className="timecode-card-pro" onClick={() => setIsVisualSlate(true)}>
              <canvas ref={canvasRef} className="time-canvas" />
              <div className="info-strip-pro">
                <span className="info-label">FPS: {FPS_OPTIONS[fpsIndex].label}</span>
                <span className="info-label">LVL: {outputLevel.toUpperCase()}</span>
                <span className="info-label">UBIT: {userBits}</span>
                {p2pRole === 'client' && masterDrift !== null && (
                  <span className={`info-label ${masterDrift >= 0.5 ? 'warn' : 'ok'}`}>
                    {masterDrift >= 0.5 ? '⚠ ' : '✓ '}Δ {masterDrift < 0.01 ? '<0.01' : masterDrift.toFixed(2)}s
                  </span>
                )}
              </div>
            </div>

            {syncMode === 'network' && (
              <div className="main-sync-bar">
                <div className="msb-info">
                  <span className="msb-label">{tr('sync.label')}</span>
                  <span className="msb-mode">{tr('sync.network')}</span>
                  {isRunning && driftStatus && driftStatus.hasSync && (
                    <span className="msb-age">{formatSyncAge(driftStatus.msSinceSync)}</span>
                  )}
                </div>
                <button type="button" className="msb-resync" onClick={handleManualResync} disabled={isResyncing}>
                  {isResyncing ? tr('sync.resyncing') : tr('sync.resync')}
                </button>
              </div>
            )}

            {isMobile && (
              <>
                <div className="control-section">
                  <label className="section-label">{tr('label.frameRate')}</label>
                  <div className="fps-grid-compact">
                    {FPS_OPTIONS.map((opt, i) => (
                      <button 
                        key={opt.label} 
                        className={`btn-pill ${fpsIndex === i ? 'active' : ''}`}
                        onClick={() => setFpsIndex(i)}
                        disabled={isRunning}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-section">
                  <label className="section-label">{tr('label.outputVolume')}</label>
                  <div className="volume-row">
                    <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
                    <div className="level-toggle">
                      <button className={outputLevel === 'mic' ? 'active' : ''} onClick={() => setOutputLevel('mic')}>MIC</button>
                      <button className={outputLevel === 'line' ? 'active' : ''} onClick={() => setOutputLevel('line')}>LINE</button>
                    </div>
                  </div>
                </div>

                <div className="control-section">
                  <label className="section-label">{tr('label.outputMode')}</label>
                  <div className="sync-toggle-pro">
                    <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => setOutputMode('stereo')}>STEREO TC</button>
                    <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => setOutputMode('mono-l')}>L-TC / R-AUDIO</button>
                  </div>
                </div>
                {outputMode === 'mono-l' && (
                  <div className="control-section vu-meter-container">
                    <label className="vu-label">MIC INPUT LEVEL {!isRunning && '(START TO MONITOR)'}</label>
                    <div className="vu-bar-track">
                      <div className="vu-bar-fill" style={{ width: `${Math.min(vuLevel * 120, 100)}%` }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(isMobile ? activeTab === 'sync' : true) && (
          <div className="tab-pane sync-pane">
            <div className="control-section">
              <label className="section-label">{tr('label.syncMethod')}</label>
              <div className="sync-toggle-pro">
                {(['system', 'network', 'p2p', 'freerun'] as SyncMode[]).map((m) => (
                  <button 
                    key={m}
                    className={syncMode === m ? 'active' : ''}
                    onClick={() => setSyncMode(m)}
                    disabled={isRunning || (m === 'p2p' && !p2pRole)}
                  >
                    {m === 'freerun' ? tr('mode.freerun') : m.toUpperCase()}
                  </button>
                ))}
              </div>
              {syncStatus && syncMode === 'network' && (
                <div className="sync-detail">Latency: {syncStatus.latency.toFixed(1)}ms | Offset: {syncStatus.offset.toFixed(1)}ms</div>
              )}
              {syncMode === 'network' && isRunning && driftStatus && driftStatus.hasSync && (
                <div className="drift-panel">
                  <div className="drift-row">
                    <span>{tr('drift.lastSync')}</span>
                    <span>{formatSyncAge(driftStatus.msSinceSync)} {tr('drift.ago')}</span>
                  </div>
                  {driftStatus.msSinceSync >= 3600000 && (
                    <div className="drift-rejam">⚠ {tr('drift.rejam')}</div>
                  )}
                </div>
              )}
            </div>

            {syncMode === 'freerun' && (
              <div className="control-section">
                <label className="section-label">{tr('label.startTc')}</label>
                <div className="section-content">
                  <input
                    className="tc-input"
                    value={manualTimecode}
                    onChange={(e) => setManualTimecode(e.target.value)}
                    disabled={isRunning}
                    placeholder="HH:MM:SS:FF"
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}

            <div className="control-section">
              <label className="section-label">{tr('label.p2p')}</label>
              {!p2pRole ? (
                <div className="p2p-init-pro">
                  <button onClick={setupP2PMaster}>{tr('btn.createMaster')}</button>
                  <button onClick={setupP2PClient}>{tr('btn.joinClient')}</button>
                </div>
              ) : (
                <div className="p2p-panel-pro">
                  <div className="p2p-header">
                    <span className="role-tag">{p2pRole.toUpperCase()}</span>
                    <button className="btn-small" onClick={resetP2P}>{tr('btn.reset')}</button>
                  </div>
                  {p2pRole === 'master' && (
                    <div className="p2p-master-box">
                      <div className="id-display">ID: <span>{peerId || '...'}</span></div>
                      
                      <div className="control-section">
                        <label className="section-label">START SOURCE</label>
                        <div className="sync-toggle-pro">
                          <button 
                            className={p2pSyncSource === 'manual' ? 'active' : ''} 
                            onClick={() => setP2pSyncSource('manual')}
                            disabled={isRunning}
                          >
                            MANUAL TC
                          </button>
                          <button 
                            className={p2pSyncSource === 'network' ? 'active' : ''} 
                            onClick={() => setP2pSyncSource('network')}
                            disabled={isRunning}
                          >
                            NETWORK TIME
                          </button>
                        </div>
                      </div>

                      {p2pSyncSource === 'manual' && (
                        <div className="start-tc-input">
                          <label>START TC</label>
                          <input value={manualTimecode} onChange={e => setManualTimecode(e.target.value)} disabled={isRunning} />
                        </div>
                      )}
                    </div>
                  )}
                  {p2pRole === 'client' && (
                    <div className="p2p-client-box">
                      <input placeholder="ENTER MASTER ID" value={targetId} onChange={e => setTargetId(e.target.value)} />
                      <button onClick={joinSession}>LINK</button>
                    </div>
                  )}
                  <div className={`p2p-status-mini ${p2pStatus.includes('ERROR') ? 'error' : ''}`}>{p2pStatus}</div>
                </div>
              )}
            </div>

            {import.meta.env.DEV && (
              <div className="control-section dev-panel">
                <label className="section-label dev-label">DEV: PACKET LOSS SIM</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="range" min="0" max="0.5" step="0.01"
                    value={packetLossRate}
                    onChange={e => setPacketLossRate(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#666', minWidth: '30px', fontFamily: 'var(--font-mono)' }}>
                    {(packetLossRate * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            {!isMobile && (
              <div className="control-section">
                <label className="section-label">{tr('label.frameRate')}</label>
                <div className="fps-grid-compact">
                  {FPS_OPTIONS.map((opt, i) => (
                    <button 
                      key={opt.label} 
                      className={`btn-pill ${fpsIndex === i ? 'active' : ''}`}
                      onClick={() => setFpsIndex(i)}
                      disabled={isRunning}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(isMobile ? activeTab === 'tools' : true) && (
          <div className="tab-pane tools-pane">
            <div className="control-section tally-section">
              <label className="section-label">{tr('label.tally')}</label>
              <div className="tally-controls">
                <button
                  className={`btn-pill ${tallyMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setTallyMode('manual')}
                >{tr('tally.manual')}</button>
                <button
                  className={`btn-pill ${tallyMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setTallyMode('auto')}
                >{tr('tally.auto')}</button>
              </div>
              <div className="tally-options" style={{ marginTop: '8px' }}>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={tallyTorchEnabled}
                    onChange={(e) => setTallyTorchEnabled(e.target.checked)}
                  />
                  <span>Torch LED</span>
                </label>
              </div>
              {isHost && (
                <button
                  className="tally-open-btn"
                  style={{
                    marginTop: '10px',
                    background: 'linear-gradient(90deg, #ff3b30, #ff9500)',
                    borderColor: '#ff9500',
                    color: '#fff'
                  }}
                  onClick={() => setDirectorPanelOpen(true)}
                >
                  DIRECTOR SWITCHER PANEL
                </button>
              )}
              {tallyMode === 'manual' && (
                <div className="tally-state-row">
                  {(['live', 'standby', 'off'] as TallyState[]).map(s => (
                    <button
                      key={s}
                      className={`tally-state-btn ${manualTally === s ? 'active' : ''}`}
                      style={manualTally === s ? { background: TALLY_COLORS[s], borderColor: TALLY_COLORS[s] } : undefined}
                      onClick={() => handleManualTallyChange(s)}
                    >{tr(tallyLabelKey(s))}</button>
                  ))}
                </div>
              )}
              <button className="tally-open-btn" onClick={() => setTallyOpen(true)}>{tr('tally.fullscreen')}</button>
            </div>

            {isHost && Object.keys(clients).length > 0 && (
              <div className="control-section clients-list-section">
                <label className="section-label">CONNECTED CLIENTS ({Object.keys(clients).length})</label>
                <div className="clients-grid">
                  {Object.entries(clients).map(([id, stats]: [string, { rtt: number, drift: number, lastSeen: number }]) => {
                    const isOffline = nowTick - stats.lastSeen > 30000;
                    return (
                      <div key={id} className={`client-card ${isOffline ? 'offline' : ''}`}>
                        <div className="client-id">{id}</div>
                        <div className="client-stats">
                          <span className="stat">RTT: {stats.rtt.toFixed(0)}ms</span>
                          <span className={`stat ${stats.drift >= 0.5 ? 'drift-warn' : ''}`}>
                            Δ: {stats.drift.toFixed(2)}s
                          </span>
                        </div>
                        {tallyMode === 'manual' && (
                          <div className="client-tally-controls" style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                            {(['live', 'preview', 'standby', 'off'] as TallyState[]).map(s => {
                               const isActive = tallyPayload?.assignments?.[id] === s;
                               return (
                                 <button
                                   key={s}
                                   className={`tally-state-btn mini ${isActive ? 'active' : ''}`}
                                   style={{
                                     flex: 1, padding: '4px', fontSize: '0.7rem',
                                     ...(isActive ? { background: TALLY_COLORS[s], borderColor: TALLY_COLORS[s], color: '#fff' } : {})
                                   }}
                                   onClick={() => handleClientTallyChange(id, s)}
                                 >
                                   {tr(tallyLabelKey(s))}
                                 </button>
                               );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="tools-grid-pro">
              <div className="tool-card span-2">
                <label>{tr('label.userBits')}</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input value={userBits} onChange={e => setUserBits(e.target.value.toUpperCase())} maxLength={8} disabled={autoUserBits} />
                  <button className={`btn-pill ${autoUserBits ? 'active' : ''}`} onClick={() => setAutoUserBits(!autoUserBits)}>{tr('btn.auto')}</button>
                </div>
              </div>
              <div className="tool-card span-2">
                <label>{tr('label.defaultReel')}</label>
                <input
                  value={defaultReelName}
                  onChange={e => setDefaultReelName(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="A001"
                />
              </div>
              {!isMobile && (
                <>
                  <div className="tool-card span-2">
                    <label className="section-label">{tr('label.outputVolume')}</label>
                    <div className="volume-row">
                      <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
                      <div className="level-toggle">
                        <button className={outputLevel === 'mic' ? 'active' : ''} onClick={() => setOutputLevel('mic')}>MIC</button>
                        <button className={outputLevel === 'line' ? 'active' : ''} onClick={() => setOutputLevel('line')}>LINE</button>
                      </div>
                    </div>
                  </div>

                  <div className="tool-card span-2">
                    <label className="section-label">{tr('label.outputMode')}</label>
                    <div className="sync-toggle-pro">
                      <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => setOutputMode('stereo')}>STEREO TC</button>
                      <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => setOutputMode('mono-l')}>L-TC / R-AUDIO</button>
                    </div>
                  </div>
                  {outputMode === 'mono-l' && (
                    <div className="tool-card span-2 vu-meter-container">
                      <label className="vu-label">MIC INPUT LEVEL {!isRunning && '(START TO MONITOR)'}</label>
                      <div className="vu-bar-track">
                        <div className="vu-bar-fill" style={{ width: `${Math.min(vuLevel * 120, 100)}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {isMobile && (
              <div className="control-section mobile-marker-section">
                <label className="section-label">{tr('label.quickMark')}</label>
                <div className="marker-buttons-grid">
                  <button className="btn-mark-large red" onClick={() => addMarker('Red')}>{tr('color.red')}</button>
                  <button className="btn-mark-large blue" onClick={() => addMarker('Blue')}>{tr('color.blue')}</button>
                  <button className="btn-mark-large green" onClick={() => addMarker('Green')}>{tr('color.green')}</button>
                  <button className="btn-mark-large yellow" onClick={() => addMarker('Yellow')}>{tr('color.yellow')}</button>
                </div>
              </div>
            )}

            <div className="marker-section-pro">
              <div className="marker-header">
                <label>{tr('label.loggedTakes')}</label>
                <div className="export-group">
                  <button className="btn-export-pro" onClick={exportToEDL} disabled={markers.length === 0}>EDL</button>
                  <button className="btn-export-pro" onClick={exportToALE} disabled={markers.length === 0}>ALE</button>
                </div>
              </div>
              <div className="marker-scroll">
                {markers.length === 0 ? (
                  <div className="empty-msg">{tr('markers.none')}</div>
                ) : (
                  markers.map(m => (
                    <div key={m.id} className="marker-row-pro">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className={`color-dot ${m.color.toLowerCase()}`}>{m.color.charAt(0)}</div>
                        <span className="m-tc">{m.tc}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="m-time">{m.time}</span>
                        <button className="btn-delete-marker" onClick={() => removeMarker(m.id)}>×</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {markerFlash && (
        <div className="marker-flash" style={{ borderColor: MARKER_HEX[markerFlash.color] }}>
          <span className="mf-dot" style={{ background: MARKER_HEX[markerFlash.color] }}>{markerFlash.color.charAt(0)}</span>
          <span className="mf-text">MARK {markerFlash.tc}</span>
          <span className="mf-count">#{markerFlash.count}</span>
        </div>
      )}
      <footer className="fixed-footer">
        <div className="footer-buttons">
          <div className="footer-left">
            <button
              className={`btn-main-action ${isRunning ? 'running danger' : isPreparing ? 'preparing' : 'start'}`}
              onClick={() => {
                // Swallow the trailing click that fires when the finger lifts
                // after a completed hold-to-stop (it would otherwise restart).
                if (holdStoppedRef.current) { holdStoppedRef.current = false; return; }
                if (!isRunning) void handleStartStop();
              }}
              onPointerDown={() => { if (isRunning) beginStopHold(); }}
              onPointerUp={cancelStopHold}
              onPointerLeave={cancelStopHold}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isPreparing}
            >
              {isRunning && <div className="stop-hold-fill" style={{ width: `${stopHoldPct}%` }} />}
              <div className="btn-icon"></div>
              <div className="btn-text">
                {isRunning ? (stopHoldPct > 0 ? tr('btn.holding') : tr('btn.holdToStop')) : isPreparing ? tr('btn.prep') : isPaused ? tr('btn.resume') : tr('btn.start')}
              </div>
            </button>
            {isRunning && (
              <button className="btn-main-action pause" onClick={handlePause}>
                <div className="btn-text">{tr('btn.pause')}</div>
              </button>
            )}
          </div>
          <div className="footer-right">
            <div className="mark-label">{tr('btn.mark')}</div>
            <div className="mark-colors-container">
              <button className="btn-mark-color red" onClick={() => addMarker('Red')} title={tr('marker.redTitle')}>R</button>
              <button className="btn-mark-color blue" onClick={() => addMarker('Blue')} title={tr('marker.blueTitle')}>B</button>
              <button className="btn-mark-color green" onClick={() => addMarker('Green')} title={tr('marker.greenTitle')}>G</button>
              <button className="btn-mark-color yellow" onClick={() => addMarker('Yellow')} title={tr('marker.yellowTitle')}>Y</button>
            </div>
          </div>
        </div>
      </footer>

      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.level}`}>{t.msg}</div>
        ))}
      </div>

      {tallyOpen && (
        <div
          className={`tally-overlay tally-${tallyState}`}
          style={{ background: TALLY_COLORS[tallyState] }}
          onClick={handleTallyScreenClick}
        >
          <div className="tally-dimmer" style={{ opacity: tallyDimmerOpacity }} />

          <div className="tally-header">
            <div className="tally-header-left">
              <div>ID: {peerId || 'LOCAL'}</div>
              <div>ROLE: {p2pRole ? p2pRole.toUpperCase() : 'STANDALONE'}</div>
            </div>
            <div className="tally-header-right">
              <div className="tally-status-indicator">
                <span className={`tally-conn-dot ${p2pRole === 'client' && (Date.now() - lastHeartbeatTimeRef.current < 3000) ? '' : 'disconnected'}`} />
                <span>{p2pRole === 'client' && (Date.now() - lastHeartbeatTimeRef.current < 3000) ? 'SYNCED' : 'STANDALONE'}</span>
              </div>
              <div>BATTERY: {batteryLevel !== null ? `${batteryLevel}%` : 'N/A'}</div>
            </div>
          </div>

          {tallyControlsOpen && (
            <div className="tally-controls-popup">
              <button className="tally-ctrl-btn" onClick={handleDimmerCycle}>
                DIM: {tallyDimmerOpacity === 0 ? '0%' : tallyDimmerOpacity === 0.5 ? '50%' : '85%'}
              </button>
              <button className="tally-ctrl-btn" onClick={handleTorchToggle}>
                TORCH: {tallyTorchEnabled ? 'ON' : 'OFF'}
              </button>
              <button className="tally-ctrl-btn exit-btn" onClick={handleTallyExit}>
                CLOSE
              </button>
            </div>
          )}

          <div className="tally-body">
            <div className="tally-timecode">{tallyTime}</div>
            <div className="tally-overlay-label">{tr(tallyLabelKey(tallyState))}</div>
          </div>

          <div className="tally-footer">
            {tallyControlsOpen ? 'TAP SCREEN TO HIDE CONTROLS' : 'TAP SCREEN FOR CONTROLS'}
          </div>
        </div>
      )}

      {directorPanelOpen && (
        <div className="director-tally-overlay">
          <div className="director-tally-header">
            <div className="director-title">
              <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', background: '#ff3b30', animation: 'blink 1.5s infinite' }} />
              DIRECTOR TALLY SWITCHER
            </div>
            <div className="director-header-right">
              <div className="director-tc-large">{directorTime}</div>
              <button className="director-close-btn" onClick={() => setDirectorPanelOpen(false)}>EXIT PANEL</button>
            </div>
          </div>

          <div className="director-all-control">
            <div className="director-all-left">
              <span style={{ fontWeight: '800', color: '#ff9500' }}>ALL CAMERAS</span>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>Batch control for all non-assigned states</span>
            </div>
            <div className="director-all-right">
              {(['live', 'preview', 'standby', 'off'] as TallyState[]).map(s => {
                const isActive = tallyPayload?.all === s;
                return (
                  <button
                    key={s}
                    className={`director-action-btn director-btn-${s === 'live' ? 'pgm' : s === 'preview' ? 'pvw' : s} ${isActive ? 'active' : ''}`}
                    style={{ padding: '8px 16px' }}
                    onClick={() => handleAllTallyChange(s)}
                  >
                    ALL {tr(tallyLabelKey(s))}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="director-grid">
            {Object.keys(clients).length === 0 ? (
              <div className="director-no-clients">
                NO ACTIVE CAMERAS CONNECTED
                <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '8px', fontWeight: '400' }}>
                  Connect client phones via P2P to control them from this switcher panel.
                </div>
              </div>
            ) : (
              Object.entries(clients).map(([id, stats]: [string, any]) => {
                const isOffline = Date.now() - stats.lastSeen > 30000;
                const currentAssignedState = tallyPayload?.assignments?.[id] ?? tallyPayload?.all ?? 'off';
                return (
                  <div
                    key={id}
                    className={`director-cam-card status-${currentAssignedState} ${isOffline ? 'offline' : ''}`}
                  >
                    <div className="director-cam-info">
                      <div className="director-cam-name">{id}</div>
                      <div className="director-cam-stats">
                        <span>RTT: {stats.rtt.toFixed(0)}ms</span>
                        <span>Δ: {stats.drift.toFixed(2)}s</span>
                      </div>
                    </div>

                    <div className="director-cam-actions">
                      <button
                        className={`director-action-btn director-btn-pgm ${currentAssignedState === 'live' ? 'active' : ''}`}
                        onClick={() => handleClientTallyChange(id, 'live')}
                      >
                        PGM (LIVE)
                      </button>
                      <button
                        className={`director-action-btn director-btn-pvw ${currentAssignedState === 'preview' ? 'active' : ''}`}
                        onClick={() => handleClientTallyChange(id, 'preview')}
                      >
                        PVW (PREV)
                      </button>
                      <button
                        className={`director-action-btn director-btn-stby ${currentAssignedState === 'standby' ? 'active' : ''}`}
                        onClick={() => handleClientTallyChange(id, 'standby')}
                      >
                        STANDBY
                      </button>
                      <button
                        className={`director-action-btn director-btn-off ${currentAssignedState === 'off' ? 'active' : ''}`}
                        onClick={() => handleClientTallyChange(id, 'off')}
                      >
                        OFF
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {isVisualSlate && (
        <div className={`visual-slate-overlay ${isSlateFlashing ? 'flashing' : ''}`} onClick={handleSlateClick}>
          <div className="slate-tc">{slateTime}</div>
          <div className="slate-info">
            {FPS_OPTIONS[fpsIndex].label} FPS | UBIT: {userBits}
          </div>
          <div className="slate-qr">
            <QRCodeCanvas value={slateTime} size={256} level="L" includeMargin={true} />
          </div>
          <div className="slate-close">{tr('slate.close')}</div>
          <button style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#666', fontSize: '2rem' }} onClick={(e) => { e.stopPropagation(); setIsVisualSlate(false); }}>×</button>
        </div>
      )}

      {showGuide && (
        <div className="guide-overlay" onClick={() => setShowGuide(false)}>
          <div className="guide-card" onClick={(e) => e.stopPropagation()}>
            <div className="guide-head">
              <span className="guide-title">{tr('guide.title')}</span>
              <button type="button" className="guide-x" onClick={() => setShowGuide(false)} aria-label="Close">×</button>
            </div>
            <ol className="guide-steps">
              <li>{tr('guide.step1')}</li>
              <li>{tr('guide.step2')}</li>
              <li>{tr('guide.step3')}</li>
              <li>{tr('guide.step4')}</li>
              <li>{tr('guide.step5')}</li>
            </ol>
            <div className="guide-tip">{tr('guide.tip')}</div>
            <button type="button" className="guide-done" onClick={() => setShowGuide(false)}>{tr('btn.gotIt')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
