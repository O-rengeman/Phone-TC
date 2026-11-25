import { useEffect, useState, lazy, Suspense } from 'react';
import { LTCSyncProvider, useLTC } from './LTCSyncContext';
import { Toaster, toast } from 'react-hot-toast';
import { GuideOverlay } from './components/GuideOverlay';
import { HeaderBar } from './components/HeaderBar';
import { FooterControls } from './components/FooterControls';
import { PwaRegister } from './components/PwaRegister';
import { LivePreflightScreen } from './components/PreflightScreen';
import { MobileMainPane } from './components/mobile/MainPane';
import { MobileSyncPane } from './components/mobile/SyncPane';
import { MobileToolsPane } from './components/mobile/ToolsPane';
import './App.css';
import './mobile-shell.css';

const DesktopShell = lazy(() => import('./components/desktop/DesktopShell').then(m => ({ default: m.DesktopShell })));
const VisualSlate = lazy(() => import('./components/VisualSlate').then(m => ({ default: m.VisualSlate })));

function MainApp() {
  const [showPreflight, setShowPreflight] = useState(false);
  const {
    isRunning,
    fpsIndex,
    syncMode,
    isPreparing,
    p2pRole,
    activeTab,
    setActiveTab,
    isMobile,
    setOutputMode,
    isSlateFlashing,
    isVisualSlate,
    setIsVisualSlate,
    userBits,
    markers,
    backupRestore,
    restoreFromBackup,
    dismissBackupRestore,
    defaultReelName,
    isPaused,
    stopHoldPct,
    showGuide,
    setShowGuide,
    lang,
    setLang,
    batteryLevel,
    isCharging,
    batteryEta,
    markerFlash,
    sceneName,
    tr,
    addMarker,
    handleSlateClick,
    handleStartStop,
    handlePause,
    beginStopHold,
    cancelStopHold,
    holdStoppedRef,
  } = useLTC();

  const handleOutputModeChange = (mode: 'stereo' | 'mono-l') => {
    // Output routing is fixed for the session: mono-L acquires the mic stream
    // only at engine start, so switching mid-run would produce silence and a
    // dead VU meter. Buttons are also disabled while running.
    if (isRunning) return;
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
    <div className={`app-container ${isMobile ? 'mobile-view mobile-shell-v2 mobile-noscroll' : 'desktop-view'} ${isRunning ? 'is-recording' : ''}`}>
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
        isMobile={isMobile}
        onOpenPreflight={() => setShowPreflight(true)}
      />

      {isMobile && (
        <nav className="tab-bar tab-bar-v2" aria-label={tr('tab.aria')}>
          <button className={activeTab === 'main' ? 'active' : ''} onClick={() => setActiveTab('main')} aria-current={activeTab === 'main' ? 'page' : undefined}>{tr('tab.main')}</button>
          <button className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')} aria-current={activeTab === 'sync' ? 'page' : undefined}>{tr('tab.sync')}</button>
          <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')} aria-current={activeTab === 'tools' ? 'page' : undefined}>{tr('tab.tools')}</button>
        </nav>
      )}

      {!isMobile && (
        <Suspense fallback={<div className="desktop-view-placeholder" style={{ minHeight: '100vh', background: '#0a0a0c' }} />}>
          <DesktopShell onOutputModeChange={handleOutputModeChange} />
        </Suspense>
      )}

      {isMobile && (
      <main className="tab-content tab-content-v3">
        {/* The pane bodies are owned by the mobile-panes packages; this shell
            only switches them on activeTab. `tab-content` is kept for the
            legacy selectors, `tab-content-v3` fixes it to a no-scroll flex
            region (see mobile-shell.css). */}
        {activeTab === 'main' && <MobileMainPane onOutputModeChange={handleOutputModeChange} />}
        {activeTab === 'sync' && <MobileSyncPane />}
        {activeTab === 'tools' && <MobileToolsPane />}
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
        isMobile={isMobile}
        tr={tr}
      />

      <Toaster position="top-center" containerStyle={{ zIndex: 10500 }} toastOptions={{ style: { background: '#333', color: '#fff' } }} />

      {backupRestore && (
        <div style={{ position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)', zIndex: 10600, background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '10px', padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '92vw', boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}>
          <span style={{ fontSize: '13px', lineHeight: 1.5 }}>{tr('backup.restorePrompt', { count: backupRestore.count })}</span>
          <button onClick={restoreFromBackup} style={{ whiteSpace: 'nowrap' }}>{tr('backup.restore')}</button>
          <button onClick={dismissBackupRestore} style={{ whiteSpace: 'nowrap' }}>{tr('backup.dismiss')}</button>
        </div>
      )}

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

      <GuideOverlay showGuide={showGuide} setShowGuide={setShowGuide} tr={tr} isMobile={isMobile} />
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
