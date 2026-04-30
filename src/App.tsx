import { useState, useEffect, useCallback } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { QRCodeCanvas } from 'qrcode.react';

// Hooks & Core
import { useTimecode } from './hooks/useTimecode';
import { usePeerSync } from './hooks/usePeerSync';
import { FPS_OPTIONS, ControlPanel } from './components/ControlPanel';

// Components
import { TimecodeCanvas } from './components/TimecodeCanvas';
import { SyncDashboard } from './components/SyncDashboard';

import './App.css';

export default function App() {
  // --- UI & Environment State ---
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [activeTab, setActiveTab] = useState<'main' | 'sync' | 'tools'>('main');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisualSlate, setIsVisualSlate] = useState(false);
  const [isSlateFlashing, setIsSlateFlashing] = useState(false);
  const [slateTime, setSlateTime] = useState('00:00:00:00');
  const [markers, setMarkers] = useState<{ id: number, tc: string, time: string, color: 'Red' | 'Blue' | 'Green' | 'Yellow' }[]>([]);

  // --- Settings State ---
  const [fpsIndex, setFpsIndex] = useState(2); // 25 fps default
  const [volume, setVolume] = useState(0.5);
  const [outputLevel, setOutputLevel] = useState<'mic' | 'line'>('line');
  const [outputMode, setOutputMode] = useState<'stereo' | 'mono-l'>('stereo');
  const [userBits, setUserBits] = useState('00000000');
  const [autoUserBits, setAutoUserBits] = useState(true);

  // --- Core Hooks ---
  const {
    isRunning,
    isPaused,
    manualTimecode,
    masterDrift,
    engineRef,
    smartClockRef,
    startEngine,
    stopEngine,
    togglePause,
    applyPrecisionSync,
    applyCoarseSync,
    updateSettings,
    setManualTime
  } = useTimecode();

  const {
    peerId,
    p2pStatus,
    p2pRole,
    setupMaster,
    setupClient,
    joinSession,
    requestSyncBurst,
    sendReport
  } = usePeerSync({
    fps: FPS_OPTIONS[fpsIndex].value,
    isDropFrame: FPS_OPTIONS[fpsIndex].drop,
    isRunning,
    getCurrentTimecode: () => engineRef.current?.getTimecodeString() || '00:00:00:00',
    onPrecisionSync: (msg, rtt) => {
      const decision = applyPrecisionSync(rtt, msg.masterTimecode, msg.isRunning);
      sendReport(decision.bestRtt || rtt, masterDrift || 0);
    },
    onCoarseSync: (msg) => {
      applyCoarseSync(msg.masterTimecode, msg.isRunning);
    },
    onClientReport: () => {
      // Could log client status here if needed
    }
  });

  // --- Lifecycle & Side Effects ---
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const initMobile = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (e) { /* non-mobile */ }
    };
    initMobile();
  }, []);

  // Update engine when settings change
  useEffect(() => {
    updateSettings({
      fps: FPS_OPTIONS[fpsIndex].value,
      isDropFrame: FPS_OPTIONS[fpsIndex].drop,
      volume: outputLevel === 'line' ? volume : volume * 0.1,
      userBits,
      outputMode
    });
  }, [fpsIndex, volume, outputLevel, userBits, outputMode, updateSettings]);

  // Auto User Bits
  useEffect(() => {
    if (autoUserBits) {
      const updateAutoUB = () => {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        setUserBits(`${mm}${dd}${yy}01`);
      };
      updateAutoUB();
      const interval = setInterval(updateAutoUB, 60000);
      return () => clearInterval(interval);
    }
  }, [autoUserBits]);

  // Aggressive Sync check for client
  useEffect(() => {
    let interval: any;
    if (p2pRole === 'client') {
      interval = setInterval(() => {
        if (masterDrift !== null && smartClockRef.current.getNeedsAggressiveSync(masterDrift)) {
          requestSyncBurst();
        }
      }, 500); // Check twice a second
    }
    return () => clearInterval(interval);
  }, [p2pRole, masterDrift, smartClockRef, requestSyncBurst]);

  // --- Handlers ---
  const handleStartStop = () => {
    if (isRunning) {
      stopEngine();
    } else {
      startEngine({
        fps: FPS_OPTIONS[fpsIndex].value,
        sampleRate: 48000,
        volume: outputLevel === 'line' ? volume : volume * 0.1,
        isDropFrame: FPS_OPTIONS[fpsIndex].drop,
        userBits,
        outputMode,
        fpsNum: FPS_OPTIONS[fpsIndex].fpsNum,
        fpsDen: FPS_OPTIONS[fpsIndex].fpsDen
      }, () => {
        // Worklet message fallback if needed, but TimecodeCanvas handles drawing.
      });
    }
  };

  const addMarker = (color: 'Red' | 'Blue' | 'Green' | 'Yellow') => {
    const currentTC = engineRef.current ? engineRef.current.getTimecodeString() : '00:00:00:00';
    setMarkers(prev => [{
      id: Date.now(),
      tc: currentTC,
      time: new Date().toLocaleTimeString(),
      color
    }, ...prev]);
  };

  const exportToEDL = () => {
    if (markers.length === 0) return;
    let edl = `TITLE: Phone-TC Session\nFCM: NON-DROP FRAME\n\n`;
    markers.forEach((m, i) => {
      const num = String(i + 1).padStart(3, '0');
      edl += `${num}  AX       V     C        ${m.tc} ${m.tc} ${m.tc} ${m.tc}\n`;
      edl += `* FROM CLIP NAME: Marker ${m.color}\n* TIME: ${m.time}\n\n`;
    });
    const blob = new Blob([edl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Markers_${new Date().toISOString().replace(/[:.]/g, '')}.edl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerVisualSlate = () => {
    setIsVisualSlate(true);
    setIsSlateFlashing(true);
    setTimeout(() => setIsSlateFlashing(false), 200);
  };

  const handleTimecodeCanvasUpdate = useCallback((tc: string) => {
    if (isVisualSlate) {
      setSlateTime(tc);
    }
  }, [isVisualSlate]);

  // --- Render ---
  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: '#000', color: '#fff', flexDirection: 'column', gap: '20px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #333', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '4px' }}>INITIALIZING ENGINE</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Common main content
  const mainContent = (
    <div className="tab-pane">
      <div 
        className="timecode-card-pro" 
        onClick={triggerVisualSlate}
      >
        <TimecodeCanvas 
          engineRef={engineRef} 
          isRunning={isRunning} 
          isMobile={isMobile} 
          onTimeUpdate={handleTimecodeCanvasUpdate}
        />
      </div>

      {!isRunning && p2pRole !== 'client' && (
        <div className="manual-tc-input-wrapper" style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
          <input 
            type="text" 
            value={manualTimecode}
            onChange={(e) => setManualTime(e.target.value)}
            className="manual-tc-input"
            style={{ 
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', 
              fontFamily: 'var(--font-mono)', fontSize: '1rem', padding: '8px', textAlign: 'center', borderRadius: '4px'
            }}
            placeholder="HH:MM:SS:FF"
          />
        </div>
      )}

      {p2pRole !== 'client' && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button 
            className={`btn-pill ${isRunning ? 'active' : ''}`} 
            style={{ flex: 1, padding: '16px 0', background: isRunning ? '#ff3d71' : 'var(--primary)', color: '#000' }}
            onClick={handleStartStop}
          >
            {isRunning ? 'STOP GENERATOR' : 'START GENERATOR'}
          </button>
          
          <button 
            className={`btn-pill ${isPaused ? 'active' : ''}`}
            style={{ flex: 1, padding: '16px 0' }}
            onClick={togglePause}
            disabled={!isRunning}
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
      )}

      <div className="info-strip-pro" style={{ marginTop: '16px' }}>
        <span className="info-label">{FPS_OPTIONS[fpsIndex].label} FPS</span>
        <span className="info-label">|</span>
        <span className="info-label">{outputLevel.toUpperCase()}</span>
        <span className="info-label">|</span>
        <span className="info-label">{outputMode.toUpperCase()}</span>
      </div>
    </div>
  );

  return (
    <div className={`app-container ${!isMobile ? 'desktop-view' : ''}`}>
      <header>
        <div className="logo-area">
          <div className="logo">PHONE TC</div>
          <div className="version">PRO ENGINE</div>
        </div>
        <div className={`status-badge-compact ${isRunning ? 'active' : ''}`}>
          {isRunning ? (isPaused ? 'PAUSED' : 'TX ACTIVE') : 'STANDBY'}
        </div>
      </header>

      {isMobile ? (
        <>
          <div className="tab-bar">
            <button className={activeTab === 'main' ? 'active' : ''} onClick={() => setActiveTab('main')}>MAIN</button>
            <button className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')}>SYNC</button>
            <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>TOOLS</button>
          </div>

          <div className="tab-content">
            {activeTab === 'main' && mainContent}
            {activeTab === 'sync' && (
              <SyncDashboard 
                p2pRole={p2pRole} p2pStatus={p2pStatus} peerId={peerId} masterDrift={masterDrift}
                onSetupMaster={setupMaster} onSetupClient={setupClient} onJoinSession={joinSession}
              />
            )}
            {activeTab === 'tools' && (
              <ControlPanel 
                fpsIndex={fpsIndex} setFpsIndex={setFpsIndex}
                volume={volume} setVolume={setVolume}
                outputLevel={outputLevel} setOutputLevel={setOutputLevel}
                outputMode={outputMode} setOutputMode={setOutputMode}
                userBits={userBits} setUserBits={setUserBits}
                autoUserBits={autoUserBits} setAutoUserBits={setAutoUserBits}
              />
            )}
          </div>
        </>
      ) : (
        <div className="desktop-dashboard">
          <div className="sync-pane">
            <SyncDashboard 
              p2pRole={p2pRole} p2pStatus={p2pStatus} peerId={peerId} masterDrift={masterDrift}
              onSetupMaster={setupMaster} onSetupClient={setupClient} onJoinSession={joinSession}
            />
          </div>
          
          <div className="main-pane">
            {mainContent}
          </div>

          <div className="tools-pane">
             <ControlPanel 
                fpsIndex={fpsIndex} setFpsIndex={setFpsIndex}
                volume={volume} setVolume={setVolume}
                outputLevel={outputLevel} setOutputLevel={setOutputLevel}
                outputMode={outputMode} setOutputMode={setOutputMode}
                userBits={userBits} setUserBits={setUserBits}
                autoUserBits={autoUserBits} setAutoUserBits={setAutoUserBits}
              />
          </div>
        </div>
      )}

      {/* Markers fixed footer */}
      <div className="fixed-footer" style={{ padding: '12px 20px', background: 'var(--panel)', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button className="btn-pill" style={{ flex: 1, borderLeft: '4px solid #ff3d71' }} onClick={() => addMarker('Red')}>MARK R</button>
          <button className="btn-pill" style={{ flex: 1, borderLeft: '4px solid #00e5ff' }} onClick={() => addMarker('Blue')}>MARK B</button>
          <button className="btn-pill" style={{ flex: 1, borderLeft: '4px solid #00e676' }} onClick={() => addMarker('Green')}>MARK G</button>
          <button className="btn-pill" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }} onClick={exportToEDL}>EXPORT EDL</button>
        </div>
        <div className="marker-scroll" style={{ maxHeight: '80px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {markers.length === 0 ? (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>NO MARKERS RECORDED</div>
          ) : (
            markers.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                <span style={{ color: m.color === 'Red' ? '#ff3d71' : m.color === 'Blue' ? '#00e5ff' : '#00e676' }}>{m.time}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{m.tc}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Visual Slate Overlay */}
      {isVisualSlate && (
        <div 
          className={`visual-slate-overlay ${isSlateFlashing ? 'flash' : ''}`}
          onClick={() => setIsVisualSlate(false)}
        >
          <div className="slate-info">
            <span>FPS: {FPS_OPTIONS[fpsIndex].label}</span>
            <span>UB: {userBits}</span>
          </div>
          
          <TimecodeCanvas 
            engineRef={engineRef} 
            isRunning={isRunning} 
            isMobile={isMobile}
            isVisualSlate={true}
          />
          
          <div className="slate-qr">
            <QRCodeCanvas 
              value={slateTime} 
              size={isMobile ? 120 : 200}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
          
          <div className="slate-close">TAP TO CLOSE</div>
        </div>
      )}
    </div>
  );
}
