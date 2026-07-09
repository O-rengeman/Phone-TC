import { useCallback, useEffect, useRef, useState } from 'react';
import { LTCSyncProvider, useLTC } from './LTCSyncContext';
import { FPS_OPTIONS } from './constants';
import { VideoPlayer } from './VideoPlayer';
import { ConnectionManager } from './ConnectionManager';
import { QRCodeCanvas } from 'qrcode.react';
import { tallyLabelKey, TALLY_COLORS } from './utils/tally';
import type { TallyState } from './utils/tally';
import type { SyncMode } from './LTCSyncContext';
import { formatSyncAge } from './utils/DriftMonitor';
import { formatDuration } from './utils/battery';
import { Toaster, toast } from 'react-hot-toast';
import { VuMeter } from './components/VuMeter';
import { VideoRenderer } from './components/VideoRenderer';
import { ReturnMonitor } from './components/ReturnMonitor';
import { useMediaStreams } from './hooks/useMediaStreams';
import { getAutoSwitcherAssignment, resolveReturnFeed } from './utils/switcherRouting';
import Timecode from 'smpte-timecode';
import './App.css';

function FloatingPip({ stream, onClose }: { stream: MediaStream; onClose: () => void }) {
  const [position, setPosition] = useState({ x: Math.max(0, window.innerWidth - 180 - 16), y: Math.max(0, window.innerHeight - 120 - 70) });
  const [size, setSize] = useState({ width: 180, height: 120 });
  const pipRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).classList.contains('pip-resize-handle')) {
      isResizingRef.current = true;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }

    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - size.width, dragStartRef.current.posX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - size.height, dragStartRef.current.posY + dy))
      });
    } else if (isResizingRef.current) {
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      setSize({
        width: Math.max(100, Math.min(600, resizeStartRef.current.width + dx)),
        height: Math.max(75, Math.min(450, resizeStartRef.current.height + dy))
      });
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    isResizingRef.current = false;
  };

  return (
    <div
      ref={pipRef}
      className="floating-pip"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 9999,
        touchAction: 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="pip-header">
        <span>RETURN OUT</span>
        <button className="pip-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="pip-content">
        <VideoRenderer stream={stream} className="pip-video-el" />
      </div>
      <div className="pip-resize-handle" />
    </div>
  );
}

