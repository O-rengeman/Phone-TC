import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { LTCSyncProvider, useLTC } from './LTCSyncContext';
import { FPS_OPTIONS } from './constants';
import { VideoPlayer } from './VideoPlayer';
import { ConnectionManager } from './ConnectionManager';
import type { SyncMode } from './LTCSyncContext';
import { formatSyncAge } from './utils/DriftMonitor';
import { Toaster, toast } from 'react-hot-toast';
import { GuideOverlay } from './components/GuideOverlay';
import { HeaderBar } from './components/HeaderBar';
import { HelpButton } from './components/HelpButton';
import { FooterControls } from './components/FooterControls';
import { MarkerList } from './components/MarkerList';
import { ClientList } from './components/ClientList';
import { PresetsPanel } from './components/PresetsPanel';
import { PwaRegister } from './components/PwaRegister';
import { LivePreflightScreen } from './components/PreflightScreen';
import './App.css';

const DesktopShell = lazy(() => import('./components/desktop/DesktopShell').then(m => ({ default: m.DesktopShell })));
const VisualSlate = lazy(() => import('./components/VisualSlate').then(m => ({ default: m.VisualSlate })));

function MainApp() {
  const [showPreflight, setShowPreflight] = useState(false);
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
    userBits,
    setUserBits,
    markers,
    defaultReelName,
    setDefaultReelName,
    outputOffset,
    setOutputOffset,
    isHost,
    driftStatus,
    isPaused,
    stopHoldPct,
    showGuide,
    setShowGuide,
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
    addMarker,
    removeMarker,
    updateMarkerComment,
    exportToEDL,
    exportToALE,
    exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO,
    recallTimecode,
    handleSlateClick,
    handleStartStop,
    handlePause,
    beginStopHold,
    cancelStopHold,
    handleManualResync,
    holdStoppedRef,
    engineRef,
    currentTcRef,
  } = useLTC();

  // Live TC for the marker-timeline playhead — same source VideoPlayer uses:
  // the worklet-fed ref while running, the engine's TC while idle.
  const getCurrentTc = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return '';
    return isRunning ? currentTcRef.current : engine.getTimecodeString();
  }, [isRunning, engineRef, currentTcRef]);

  const handleOutputModeChange = (mode: 'stereo' | 'mono-l') => {
    setOutputMode(mode);
    if (mode === 'mono-l') {
      toast(`⚠️ ${tr('toast.headphonesRequired')}`, {
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

  return (
    <div className={`app-container pro-theme ${isMobile ? 'mobile-view' : 'desktop-view'} ${isRunning ? 'is-recording' : ''}`}>
      <PwaRegister />
      <HeaderBar
        isRunning={isRunning}
        isPreparing={isPreparing}
        syncMode={syncMode}
        fpsIndex={fpsIndex}
        batteryLevel={batteryLevel}
        isCharging={isCharging}
        batteryEta={batteryEta}
        lang={lang}
        setLang={setLang}
        setShowGuide={setShowGuide}
        tr={tr}
        onOpenPreflight={() => setShowPreflight(true)}
      />

      {isMobile && (
        <nav className="tab-bar">
          <button className={activeTab === 'main' ? 'active' : ''} onClick={() => setActiveTab('main')}>{tr('tab.main')}</button>
          <button className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')}>{tr('tab.sync')}</button>
          <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>{tr('tab.tools')}</button>
        </nav>
      )}

      {!isMobile && (
        <Suspense fallback={<div className="desktop-view-placeholder" style={{ minHeight: '100vh', background: '#0a0a0c' }} />}>
          <DesktopShell onOutputModeChange={handleOutputModeChange} />
        </Suspense>
      )}

      {isMobile && (
      <main className="tab-content">
        {activeTab === 'main' && (
          <div className="tab-pane main-pane">
            <VideoPlayer />

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

            <div className="control-section">
              <label className="section-label">
                {tr('label.frameRate')}
                <HelpButton topic="timecode" tr={tr} variant="inline" />
              </label>
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
                <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => handleOutputModeChange('stereo')}>{tr('out.stereoTc')}</button>
                <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => handleOutputModeChange('mono-l')}>{tr('out.ltcRaudio')}</button>
              </div>
            </div>

            <div className="control-section">
              <label className="section-label">{tr('cm.tcOffset')}</label>
              <div className="offset-control">
                <input type="range" min="-10" max="10" step="1" value={outputOffset} onChange={(e) => setOutputOffset(parseInt(e.target.value, 10))} disabled={isRunning || (syncMode === 'p2p' && p2pRole === 'client')} />
                <span className="offset-value">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="tab-pane sync-pane">
            <div className="control-section">
              <label className="section-label">
                {tr('label.syncMethod')}
                <HelpButton topic="sync" tr={tr} variant="inline" />
              </label>
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
                <div className="sync-detail">{tr('cm.latencyOffset', { latency: syncStatus.latency.toFixed(1), offset: syncStatus.offset.toFixed(1) })}</div>
              )}
              {syncMode === 'network' && isRunning && driftStatus && driftStatus.hasSync && (
                <div className="drift-panel">
                  <div className="drift-row">
                    <span>{tr('drift.lastSync')}</span>
                    <span>{formatSyncAge(driftStatus.msSinceSync)} {tr('drift.ago')}</span>
                  </div>
                  {driftStatus.rejamRecommended && (
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
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="tab-pane tools-pane">
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
              </div>
            </section>

            <PresetsPanel />

            <MarkerList
              markers={markers}
              addMarker={addMarker}
              removeMarker={removeMarker}
              updateMarkerComment={updateMarkerComment}
              exportToEDL={exportToEDL}
              exportToALE={exportToALE}
              exportToFCPXML={exportToFCPXML}
              exportToResolve={exportToResolve}
              exportToCSV={exportToCSV}
              exportToOTIO={exportToOTIO}
              recallTimecode={recallTimecode}
              fpsIndex={fpsIndex}
              getCurrentTc={getCurrentTc}
              isMobile={isMobile}
              tr={tr}
            />

            <ClientList
              clients={clients}
              nowTick={nowTick}
              isHost={isHost}
              tr={tr}
            />
          </div>
        )}
      </main>
      )}

      {markerFlash && (
        <div className={`marker-flash ${markerFlash.color.toLowerCase()}`}>
          <span className={`mf-dot ${markerFlash.color.toLowerCase()}`}>{markerFlash.color.charAt(0)}</span>
          <span className="mf-text">{tr('marker.flash', { tc: markerFlash.tc })}</span>
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

      {isVisualSlate && (
        <Suspense fallback={null}>
          <VisualSlate
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
        </Suspense>
      )}

      <GuideOverlay showGuide={showGuide} setShowGuide={setShowGuide} tr={tr} />
      {showPreflight && <LivePreflightScreen onClose={() => setShowPreflight(false)} />}
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
