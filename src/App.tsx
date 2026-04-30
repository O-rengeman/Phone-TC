import { useState, useEffect, useRef } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { LtcEngine } from './utils/LtcEngine';
import type { LtcSettings } from './utils/LtcEngine';
import { TimeSync } from './utils/TimeSync';
import { PeerSync } from './utils/PeerSync';
import type { SyncMessage } from './utils/PeerSync';
import { QRCodeCanvas } from 'qrcode.react';
import './App.css';

const FPS_OPTIONS = [
  { label: '23.976', value: 23.976, drop: false, fpsNum: 24000, fpsDen: 1001 },
  { label: '24', value: 24, drop: false, fpsNum: 24000, fpsDen: 1000 },
  { label: '25', value: 25, drop: false, fpsNum: 25000, fpsDen: 1000 },
  { label: '29.97', value: 29.97, drop: false, fpsNum: 30000, fpsDen: 1001 },
  { label: '29.97 DF', value: 29.97, drop: true, fpsNum: 30000, fpsDen: 1001 },
  { label: '30', value: 30, drop: false, fpsNum: 30000, fpsDen: 1000 },
];

type SyncMode = 'system' | 'network' | 'p2p';

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [fpsIndex, setFpsIndex] = useState(2); // Default 25
  const [volume, setVolume] = useState(0.5);
  // Remove displayTime state as we'll use a ref-based component for performance
  // const [displayTime, setDisplayTime] = useState('00:00:00:00');
  const displayRef = useRef<HTMLDivElement>(null);
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
  const [isLoaded, setIsLoaded] = useState(false);
  const [slateTime, setSlateTime] = useState('00:00:00:00');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 1800);
    return () => clearTimeout(timer);
  }, []);
  
  // Resize handler
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [userBits, setUserBits] = useState('00000000');
  const [isVisualSlate, setIsVisualSlate] = useState(false);
  const [markers, setMarkers] = useState<{ id: number, tc: string, time: string, color: 'Red' | 'Blue' | 'Green' | 'Yellow' }[]>([]);
  const [outputLevel, setOutputLevel] = useState<'mic' | 'line'>('line');

  // P2P States
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [p2pStatus, setP2pStatus] = useState<string>('P2P DISCONNECTED');
  const [isHost, setIsHost] = useState(false);
  const [rttHistory, setRttHistory] = useState<number[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [p2pSyncSource, setP2pSyncSource] = useState<'manual' | 'network'>('manual');
  const [masterDrift, setMasterDrift] = useState<number | null>(null); // Drift in seconds from master
  const [clients, setClients] = useState<Record<string, { rtt: number, drift: number, lastSeen: number }>>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<LtcEngine | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const peerSyncRef = useRef<PeerSync | null>(null);
  const lastSyncTimeRef = useRef<number>(Date.now()); // Track last forced sync time

  // Mobile Initialization
  useEffect(() => {
    const initMobile = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (e) {
        console.log('Not running on a mobile device');
      }
    };
    initMobile();
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
    // Initial update
    if (displayRef.current) displayRef.current.innerText = engineRef.current.getTimecodeString();
  }, []);

  // Update FPS/Volume
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setFps(FPS_OPTIONS[fpsIndex].value, FPS_OPTIONS[fpsIndex].drop);
      if (displayRef.current) displayRef.current.innerText = engineRef.current.getTimecodeString();
    }
  }, [fpsIndex]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setVolume(volume);
  }, [volume]);

  const messageHandlerRef = useRef<(msg: SyncMessage) => void>(null);

  // Update the message handler reference every render
  useEffect(() => {
    messageHandlerRef.current = (msg: SyncMessage) => {
      if (engineRef.current) {
        if (msg.type === 'sync-request' && isHost) {
          // Master: Reply with current time and raw timestamp
          const response: SyncMessage = {
            type: 'sync-response',
            masterTimecode: engineRef.current.getTimecodeString(),
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
          
          setRttHistory(prev => {
            const next = [...prev, rtt].slice(-10);
            return next;
          });

          // Calculate drift BEFORE deciding whether to sync
          const diff = engineRef.current.getDiffSeconds(msg.masterTimecode);
          setMasterDrift(diff);

          // Sync conditions: diff >= 0.5s OR 10 seconds since last sync
          const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
          const shouldSync = diff >= 0.5 || timeSinceLastSync >= 10000;

          if (shouldSync) {
            engineRef.current.jamSyncDirect(
              msg.masterTimecode, 
              oneWayLatency, 
              msg.isRunning
            );
            lastSyncTimeRef.current = Date.now();
          }

          if (!isRunning) {
            if (displayRef.current) displayRef.current.innerText = engineRef.current.getTimecodeString();
          }
          const bestRtt = rttHistory.length > 0 ? Math.min(...rttHistory, rtt) : rtt;
          setP2pStatus(`${shouldSync ? 'SYNCED' : 'OK'} (RTT ${bestRtt.toFixed(0)}ms)`);

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
          const shouldSync = diff >= 0.5 || timeSinceLastSync >= 10000;

          if (shouldSync) {
            engineRef.current.jamSyncDirect(msg.masterTimecode, 0, msg.isRunning);
            lastSyncTimeRef.current = Date.now();
          }
          if (!isRunning) {
            if (displayRef.current) displayRef.current.innerText = engineRef.current.getTimecodeString();
          }
          setP2pStatus(`${shouldSync ? 'SYNCED' : 'OK'} (HB)`);

          // Periodically report during heartbeat too
          if (Date.now() % 5000 < 500) {
             peerSyncRef.current?.send({
                type: 'report',
                masterTimecode: '',
                masterTimestamp: 0,
                fps: 0,
                isDropFrame: false,
                isRunning: false,
                rtt: rttHistory.length > 0 ? Math.min(...rttHistory) : 0,
                drift: diff
             });
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
    const newMarker = {
      id: Date.now(),
      tc: currentTC,
      time: new Date().toLocaleTimeString(),
      color: color
    };
    setMarkers([newMarker, ...markers]); // 最新を上に表示し、全件保持する
  };

  const exportToEDL = () => {
    if (markers.length === 0) return;

    let edlContent = `TITLE: Logged Takes\nFCM: NON-DROP FRAME\n\n`;
    const sortedMarkers = [...markers].reverse();
    sortedMarkers.forEach((m, index) => {
      const eventNum = String(index + 1).padStart(3, '0');
      edlContent += `${eventNum}  AX       V     C        ${m.tc} ${m.tc} ${m.tc} ${m.tc}\n`;
      edlContent += ` |C:ResolveColor${m.color} |M:Logged Take at ${m.time} |D:1\n\n`;
    });

    const blob = new Blob([edlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PHONE_TC_${new Date().toISOString().slice(0, 10)}.edl`;
    a.click();
  };

  const exportToALE = () => {
    if (markers.length === 0) return;
    const dateStr = new Date().toISOString().slice(0,10);
    let ale = `Heading\nFIELD_DELIM\tTABS\nVIDEO_FORMAT\t1080\nFPS\t${FPS_OPTIONS[fpsIndex].label}\n\nColumn\nName\tTracks\tStart\tEnd\tDescription\n\nData\n`;
    markers.forEach((m, i) => {
      ale += `MARKER_${markers.length - i}\tV\t${m.tc}\t${m.tc}\t${m.color} marker at ${m.time}\n`;
    });

    const blob = new Blob([ale], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PHONE_TC_${dateStr}.ale`;
    a.click();
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
      setP2pStatus('PEER INIT FAILED');
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
      setP2pStatus('PEER INIT FAILED');
    }
  };

  useEffect(() => {
    if (engineRef.current && p2pRole === 'master' && !isRunning && !isPaused) {
      try {
        engineRef.current.setManualTimecode(manualTimecode);
        if (displayRef.current) displayRef.current.innerText = engineRef.current.getTimecodeString();
      } catch (e) {
        // Ignore invalid formats while typing
      }
    }
  }, [manualTimecode, p2pRole, isRunning, isPaused]);

  const joinSession = () => {
    if (!peerSyncRef.current || !targetId) return;
    peerSyncRef.current.connect(targetId);
    setSyncMode('p2p');
  };

  // Periodic Heartbeat & Sync Requests
  useEffect(() => {
    if (!peerSyncRef.current) return;

    const interval = setInterval(() => {
      if (isHost) {
        // Master broadcasts coarse heartbeats
        const msg: SyncMessage = {
          type: 'heartbeat',
          masterTimecode: engineRef.current!.getTimecodeString(),
          masterTimestamp: Date.now(), // Raw local time
          fps: FPS_OPTIONS[fpsIndex].value,
          isDropFrame: FPS_OPTIONS[fpsIndex].drop,
          isRunning: isRunning
        };
        peerSyncRef.current?.broadcast(msg);
      } else if (p2pRole === 'client') {
        // Client requests precision sync
        const msg: SyncMessage = {
          type: 'sync-request',
          masterTimecode: '',
          masterTimestamp: 0,
          fps: 0,
          isDropFrame: false,
          isRunning: false,
          clientTimestamp: performance.now() // Sub-ms precision
        };
        peerSyncRef.current?.broadcast(msg);
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [isHost, p2pRole, fpsIndex, syncStatus, isRunning]);

  // Periodic Network Sync
  useEffect(() => {
    if (syncMode !== 'network' || !isRunning) return;

    const interval = setInterval(async () => {
      try {
        console.log('Background network time sync...');
        const result = await TimeSync.sync(1);
        setSyncStatus(result);
        if (engineRef.current && p2pRole !== 'master') {
           // Gently nudge the engine if offset changed significantly
           // For now, we just update the status, engine uses it in next jamSync/start
        }
      } catch (e) {
        console.warn('Background sync failed');
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [syncMode, isRunning, p2pRole]);

  const handleStartStop = async () => {
    if (isRunning) {
      setIsPaused(false); // Stop means fully reset
      stopEngine();
    } else {
      // Create/Resume AudioContext IMMEDIATELY on user gesture
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
          const result = await TimeSync.sync();
          setSyncStatus(result);
          offset = result.offset;
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
              clientTimestamp: performance.now()
            };
            peerSyncRef.current.broadcast(msg);
          }
          lastSyncTimeRef.current = Date.now();
        } else if (engineRef.current) {
          if (syncMode === 'p2p' && p2pRole === 'master' && p2pSyncSource === 'manual') {
            engineRef.current.setManualTimecode(manualTimecode);
          } else {
            engineRef.current.syncWithOffset(offset);
          }
          if (displayRef.current) displayRef.current.innerText = engineRef.current.getTimecodeString();
        }
      }

      setIsPaused(false);
      await startEngine();
    } catch (err) {
      console.error('Start sequence failed:', err);
      alert('Start sequence failed. Please check your connection.');
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

    const engine = engineRef.current!;
    
    // Setup Audio Input for mono-l mode (Pass-through)
    let inputSource: MediaStreamAudioSourceNode | null = null;
    if (outputMode === 'mono-l') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        inputSource = ctx.createMediaStreamSource(stream);
      } catch (err) {
        console.warn('Microphone access denied for R-Audio mode');
      }
    }

    const scriptNode = ctx.createScriptProcessor(2048, 1, 2);
    let currentFrameSamples: Float32Array | null = null;
    let sampleOffset = 0;

    scriptNode.onaudioprocess = (e) => {
      const outputL = e.outputBuffer.getChannelData(0);
      const outputR = e.outputBuffer.getChannelData(1);
      const input = e.inputBuffer.getChannelData(0);

      for (let i = 0; i < outputL.length; i++) {
        if (!currentFrameSamples || sampleOffset >= currentFrameSamples.length) {
          currentFrameSamples = engine.generateFrameSamples();
          sampleOffset = 0;
          // UI update is handled by requestAnimationFrame for performance
        }
        
        const tcSample = currentFrameSamples[sampleOffset];
        outputL[i] = tcSample;
        
        if (outputMode === 'stereo') {
          outputR[i] = tcSample;
        } else {
          // Pass-through microphone to Right channel
          outputR[i] = input[i] || 0;
        }
        
        sampleOffset++;
      }
    };

    // UI Animation loop using requestAnimationFrame
    let rafId: number;
    const updateUI = () => {
      if (engineRef.current) {
        const tc = engineRef.current.getTimecodeString();
        if (displayRef.current) {
          displayRef.current.innerText = tc;
        }
        // Only update slateTime state when the overlay is visible to save CPU
        if (isVisualSlate) {
          setSlateTime(tc);
        }
      }
      rafId = requestAnimationFrame(updateUI);
    };
    rafId = requestAnimationFrame(updateUI);
    
    if (inputSource) inputSource.connect(scriptNode);
    scriptNode.connect(ctx.destination);
    scriptNodeRef.current = scriptNode;
    setIsRunning(true);

    return () => {
      cancelAnimationFrame(rafId);
    };
  };

  const stopEngine = () => {
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    setIsRunning(false);
  };

  const handlePause = () => {
    if (isRunning && engineRef.current) {
      setIsPaused(true);
      setManualTimecode(engineRef.current.getTimecodeString());
      stopEngine();
    }
  };

  return (
    <div className={`app-container pro-theme ${isMobile ? 'mobile-view' : 'desktop-view'}`}>
      {!isLoaded && (
        <div className="splash-screen">
          <div className="splash-content">
            <div className="splash-logo">LTC SYNC PRO</div>
            <div className="splash-loader">
              <div className="loader-bar"></div>
            </div>
            <div className="splash-status">INITIALIZING PRO SYSTEMS...</div>
          </div>
        </div>
      )}
      <header>
        <div className="logo-area">
          <div className="logo">LTC SYNC PRO</div>
          <div className="version">v1.3</div>
        </div>
        <div className={`status-badge-compact ${isRunning ? 'active' : ''}`}>
          {isRunning ? 'LTC OUT' : isPreparing ? 'SYNCING' : 'READY'}
        </div>
      </header>

      {isMobile && (
        <nav className="tab-bar">
          <button className={activeTab === 'main' ? 'active' : ''} onClick={() => setActiveTab('main')}>MAIN</button>
          <button className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')}>SYNC</button>
          <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>TOOLS</button>
        </nav>
      )}

      <main className={isMobile ? 'tab-content' : 'desktop-dashboard'}>
        {(isMobile ? activeTab === 'main' : true) && (
          <div className="tab-pane main-pane">
            <div className="timecode-card-pro" onClick={() => setIsVisualSlate(true)}>
              <div className="time-display" ref={displayRef}>00:00:00:00</div>
              <div className="info-strip-pro">
                <span className="info-label">FPS: {FPS_OPTIONS[fpsIndex].label}</span>
                <span className="info-label">LVL: {outputLevel.toUpperCase()}</span>
                <span className="info-label">UBIT: {userBits}</span>
                {p2pRole === 'client' && masterDrift !== null && (
                  <span className={`info-label ${masterDrift >= 0.5 ? 'warn' : 'ok'}`}>
                    Δ {masterDrift < 0.01 ? '<0.01' : masterDrift.toFixed(2)}s
                  </span>
                )}
              </div>
            </div>

            {isMobile && (
              <>
                <div className="control-section">
                  <label className="section-label">FRAME RATE</label>
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
                  <label className="section-label">OUTPUT VOLUME & LEVEL</label>
                  <div className="volume-row">
                    <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
                    <div className="level-toggle">
                      <button className={outputLevel === 'mic' ? 'active' : ''} onClick={() => setOutputLevel('mic')}>MIC</button>
                      <button className={outputLevel === 'line' ? 'active' : ''} onClick={() => setOutputLevel('line')}>LINE</button>
                    </div>
                  </div>
                </div>

                <div className="control-section">
                  <label className="section-label">OUTPUT MODE (FOR DSLR SYNC)</label>
                  <div className="sync-toggle-pro">
                    <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => setOutputMode('stereo')}>STEREO TC</button>
                    <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => setOutputMode('mono-l')}>L-TC / R-AUDIO</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {(isMobile ? activeTab === 'sync' : true) && (
          <div className="tab-pane sync-pane">
            <div className="control-section">
              <label className="section-label">SYNC METHOD</label>
              <div className="sync-toggle-pro">
                {['system', 'network', 'p2p'].map((m) => (
                  <button 
                    key={m}
                    className={syncMode === m ? 'active' : ''}
                    onClick={() => setSyncMode(m as SyncMode)}
                    disabled={isRunning || (m === 'p2p' && !p2pRole)}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
              {syncStatus && syncMode === 'network' && (
                <div className="sync-detail">Latency: {syncStatus.latency.toFixed(1)}ms | Offset: {syncStatus.offset.toFixed(1)}ms</div>
              )}
            </div>

            <div className="control-section">
              <label className="section-label">P2P NETWORK</label>
              {!p2pRole ? (
                <div className="p2p-init-pro">
                  <button onClick={setupP2PMaster}>CREATE MASTER</button>
                  <button onClick={setupP2PClient}>JOIN AS CLIENT</button>
                </div>
              ) : (
                <div className="p2p-panel-pro">
                  <div className="p2p-header">
                    <span className="role-tag">{p2pRole.toUpperCase()}</span>
                    <button className="btn-small" onClick={resetP2P}>RESET</button>
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

            {!isMobile && (
              <div className="control-section">
                <label className="section-label">FRAME RATE</label>
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
            {isHost && Object.keys(clients).length > 0 && (
              <div className="control-section clients-list-section">
                <label className="section-label">CONNECTED CLIENTS ({Object.keys(clients).length})</label>
                <div className="clients-grid">
                  {Object.entries(clients).map(([id, stats]) => {
                    const isOffline = Date.now() - stats.lastSeen > 30000;
                    return (
                      <div key={id} className={`client-card ${isOffline ? 'offline' : ''}`}>
                        <div className="client-id">{id}</div>
                        <div className="client-stats">
                          <span className="stat">RTT: {stats.rtt.toFixed(0)}ms</span>
                          <span className={`stat ${stats.drift >= 0.5 ? 'drift-warn' : ''}`}>
                            Δ: {stats.drift.toFixed(2)}s
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="tools-grid-pro">
              <div className="tool-card span-2">
                <label>USER BITS (HEX)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input value={userBits} onChange={e => setUserBits(e.target.value.toUpperCase())} maxLength={8} disabled={autoUserBits} />
                  <button className={`btn-pill ${autoUserBits ? 'active' : ''}`} onClick={() => setAutoUserBits(!autoUserBits)}>AUTO (DATE)</button>
                </div>
              </div>
              {!isMobile && (
                <>
                  <div className="tool-card span-2">
                    <label className="section-label">OUTPUT VOLUME & LEVEL</label>
                    <div className="volume-row">
                      <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
                      <div className="level-toggle">
                        <button className={outputLevel === 'mic' ? 'active' : ''} onClick={() => setOutputLevel('mic')}>MIC</button>
                        <button className={outputLevel === 'line' ? 'active' : ''} onClick={() => setOutputLevel('line')}>LINE</button>
                      </div>
                    </div>
                  </div>

                  <div className="tool-card span-2">
                    <label className="section-label">OUTPUT MODE (FOR DSLR SYNC)</label>
                    <div className="sync-toggle-pro">
                      <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => setOutputMode('stereo')}>STEREO TC</button>
                      <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => setOutputMode('mono-l')}>L-TC / R-AUDIO</button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="marker-section-pro">
              <div className="marker-header">
                <label>LOGGED TAKES</label>
                <div className="export-group">
                  <button className="btn-export-pro" onClick={exportToEDL} disabled={markers.length === 0}>EDL</button>
                  <button className="btn-export-pro" onClick={exportToALE} disabled={markers.length === 0}>ALE</button>
                </div>
              </div>
              <div className="marker-scroll">
                {markers.length === 0 ? (
                  <div className="empty-msg">NO MARKERS RECORDED</div>
                ) : (
                  markers.map(m => (
                    <div key={m.id} className="marker-row-pro">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className={`color-dot ${m.color.toLowerCase()}`}></div>
                        <span className="m-tc">{m.tc}</span>
                      </div>
                      <span className="m-time">{m.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed-footer">
        <div className="footer-buttons">
          <div className="footer-left">
            <button 
              className={`btn-main-action ${isRunning ? 'running danger' : ''}`} 
              onClick={handleStartStop}
              disabled={isPreparing}
            >
              <div className="btn-icon"></div>
              <div className="btn-text">
                {isRunning ? 'STOP' : isPreparing ? 'PREP...' : isPaused ? 'RESUME' : 'START'}
              </div>
            </button>
            {isRunning && (
              <button className="btn-main-action pause" onClick={handlePause}>
                <div className="btn-text">PAUSE</div>
              </button>
            )}
          </div>
          <div className="footer-right">
            <div className="mark-label">MARK</div>
            <div className="mark-colors-container">
              <button className="btn-mark-color red" onClick={() => addMarker('Red')} title="Red Marker"></button>
              <button className="btn-mark-color blue" onClick={() => addMarker('Blue')} title="Blue Marker"></button>
              <button className="btn-mark-color green" onClick={() => addMarker('Green')} title="Green Marker"></button>
              <button className="btn-mark-color yellow" onClick={() => addMarker('Yellow')} title="Yellow Marker"></button>
            </div>
          </div>
        </div>
      </footer>

      {isVisualSlate && (
        <div className={`visual-slate-overlay ${isSlateFlashing ? 'flashing' : ''}`} onClick={handleSlateClick}>
          <div className="slate-tc">{slateTime}</div>
          <div className="slate-info">
            {FPS_OPTIONS[fpsIndex].label} FPS | UBIT: {userBits}
          </div>
          <div className="slate-qr">
            <QRCodeCanvas value={slateTime} size={256} level="L" includeMargin={true} />
          </div>
          <div className="slate-close">TAP FOR CLAPPER / LONG PRESS TO CLOSE</div>
          <button style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#666', fontSize: '2rem' }} onClick={(e) => { e.stopPropagation(); setIsVisualSlate(false); }}>×</button>
        </div>
      )}
    </div>
  );
};

export default App;