function MainApp() {
  const {
    isRunning,
    fpsIndex,
    setFpsIndex,
    volume,
    setVolume,
    syncStatus,
    syncMode,
    setSyncMode,
    isPreparing,
    manualTimecode,
    setManualTimecode,
    p2pRole,
    activeTab,
    setActiveTab,
    isMobile,
    outputMode,
    setOutputMode,
    autoUserBits,
    setAutoUserBits,
    isSlateFlashing,
    isVisualSlate,
    setIsVisualSlate,
    slateTime,
    userBits,
    setUserBits,
    markers,
    defaultReelName,
    setDefaultReelName,
    outputLevel,
    setOutputLevel,
    outputOffset,
    setOutputOffset,
    peerId,
    targetId,
    isHost,
    driftStatus,
    isPaused,
    stopHoldPct,
    showGuide,
    setShowGuide,
    tallyOpen,
    setTallyOpen,
    tallyTorchEnabled,
    setTallyTorchEnabled,
    manualTally,
    tallyPayload,
    tallyTime,
    tallyDimmerOpacity,
    tallyTcSize,
    setTallyTcSize,
    tallyStyle,
    setTallyStyle,
    tallyBorderSize,
    setTallyBorderSize,
    pipEnabled,
    setPipEnabled,
    directorPanelOpen,
    setDirectorPanelOpen,
    directorTime,
    cameraLabels,
    setCameraLabels,
    tallyActionLog,
    isResyncing,
    lang,
    setLang,
    batteryLevel,
    isCharging,
    batteryEta,
    markerFlash,
    clients,
    nowTick,
    sceneName,
    setSceneName,
    tr,
    playHapticFeedback,
    addMarker,
    removeMarker,
    updateMarkerComment,
    exportToEDL,
    exportToALE,
    handleSlateClick,
    handleStartStop,
    handlePause,
    beginStopHold,
    cancelStopHold,
    handleManualResync,
    handleManualTallyChange,
    handleClientTallyChange,
    handleSwitcherBusChange,
    tallyState,
    isTallyConnected,
    handleDimmerCycle,
    handleTorchToggle,
    handleTallyExit,
    holdStoppedRef,
    isVideoEnabled,
    setIsVideoEnabled,
    toggleVideoMonitoring,
    mediaServiceRef
  } = useLTC();

  const mediaStreams = useMediaStreams();
  const [pgmSourceId, setPgmSourceId] = useState<string | null>(null);
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0); // 0 (PGM) to 100 (PVW)
  const autoTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFeed = resolveReturnFeed(targetId, mediaStreams);
  const returnStream = returnFeed.stream;
  const { programId: effectivePgmSourceId, previewId: effectivePreviewSourceId } = isHost
    ? getAutoSwitcherAssignment(Object.keys(clients), pgmSourceId, previewSourceId)
    : { programId: pgmSourceId, previewId: previewSourceId };

  const handleOutputModeChange = (mode: 'stereo' | 'mono-l') => {
    setOutputMode(mode);
    if (mode === 'mono-l') {
      toast('⚠️ HEADPHONES REQUIRED for L-TC / R-AUDIO mode to prevent audio feedback loop!', {
        icon: '🎧',
        style: { background: '#f5a623', color: '#000', fontWeight: 'bold' }
      });
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
    };

    updateViewportHeight();

    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (!isHost) return;
    const service = mediaServiceRef.current;
    if (!service) return;

    if (!effectivePgmSourceId) {
      void service.setPgmStream(null);
      return;
    }

    void service.setPgmStream(mediaStreams.get(effectivePgmSourceId) ?? null);
  }, [effectivePgmSourceId, isHost, mediaStreams, mediaServiceRef]);

  useEffect(() => {
    if (!isHost) return;
    handleSwitcherBusChange(effectivePgmSourceId, effectivePreviewSourceId);
  }, [effectivePgmSourceId, effectivePreviewSourceId, handleSwitcherBusChange, isHost]);

  useEffect(() => () => {
    if (autoTransitionTimerRef.current) {
      clearTimeout(autoTransitionTimerRef.current);
    }
  }, []);

  const handleSelectProgram = useCallback((id: string) => {
    playHapticFeedback();
    setIsVideoEnabled(true);
    setPgmSourceId(id);
    handleSwitcherBusChange(id, effectivePreviewSourceId);
  }, [effectivePreviewSourceId, handleSwitcherBusChange, playHapticFeedback, setIsVideoEnabled]);

  const handleSelectPreview = useCallback((id: string) => {
    playHapticFeedback();
    setIsVideoEnabled(true);
    setPreviewSourceId(id);
    handleSwitcherBusChange(effectivePgmSourceId, id);
  }, [effectivePgmSourceId, handleSwitcherBusChange, playHapticFeedback, setIsVideoEnabled]);

  const handleCut = useCallback(() => {
    if (!effectivePreviewSourceId) return;
    playHapticFeedback();
    const nextProgram = effectivePreviewSourceId;
    const nextPreview = effectivePgmSourceId;
    setIsVideoEnabled(true);
    setPgmSourceId(nextProgram);
    setPreviewSourceId(nextPreview);
    handleSwitcherBusChange(nextProgram, nextPreview);
    setTransitionProgress(0);
    setIsTransitioning(false);
  }, [effectivePgmSourceId, effectivePreviewSourceId, handleSwitcherBusChange, playHapticFeedback, setIsVideoEnabled]);

  const handleAuto = useCallback(() => {
    if (!effectivePreviewSourceId || isAutoTransitioning || isTransitioning) return;
    playHapticFeedback();
    setIsAutoTransitioning(true);
    setIsTransitioning(true);

    const duration = 500; // 0.5s
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setTransitionProgress(Math.round(progress * 100));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        const nextProgram = effectivePreviewSourceId;
        const nextPreview = effectivePgmSourceId;
        setIsVideoEnabled(true);
        setPgmSourceId(nextProgram);
        setPreviewSourceId(nextPreview);
        handleSwitcherBusChange(nextProgram, nextPreview);
        setIsAutoTransitioning(false);
        setIsTransitioning(false);
        setTransitionProgress(0);
      }
    };

    requestAnimationFrame(animate);
  }, [
    effectivePgmSourceId,
    effectivePreviewSourceId,
    handleSwitcherBusChange,
    isAutoTransitioning,
    isTransitioning,
    playHapticFeedback,
    setIsVideoEnabled,
  ]);

  const handleTBarChange = useCallback((value: number) => {
    if (!effectivePreviewSourceId) return;

    if (value > 0 && value < 100) {
      setIsTransitioning(true);
      setTransitionProgress(value);
    } else if (value === 100) {
      playHapticFeedback();
      const nextProgram = effectivePreviewSourceId;
      const nextPreview = effectivePgmSourceId;
      setIsVideoEnabled(true);
      setPgmSourceId(nextProgram);
      setPreviewSourceId(nextPreview);
      handleSwitcherBusChange(nextProgram, nextPreview);
      setIsTransitioning(false);
      setTransitionProgress(0);
    } else {
      setIsTransitioning(false);
      setTransitionProgress(0);
    }
  }, [effectivePgmSourceId, effectivePreviewSourceId, handleSwitcherBusChange, playHapticFeedback, setIsVideoEnabled]);

  useEffect(() => {
    if (!directorPanelOpen) return;

    const handleCreatorShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable
        || target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.tagName === 'SELECT'
      ) {
        return;
      }

      const sourceIndex = Number(event.key) - 1;
      if (sourceIndex >= 0 && sourceIndex <= 8) {
        const sourceId = Object.keys(clients)[sourceIndex];
        if (!sourceId) return;
        event.preventDefault();
        handleSelectPreview(sourceId);
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        handleCut();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleAuto();
      }
    };

    window.addEventListener('keydown', handleCreatorShortcut);
    return () => window.removeEventListener('keydown', handleCreatorShortcut);
  }, [clients, directorPanelOpen, handleAuto, handleCut, handleSelectPreview]);

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
              className={`hdr-tally-btn ${tallyOpen ? 'active' : ''}`}
              onClick={() => { setDirectorPanelOpen(false); setIsVisualSlate(false); setTallyOpen(v => !v); }}
              aria-label="タリーランプを開く"
              title="TALLY"
            >
              <span 
                className="hdr-tally-dot" 
                style={{ 
                  background: tallyState === 'live' ? '#ff2222' : tallyState === 'preview' ? '#22cc55' : tallyState === 'standby' ? '#ff9900' : '#333' 
                }} 
              />
              TALLY
            </button>
            {isHost && (
              <button
                type="button"
                className="hdr-director-btn"
                onClick={() => { setTallyOpen(false); setIsVisualSlate(false); setDirectorPanelOpen(true); }}
                aria-label="ディレクターパネルを開く"
                title="DIRECTOR"
              >
                DIR
              </button>
            )}
            <button
              type="button"
              className="lang-btn"
              onClick={() => setLang((l) => (l === 'en' ? 'ja' : 'en'))}
              aria-label="Toggle language"
              title="Language"
            >
              {lang === 'en' ? '日本語' : 'EN'}
            </button>
            <button
              type="button"
              className="help-btn"
              onClick={() => setShowGuide(true)}
              aria-label={tr('guide.aria')}
              title={tr('guide.aria')}
            >
              ?
            </button>
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
            <VideoPlayer />

            {p2pRole === 'client' && (
              <ReturnMonitor
                stream={returnStream}
                sourceId={returnFeed.peerId}
                connected={isTallyConnected}
                onOpenFullscreen={() => {
                  setDirectorPanelOpen(false);
                  setIsVisualSlate(false);
                  setTallyOpen(true);
                }}
                pipEnabled={pipEnabled}
                setPipEnabled={setPipEnabled}
              />
            )}

            {p2pRole === 'client' && pipEnabled && returnStream && (
              <FloatingPip stream={returnStream} onClose={() => setPipEnabled(false)} />
            )}

            {syncMode === 'network' && (
              <div className="main-sync-bar">
                <div className="msb-info">
                  <span className="msb-label">{tr('sync.label')}</span>
                  <span className="msb-mode">{tr('sync.network')}</span>
                  {isRunning && driftStatus && driftStatus.hasSync && (
                    <span className="msb-age">{formatSyncAge(driftStatus.msSinceSync)}</span>
                  )}
                </div>
                <button type="button" className="msb-resync" onClick={() => void handleManualResync()} disabled={isResyncing}>
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
                        disabled={isRunning || (syncMode === 'p2p' && p2pRole === 'client')}
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
                    <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => handleOutputModeChange('stereo')}>STEREO TC</button>
                    <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => handleOutputModeChange('mono-l')}>L-TC / R-AUDIO</button>
                  </div>
                </div>

                <div className="control-section">
                  <label className="section-label">TC OFFSET (FRAMES)</label>
                  <div className="offset-control">
                    <input type="range" min="-10" max="10" step="1" value={outputOffset} onChange={(e) => setOutputOffset(parseInt(e.target.value, 10))} disabled={isRunning || (syncMode === 'p2p' && p2pRole === 'client')} />
                    <span className="offset-value">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
                  </div>
                </div>
                {outputMode === 'mono-l' && (
                  <div className="control-section vu-meter-container">
                    <label className="vu-label">MIC INPUT LEVEL {!isRunning && '(START TO MONITOR)'}</label>
                    <VuMeter />
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
                    <div className="drift-rejam">⚠️ {tr('drift.rejam')}</div>
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
                    maxLength={11}
                  />
                </div>
              </div>
            )}

            <ConnectionManager />

            {!isMobile && (
              <div className="control-section">
                <label className="section-label">{tr('label.frameRate')}</label>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '8px' }}>
                  59.94p 撮影時は 29.97 を、50p 撮影時は 25 を選択してください。
                </div>
                <div className="fps-grid-compact">
                  {FPS_OPTIONS.map((opt, i) => (
                    <button 
                      key={opt.label} 
                      className={`btn-pill ${fpsIndex === i ? 'active' : ''}`}
                      onClick={() => setFpsIndex(i)}
                      disabled={isRunning || (syncMode === 'p2p' && p2pRole === 'client')}
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
            <section className="tool-section-shell tool-section-shell-tally">
              <div className="tool-section-head">
                <label className="section-label">{tr('label.tally')}</label>
                <div className="tally-options">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={tallyTorchEnabled}
                      onChange={(e) => setTallyTorchEnabled(e.target.checked)}
                    />
                    <span>Torch LED</span>
                  </label>
                </div>
              </div>
              <div className="control-section tally-section">
                {isHost && (
                  <button
                    className="tally-open-btn btn-director-switcher"
                    onClick={() => { setTallyOpen(false); setIsVisualSlate(false); setDirectorPanelOpen(true); }}
                  >
                    DIRECTOR SWITCHER PANEL
                  </button>
                )}
                <div className="tally-state-row">
                  {(['live', 'preview', 'off'] as TallyState[]).map(s => (
                    <button
                      key={s}
                      className={`tally-state-btn ${manualTally === s ? 'active' : ''}`}
                      style={manualTally === s ? { background: TALLY_COLORS[s], borderColor: TALLY_COLORS[s] } : undefined}
                      onClick={() => handleManualTallyChange(s)}
                    >
                      {tr(tallyLabelKey(s))}
                    </button>
                  ))}
                </div>
                <button className="tally-open-btn" onClick={() => { setDirectorPanelOpen(false); setIsVisualSlate(false); setTallyOpen(true); }}>{tr('tally.fullscreen')}</button>
              </div>
            </section>

            {isHost && Object.keys(clients).length > 0 && (
              <section className="tool-section-shell clients-list-section">
                <div className="tool-section-head">
                  <label className="section-label">CONNECTED CLIENTS ({Object.keys(clients).length})</label>
                </div>
                <div className="clients-grid">
                  {Object.entries(clients).map(([id, stats]) => {
                    const isOffline = nowTick - stats.lastSeen > 30000;
                    return (
                      <div key={id} className={`client-card ${isOffline ? 'offline' : ''}`}>
                        <div className="client-id">{id}</div>
                        <div className="client-stats">
                          <span className="stat">RTT: {stats.rtt.toFixed(0)}ms</span>
                          <span className={`stat ${stats.drift >= 0.5 ? 'drift-warn' : ''}`}>
                            δ: {stats.drift.toFixed(2)}s
                          </span>
                        </div>
                        <div className="client-tally-controls">
                          {(['live', 'preview', 'off'] as TallyState[]).map(s => {
                             const isActive = tallyPayload?.assignments?.[id] === s;
                             return (
                               <button
                                 key={s}
                                 className={`tally-state-btn mini ${isActive ? 'active' : ''}`}
                                 style={isActive ? { background: TALLY_COLORS[s], borderColor: TALLY_COLORS[s] } : undefined}
                                 onClick={() => handleClientTallyChange(id, s)}
                               >
                                 {tr(tallyLabelKey(s))}
                               </button>
                             );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="tool-section-shell tool-section-shell-meta">
              <div className="tools-grid-pro tools-grid-meta">
                <div className="tool-card tool-card-userbits span-2">
                  <label>{tr('label.userBits')}</label>
                  <div className="userbits-row">
                    <input value={userBits} onChange={e => setUserBits(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))} maxLength={8} disabled={autoUserBits} />
                    <button className={`btn-pill ${autoUserBits ? 'active' : ''}`} onClick={() => setAutoUserBits(!autoUserBits)}>{tr('btn.auto')}</button>
                  </div>
                </div>
                <div className="tool-card tool-card-meta">
                  <label>{tr('label.defaultReel')}</label>
                  <input
                    value={defaultReelName}
                    onChange={e => setDefaultReelName(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="A001"
                  />
                </div>
                <div className="tool-card tool-card-meta">
                  <label>{tr('label.defaultScene')}</label>
                  <input
                    value={sceneName}
                    onChange={e => setSceneName(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="001"
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
                        <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => handleOutputModeChange('stereo')}>STEREO TC</button>
                        <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => handleOutputModeChange('mono-l')}>L-TC / R-AUDIO</button>
                      </div>
                    </div>

                    <div className="tool-card span-2">
                      <label className="section-label">TC OFFSET (FRAMES)</label>
                      <div className="offset-control">
                        <input type="range" min="-10" max="10" step="1" value={outputOffset} onChange={(e) => setOutputOffset(parseInt(e.target.value, 10))} disabled={isRunning || (syncMode === 'p2p' && p2pRole === 'client')} />
                        <span className="offset-value">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
                      </div>
                    </div>
                    {outputMode === 'mono-l' && (
                      <div className="tool-card span-2 vu-meter-container">
                        <label className="vu-label">MIC INPUT LEVEL {!isRunning && '(START TO MONITOR)'}</label>
                        <VuMeter />
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
            
            {isMobile && (
              <section className="tool-section-shell tool-section-shell-marks">
                <div className="control-section mobile-marker-section">
                  <label className="section-label">{tr('label.quickMark')}</label>
                  <div className="marker-buttons-grid">
                    <button className="btn-mark-large red" onClick={() => addMarker('Red')}>{tr('color.red')}</button>
                    <button className="btn-mark-large blue" onClick={() => addMarker('Blue')}>{tr('color.blue')}</button>
                    <button className="btn-mark-large green" onClick={() => addMarker('Green')}>{tr('color.green')}</button>
                    <button className="btn-mark-large yellow" onClick={() => addMarker('Yellow')}>{tr('color.yellow')}</button>
                  </div>
                </div>
              </section>
            )}

            <section className="tool-section-shell marker-section-pro">
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
                      <div className="marker-row-top">
                        <div className="marker-row-left">
                          <div className={`color-dot ${m.color.toLowerCase()}`}>{m.color.charAt(0)}</div>
                          <span className="m-tc">{m.tc}</span>
                          <span className="m-take">
                            Sc.{m.sceneName || '001'} Tk.{m.take}
                          </span>
                        </div>
                        <div className="marker-row-right">
                          <span className="m-time">{m.time}</span>
                          <button className="btn-delete-marker" onClick={() => removeMarker(m.id)}>✕</button>
                        </div>
                      </div>
                      <div className="marker-comment-row">
                        <input
                          type="text"
                          className="marker-comment-input"
                          value={m.comment || ''}
                          onChange={(e) => updateMarkerComment(m.id, e.target.value)}
                          placeholder={tr('placeholder.comment')}
                          maxLength={100}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {markerFlash && (
        <div className={`marker-flash ${markerFlash.color.toLowerCase()}`}>
          <span className={`mf-dot ${markerFlash.color.toLowerCase()}`}>{markerFlash.color.charAt(0)}</span>
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
                if (holdStoppedRef.current) { holdStoppedRef.current = false; return; }
                if (!isRunning) void handleStartStop();
              }}
              onPointerDown={() => { if (isRunning) beginStopHold(); }}
              onPointerUp={cancelStopHold}
              onPointerLeave={cancelStopHold}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isPreparing || (syncMode === 'p2p' && p2pRole === 'client')}
            >
              {isRunning && <div className="stop-hold-fill" style={{ width: `${stopHoldPct}%` }} />}
              <div className="btn-icon"></div>
              <div className="btn-text">
                {isRunning ? (stopHoldPct > 0 ? tr('btn.holding') : tr('btn.holdToStop')) : isPreparing ? tr('btn.prep') : isPaused ? tr('btn.resume') : tr('btn.start')}
              </div>
            </button>
            {isRunning && (
              <button 
                className="btn-main-action pause" 
                onClick={handlePause}
                disabled={syncMode === 'p2p' && p2pRole === 'client'}
              >
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

      <Toaster position="top-center" containerStyle={{ zIndex: 10500 }} toastOptions={{ style: { background: '#333', color: '#fff' } }} />

      {tallyOpen && (() => {
        const isConnected = isTallyConnected;
        const uiState = tallyState === 'standby' ? 'preview' : tallyState;
        const stateLabel = tr(tallyLabelKey(uiState));
        const stateSubLabel = tr(`tally.sub.${uiState}`);
        return (
          <div
            className={`tally-overlay tally-${uiState} style-${tallyStyle} border-${tallyBorderSize}`}
            style={tallyStyle === 'full' ? { background: TALLY_COLORS[uiState] } : {}}
          >
            <div className="tally-dimmer" style={{ opacity: tallyDimmerOpacity }} />
            {p2pRole === 'client' && (
              <div className={`tally-conn-banner ${isConnected ? 'connected' : 'disconnected'}`}>
                {isConnected ? tr('tally.conn.ok') : tr('tally.conn.lost')}
              </div>
            )}
            {p2pRole === 'client' && (
              <>
                {returnStream && tallyStyle === 'full' && (
                  <div className="tally-pgm-video-container">
                    <VideoRenderer
                      stream={returnStream}
                      className="tally-pgm-video"
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                )}
                <div className={`tally-return-status ${returnStream ? 'live' : 'waiting'}`}>
                  <span />
                  RETURN {returnStream ? 'LIVE' : 'NO SIGNAL'}
                </div>
              </>
            )}
            <div className="tally-header-slim">
              <span className="tally-header-id">
                {cameraLabels[peerId] || (peerId ? peerId.slice(0, 8) : 'LOCAL')}
              </span>
              <span className="tally-header-battery">
                {batteryLevel !== null ? `${isCharging ? '⚡' : '🔋'} ${Math.round(batteryLevel * 100)}%` : ''}
              </span>
            </div>
            <div className="tally-body">
              <div className={`tally-timecode size-${tallyTcSize}`}>{tallyTime}</div>
              <div className="tally-state-label">{stateLabel}</div>
              <div className="tally-state-sublabel">{stateSubLabel}</div>
            </div>
            <div className="tally-control-bar">
              <button className="tally-ctrl-bar-btn" onClick={(e) => { playHapticFeedback(); handleDimmerCycle(e); }}>
                <span className="tally-ctrl-icon">☀</span>
                <span>{tallyDimmerOpacity === 0 ? tr('tally.dim.bright') : tallyDimmerOpacity === 0.5 ? tr('tally.dim.mid') : tr('tally.dim.dark')}</span>
              </button>
              <button className={`tally-ctrl-bar-btn ${tallyTorchEnabled ? 'active' : ''}`} onClick={(e) => { playHapticFeedback(); handleTorchToggle(e); }}>
                <span className="tally-ctrl-icon">🔦</span>
                <span>TORCH {tallyTorchEnabled ? 'ON' : 'OFF'}</span>
              </button>
              <button className="tally-ctrl-bar-btn" onClick={(e) => {
                e.stopPropagation();
                playHapticFeedback();
                setTallyStyle(prev => prev === 'full' ? 'border' : 'full');
              }}>
                <span className="tally-ctrl-icon">🖼</span>
                <span>STYLE: {tallyStyle.toUpperCase()}</span>
              </button>
              <button className="tally-ctrl-bar-btn" onClick={(e) => {
                e.stopPropagation();
                playHapticFeedback();
                setTallyBorderSize(prev => prev === 'thin' ? 'medium' : prev === 'medium' ? 'thick' : 'thin');
              }}>
                <span className="tally-ctrl-icon">📏</span>
                <span>BORDER: {tallyBorderSize.toUpperCase()}</span>
              </button>
              <button className="tally-ctrl-bar-btn" onClick={(e) => {
                e.stopPropagation();
                playHapticFeedback();
                setTallyTcSize(prev => prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm');
              }}>
                <span className="tally-ctrl-icon">🅰</span>
                <span>TC: {tallyTcSize.toUpperCase()}</span>
              </button>
              <button className="tally-ctrl-bar-btn exit" onClick={(e) => { playHapticFeedback(); handleTallyExit(e); }}>
                <span className="tally-ctrl-icon">✕</span>
                <span>CLOSE</span>
              </button>
            </div>
          </div>
        );
      })()}

      {directorPanelOpen && (() => {
        const clientEntries = Object.entries(clients);
        const camCount = clientEntries.length;
        const liveCount = Object.entries(clients).filter(([id]) => {
          const assignedState = tallyPayload?.assignments?.[id] ?? tallyPayload?.all ?? 'off';
          return (assignedState === 'standby' ? 'preview' : assignedState) === 'live';
        }).length;
        const previewCount = Object.entries(clients).filter(([id]) => {
          const assignedState = tallyPayload?.assignments?.[id] ?? tallyPayload?.all ?? 'off';
          return (assignedState === 'standby' ? 'preview' : assignedState) === 'preview';
        }).length;
        const offlineCount = Object.values(clients).filter((stats) => Date.now() - stats.lastSeen > 30000).length;
        const signalCount = clientEntries.filter(([id]) => mediaStreams.has(id)).length;
        const getSourceLabel = (id: string | null) => {
          if (!id) return 'NONE';
          const sourceIndex = clientEntries.findIndex(([clientId]) => clientId === id);
          return cameraLabels[id] || (sourceIndex >= 0 ? `CAM${sourceIndex + 1}` : id.slice(0, 6));
        };
        const programLabel = getSourceLabel(effectivePgmSourceId);
        const previewLabel = getSourceLabel(effectivePreviewSourceId);
        const programStream = effectivePgmSourceId ? (mediaStreams.get(effectivePgmSourceId) ?? null) : null;
        const previewStream = effectivePreviewSourceId ? (mediaStreams.get(effectivePreviewSourceId) ?? null) : null;
        return (
          <div className="director-tally-overlay atem-chassis creator-switcher apple-director-switcher">
            <div className="director-tally-header apple-director-header">
              <div className="director-title-group">
                <div className="director-title">
                  <span className="creator-live-mark" />
                  DIRECTOR SWITCHER
                  <span className="creator-mode-badge">Creator View</span>
                </div>
                <div className="director-subtitle">カメラを選ぶ <b>→</b> TAKEで切り替え</div>
              </div>
              <div className="director-header-right">
                <div className={`creator-signal-summary ${signalCount > 0 ? 'ready' : ''}`}>
                  <span className="creator-signal-dot" />
                  <div>
                    <small>CAMERAS</small>
                    <strong>{signalCount} / {camCount} READY</strong>
                  </div>
                </div>
                <button
                  className={`dir-video-toggle ${isVideoEnabled ? 'active' : ''}`}
                  onClick={() => { playHapticFeedback(); toggleVideoMonitoring(); }}
                >
                  {isVideoEnabled ? '映像 ON' : '映像 OFF'}
                </button>
                <div className="director-tc-large">{directorTime}</div>
                <button className="director-close-btn" onClick={() => { playHapticFeedback(); setDirectorPanelOpen(false); }} aria-label="Close switcher">×</button>
              </div>
            </div>

            <div className="atem-workspace-layout">
              {/* 左側：マルチビュー（PGM/PVWモニター ＋ 入力カメラプレビューグリッド） */}
              <div className="atem-multiview-board">
                <div className="atem-mv-monitors">
                  {/* PROGRAMモニター */}
                  <div className={`atem-monitor program-monitor ${effectivePgmSourceId ? 'has-source' : ''}`}>
                    <div className="atem-monitor-head">
                      <span><i className="creator-monitor-dot" />ON AIR <small>現在の映像</small></span>
                      <strong className="source-label">{programLabel}</strong>
                    </div>
                    <div className="atem-monitor-screen">
                      {isVideoEnabled && programStream ? (
                        <div className="video-wrapper">
                          <VideoRenderer stream={programStream} muted={true} className="atem-monitor-video" />
                          {isTransitioning && previewStream && (
                            <div className="video-transition-overlay" style={{ opacity: transitionProgress / 100 }}>
                              <VideoRenderer stream={previewStream} muted={true} className="atem-monitor-video" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="atem-monitor-placeholder">
                          <span>{isVideoEnabled ? 'ON AIR未選択' : '映像モニターOFF'}</span>
                          <small>{effectivePgmSourceId ? 'カメラ映像を待っています' : '下のカメラからNEXTを選択してください'}</small>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PREVIEWモニター */}
                  <div className={`atem-monitor preview-monitor ${effectivePreviewSourceId ? 'has-source' : ''}`}>
                    <div className="atem-monitor-head">
                      <span><i className="creator-monitor-dot" />NEXT <small>次に出す映像</small></span>
                      <strong className="source-label">{previewLabel}</strong>
                    </div>
                    <div className="atem-monitor-screen">
                      {isVideoEnabled && previewStream ? (
                        <VideoRenderer stream={previewStream} muted={true} className="atem-monitor-video" />
                      ) : (
                        <div className="atem-monitor-placeholder">
                          <span>{isVideoEnabled ? 'NEXT未選択' : '映像モニターOFF'}</span>
                          <small>{effectivePreviewSourceId ? 'カメラ映像を待っています' : '下のカメラをクリックして選択'}</small>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 入力カメラプレビューグリッド */}
                <div className="creator-camera-section">
                  <div className="creator-section-heading">
                    <div>
                      <small>CAMERA SOURCES</small>
                      <strong>カメラを選ぶ</strong>
                    </div>
                    <span>クリックするとNEXTにセットされます</span>
                  </div>
                  <div className="atem-mv-inputs-grid">
                  {camCount === 0 ? (
                    <div className="director-no-clients">
                      <div className="director-no-clients-icon">＋</div>
                      <div>カメラを接続してください</div>
                      <div className="director-no-clients-sub">クライアントが接続されると、ここに映像が並びます</div>
                    </div>
                  ) : (
                    clientEntries.map(([id, stats], idx) => {
                      const isOffline = Date.now() - stats.lastSeen > 30000;
                      const defaultLabel = `CAM${idx + 1}`;
                      const label = cameraLabels[id] || defaultLabel;
                      
                      const isPgmActive = effectivePgmSourceId === id;
                      const isPvwActive = effectivePreviewSourceId === id;
                      const cardTallyState = isPgmActive ? 'live' : isPvwActive ? 'preview' : 'off';

                      let clientTc: string;
                      const driftSec = stats.drift ?? 0;
                      const driftAbs = Math.abs(driftSec);
                      const isDriftWarning = driftAbs >= 0.03;
                      try {
                        const fps = FPS_OPTIONS[fpsIndex].value;
                        const drop = FPS_OPTIONS[fpsIndex].drop;
                        const tc = Timecode(directorTime, fps, drop);
                        const driftFrames = Math.round(driftSec * fps);
                        tc.add(driftFrames);
                        clientTc = tc.toString();
                      } catch {
                        clientTc = directorTime;
                      }

                      return (
                        <div
                          key={id}
                          className={`atem-mv-card status-${cardTallyState} ${isOffline ? 'offline' : ''}`}
                          onClick={() => !isOffline && handleSelectPreview(id)}
                          title="NEXTに設定"
                        >
                          {isOffline && <div className="director-offline-overlay">OFFLINE</div>}
                          <div className="input-card-state-rail">
                            {isPgmActive && <span className="input-state-badge program">ON AIR</span>}
                            {isPvwActive && <span className="input-state-badge preview">NEXT</span>}
                          </div>
                          <div className="input-card-header">
                            <span className="input-num">{idx + 1}</span>
                            <input
                              className="input-card-label"
                              value={label}
                              onChange={e => setCameraLabels(prev => ({ ...prev, [id]: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              onDoubleClick={e => e.stopPropagation()}
                              placeholder={defaultLabel}
                              maxLength={8}
                            />
                            <div className="input-card-meta">
                              <span className={`input-link-dot ${isOffline ? 'offline' : isDriftWarning ? 'warning' : 'ok'}`} />
                              <span className="stat-rtt">{stats.rtt.toFixed(0)}ms</span>
                            </div>
                          </div>

                          <div className="input-card-video">
                            {isVideoEnabled && mediaStreams.get(id) ? (
                              <VideoRenderer stream={mediaStreams.get(id)!} muted={true} className="dir-cam-video-el" />
                            ) : (
                              <div className="video-placeholder-mini">
                                <span>{isVideoEnabled ? 'NO SIGNAL' : 'OFF'}</span>
                              </div>
                            )}
                            <div className="input-card-video-overlay">
                              <span className="input-card-tc-val">{clientTc}</span>
                              <span className={`input-card-sync-pill ${isOffline ? 'offline' : isDriftWarning ? 'warning' : 'ok'}`}>
                                {isOffline ? 'OFFLINE' : isDriftWarning ? `${driftSec >= 0 ? '+' : ''}${driftSec.toFixed(3)}s` : 'SYNC'}
                              </span>
                            </div>
                          </div>

                          <div className="input-card-footer">
                            <div className="input-card-footer-meta">
                              <span className="input-card-footer-label">STATUS</span>
                              <strong>{isPgmActive ? '配信中' : isPvwActive ? '次に出す' : '待機'}</strong>
                            </div>
                            <div className="input-card-actions" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                className={`input-card-action pvw ${isPvwActive ? 'active' : ''}`}
                                onClick={() => handleSelectPreview(id)}
                                disabled={isOffline}
                              >
                                {isPvwActive ? 'NEXT選択中' : 'NEXTにする'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  </div>
                </div>
              </div>

              {/* 右側：ATEM 筐体型 M/E コントロールパネル */}
              <div className="atem-control-chassis">
                <div className="atem-chassis-panel">
                  <div className="creator-control-header">
                    <div>
                      <small>TAKE CONTROL</small>
                      <strong>映像を切り替える</strong>
                    </div>
                    <span className={effectivePreviewSourceId ? 'ready' : ''}>
                      {effectivePreviewSourceId ? 'READY' : 'NEXTを選択'}
                    </span>
                  </div>

                  <div className="creator-take-flow">
                    <div className="creator-flow-source on-air">
                      <small>ON AIR</small>
                      <strong>{programLabel}</strong>
                    </div>
                    <div className="creator-flow-arrow" aria-hidden="true">→</div>
                    <div className="creator-flow-source next">
                      <small>NEXT</small>
                      <strong>{previewLabel}</strong>
                    </div>
                  </div>

                  <div className="creator-take-actions">
                    <button
                      className="creator-take-button cut"
                      onClick={handleCut}
                      disabled={!effectivePreviewSourceId || isAutoTransitioning}
                    >
                      <span className="creator-action-icon">↯</span>
                      <span>
                        <small>瞬時に切り替え</small>
                        <strong>TAKE</strong>
                      </span>
                      <kbd>SPACE</kbd>
                    </button>
                    <button
                      className={`creator-take-button mix ${isAutoTransitioning ? 'transitioning' : ''}`}
                      onClick={handleAuto}
                      disabled={!effectivePreviewSourceId || isAutoTransitioning}
                    >
                      <span className="creator-action-icon">◐</span>
                      <span>
                        <small>0.5秒でなめらかに</small>
                        <strong>MIX</strong>
                      </span>
                      <kbd>ENTER</kbd>
                    </button>
                  </div>

                  <div className="creator-transition-progress" aria-label={`Transition ${transitionProgress}%`}>
                    <div className="creator-progress-meta">
                      <span>{isAutoTransitioning ? '切り替え中' : 'TRANSITION'}</span>
                      <strong>{transitionProgress}%</strong>
                    </div>
                    <div className="creator-progress-track">
                      <span style={{ width: `${transitionProgress}%` }} />
                    </div>
                  </div>

                  <div className="creator-quick-select">
                    <div className="creator-quick-select-head">
                      <span>QUICK SELECT</span>
                      <small>数字キーでも選択できます</small>
                    </div>
                    <div className="creator-quick-buttons">
                      {clientEntries.length === 0 ? (
                        <span className="creator-no-inputs">カメラ待機中</span>
                      ) : (
                        clientEntries.slice(0, 9).map(([id, stats], idx) => {
                          const isOffline = Date.now() - stats.lastSeen > 30000;
                          const isActive = effectivePreviewSourceId === id;
                          return (
                            <button
                              key={id}
                              className={isActive ? 'active' : ''}
                              onClick={() => handleSelectPreview(id)}
                              disabled={isOffline}
                              aria-label={`${cameraLabels[id] || `CAM${idx + 1}`}をNEXTに設定`}
                            >
                              <kbd>{idx + 1}</kbd>
                              <span>{cameraLabels[id] || `CAM${idx + 1}`}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                  {/* スイッチャーバスボタン列 */}
                  <div className="atem-buses">
                    {/* PROGRAM バス */}
                    <div className="atem-bus-row program-bus">
                      <span className="bus-label">PROGRAM</span>
                      <div className="bus-buttons">
                        {clientEntries.length === 0 ? (
                          <span className="bus-empty">NO INPUTS</span>
                        ) : (
                          clientEntries.map(([id, stats], idx) => {
                            const isOffline = Date.now() - stats.lastSeen > 30000;
                            const isActive = effectivePgmSourceId === id;
                            return (
                              <button
                                key={id}
                                className={`atem-btn btn-pgm ${isActive ? 'lit' : ''}`}
                                onClick={() => handleSelectProgram(id)}
                                disabled={isOffline}
                              >
                                <span className="btn-num">{idx + 1}</span>
                                <span className="btn-label">{cameraLabels[id] || `CAM${idx + 1}`}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* PREVIEW バス */}
                    <div className="atem-bus-row preview-bus">
                      <span className="bus-label">PREVIEW</span>
                      <div className="bus-buttons">
                        {clientEntries.length === 0 ? (
                          <span className="bus-empty">NO INPUTS</span>
                        ) : (
                          clientEntries.map(([id, stats], idx) => {
                            const isOffline = Date.now() - stats.lastSeen > 30000;
                            const isActive = effectivePreviewSourceId === id;
                            return (
                              <button
                                key={id}
                                className={`atem-btn btn-pvw ${isActive ? 'lit' : ''}`}
                                onClick={() => handleSelectPreview(id)}
                                disabled={isOffline}
                              >
                                <span className="btn-num">{idx + 1}</span>
                                <span className="btn-label">{cameraLabels[id] || `CAM${idx + 1}`}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* トランジションブロック（CUT, AUTO, Tバー） */}
                  <div className="atem-transition-block">
                    <div className="tbar-chassis">
                      <div className="tbar-track">
                        <div className="tbar-fill" style={{ height: `${transitionProgress}%` }} />
                        <input
                          type="range"
                          className="tbar-slider-input"
                          min="0"
                          max="100"
                          value={transitionProgress}
                          onChange={(e) => handleTBarChange(Number(e.target.value))}
                        />
                        <div className="tbar-handle" style={{ bottom: `calc(${transitionProgress}% - 8px)` }}>
                          <div className="handle-grip" />
                        </div>
                      </div>
                      <div className="tbar-status">
                        <span>MIX</span>
                        <strong className="tbar-pct">{transitionProgress}%</strong>
                      </div>
                    </div>

                    <div className="transition-actions">
                      <button
                        className="atem-btn-ctrl btn-cut"
                        onClick={handleCut}
                        disabled={!effectivePreviewSourceId || isAutoTransitioning}
                      >
                        CUT
                      </button>
                      <button
                        className={`atem-btn-ctrl btn-auto ${isAutoTransitioning ? 'transitioning' : ''}`}
                        onClick={handleAuto}
                        disabled={!effectivePreviewSourceId || isAutoTransitioning}
                      >
                        AUTO
                      </button>
                    </div>
                  </div>
                </div>

                {/* ステータスストリップとログをパネル下部に綺麗に配置 */}
                <div className="atem-panel-footer">
                  <div className="atem-status-strip">
                    <span><small>ON AIR</small>{programLabel}</span>
                    <span><small>NEXT</small>{previewLabel}</span>
                    <span><small>CAMERAS</small>{liveCount} LIVE / {previewCount} NEXT</span>
                    <span className={offlineCount > 0 ? 'warn' : ''}><small>OFFLINE</small>{offlineCount}</span>
                    <span className={effectivePgmSourceId ? 'online' : 'warn'}><small>RETURN</small>{effectivePgmSourceId ? '送出中' : '待機'}</span>
                  </div>

                  {tallyActionLog.length > 0 && (
                    <div className="director-log">
                      <div className="director-log-title">{tr('director.actionLog')}</div>
                      <div className="director-log-scroll">
                        {tallyActionLog.map((entry, i) => (
                          <div key={i} className="director-log-row">
                            <span className={`director-log-state state-text-${entry.state === 'live' ? 'live' : entry.state === 'preview' ? 'preview' : 'off'}`}>
                              {tr(tallyLabelKey(entry.state as TallyState))}
                            </span>
                            <span className="director-log-cam">{entry.cam}</span>
                            <span className="director-log-tc">{entry.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {isVisualSlate && (
        <div className={`visual-slate-overlay ${isSlateFlashing ? 'flashing' : ''}`}>
          <div className="slate-tap-area" onClick={handleSlateClick} />
          <div className="slate-content">
            <div className="slate-tc">{slateTime}</div>
            <div className="slate-metadata-row">
              <div>REEL: {defaultReelName}</div>
              <div>SCENE: {sceneName}</div>
              <div>TAKE: {markers.length > 0 ? Math.max(...markers.map(m => m.take || 0)) + 1 : 1}</div>
            </div>
            <div className="slate-info">
              {FPS_OPTIONS[fpsIndex].label} FPS | UBIT: {userBits}
            </div>
            <div className="slate-qr">
              <QRCodeCanvas value={slateTime} size={256} level="L" includeMargin={true} />
            </div>
            <div className="slate-close">{tr('slate.close')}</div>
          </div>
          <button 
            className="slate-close-btn"
            onClick={(e) => { e.stopPropagation(); setIsVisualSlate(false); }}
            aria-label="Close Slate"
          >
            ×
          </button>
        </div>
      )}

      {showGuide && (
        <div className="guide-overlay" onClick={() => setShowGuide(false)}>
          <div className="guide-card" onClick={(e) => e.stopPropagation()}>
            <div className="guide-head">
              <span className="guide-title">{tr('guide.title')}</span>
              <button type="button" className="guide-x" onClick={() => setShowGuide(false)} aria-label="Close">✕</button>
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

export default function App() {
  return (
    <LTCSyncProvider>
      <MainApp />
    </LTCSyncProvider>
  );
}
