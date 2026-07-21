import { useCallback, useEffect, useRef, useState } from 'react';
import { LTCSyncProvider, useLTC } from './LTCSyncContext';
import { FPS_OPTIONS } from './constants';
import { VideoPlayer } from './VideoPlayer';
import { ConnectionManager } from './ConnectionManager';
import { tallyLabelKey, TALLY_COLORS } from './utils/tally';
import type { TallyState } from './utils/tally';
import type { SyncMode } from './LTCSyncContext';
import { formatSyncAge } from './utils/DriftMonitor';
import { Toaster, toast } from 'react-hot-toast';
import { ReturnMonitor } from './components/ReturnMonitor';
import { DirectorPanel } from './components/DirectorPanel';
import { TallyOverlay } from './components/TallyOverlay';
import { VisualSlate } from './components/VisualSlate';
import { GuideOverlay } from './components/GuideOverlay';
import { useMediaStreams } from './hooks/useMediaStreams';
import { FloatingPip } from './components/FloatingPip';
import { HeaderBar } from './components/HeaderBar';
import { FooterControls } from './components/FooterControls';
import { MarkerList } from './components/MarkerList';
import { ClientList } from './components/ClientList';
import { getAutoSwitcherAssignment, resolveReturnFeed } from './utils/switcherRouting';
import './App.css';

function MainApp() {
  const {
    isRunning,
    fpsIndex,
    setFpsIndex,
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
    cameraLabels,
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
    setIsVideoEnabled,
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

  return (
    <div className={`app-container pro-theme ${isMobile ? 'mobile-view' : 'desktop-view'} ${isRunning ? 'is-recording' : ''}`}>
      <HeaderBar
        isRunning={isRunning}
        isPreparing={isPreparing}
        syncMode={syncMode}
        fpsIndex={fpsIndex}
        batteryLevel={batteryLevel}
        isCharging={isCharging}
        batteryEta={batteryEta}
        tallyOpen={tallyOpen}
        tallyState={tallyState}
        isHost={isHost}
        lang={lang}
        setLang={setLang}
        setShowGuide={setShowGuide}
        setDirectorPanelOpen={setDirectorPanelOpen}
        setIsVisualSlate={setIsVisualSlate}
        setTallyOpen={setTallyOpen}
        tr={tr}
      />

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

                  </>
                )}
              </div>
            </section>
            
            <MarkerList
              markers={markers}
              addMarker={addMarker}
              removeMarker={removeMarker}
              updateMarkerComment={updateMarkerComment}
              exportToEDL={exportToEDL}
              exportToALE={exportToALE}
              isMobile={isMobile}
              tr={tr}
            />

            {isHost && Object.keys(clients).length > 0 && (
              <ClientList
                clients={clients}
                nowTick={nowTick}
                tallyPayload={tallyPayload}
                isHost={isHost}
                tr={tr}
                handleClientTallyChange={handleClientTallyChange}
              />
            )}
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

      <FooterControls
        isRunning={isRunning}
        isPreparing={isPreparing}
        isPaused={isPaused}
        stopHoldPct={stopHoldPct}
        holdStoppedRef={holdStoppedRef}
        handleStartStop={handleStartStop}
        beginStopHold={beginStopHold}
        cancelStopHold={cancelStopHold}
        handlePause={handlePause}
        addMarker={addMarker}
        syncMode={syncMode}
        p2pRole={p2pRole}
        tr={tr}
      />

      <Toaster position="top-center" containerStyle={{ zIndex: 10500 }} toastOptions={{ style: { background: '#333', color: '#fff' } }} />

      {tallyOpen && (
        <TallyOverlay
          tallyState={tallyState}
          tallyTime={tallyTime}
          tallyDimmerOpacity={tallyDimmerOpacity}
          tallyTcSize={tallyTcSize}
          tallyStyle={tallyStyle}
          tallyBorderSize={tallyBorderSize}
          isTallyConnected={isTallyConnected}
          p2pRole={p2pRole}
          returnStream={returnStream}
          peerId={peerId}
          cameraLabels={cameraLabels}
          batteryLevel={batteryLevel}
          isCharging={isCharging}
          tr={tr}
          playHapticFeedback={playHapticFeedback}
          handleDimmerCycle={handleDimmerCycle}
          handleTorchToggle={handleTorchToggle}
          handleTallyExit={handleTallyExit}
          setTallyStyle={setTallyStyle}
          setTallyBorderSize={setTallyBorderSize}
          setTallyTcSize={setTallyTcSize}
          tallyTorchEnabled={tallyTorchEnabled}
        />
      )}

      {directorPanelOpen && (
        <DirectorPanel
          effectivePgmSourceId={effectivePgmSourceId}
          effectivePreviewSourceId={effectivePreviewSourceId}
          isTransitioning={isTransitioning}
          transitionProgress={transitionProgress}
          isAutoTransitioning={isAutoTransitioning}
          handleSelectPreview={handleSelectPreview}
          handleSelectProgram={handleSelectProgram}
          handleCut={handleCut}
          handleAuto={handleAuto}
          handleTBarChange={handleTBarChange}
        />
      )}

      {isVisualSlate && (
        <VisualSlate
          slateTime={slateTime}
          isSlateFlashing={isSlateFlashing}
          handleSlateClick={handleSlateClick}
          defaultReelName={defaultReelName}
          sceneName={sceneName}
          markers={markers}
          fpsIndex={fpsIndex}
          userBits={userBits}
          tr={tr}
          setIsVisualSlate={setIsVisualSlate}
        />
      )}

      <GuideOverlay showGuide={showGuide} setShowGuide={setShowGuide} tr={tr} />
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
