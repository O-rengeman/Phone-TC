import { useState } from 'react';
import { useLTC } from '../../LTCSyncContext';
import { FPS_OPTIONS } from '../../constants';
import { formatSyncAge } from '../../utils/DriftMonitor';
import { VideoPlayer } from '../../VideoPlayer';
import { VuMeter } from '../VuMeter';
import { HelpButton } from '../HelpButton';
import './mainPane.css';

type MainPaneView = 'tc' | 'controls';

interface MobileMainPaneProps {
  /**
   * App.tsx's handleOutputModeChange, passed through unchanged so the
   * mono-L headphone toast and the isRunning guard stay in exactly one
   * place.
   */
  onOutputModeChange: (mode: 'stereo' | 'mono-l') => void;
}

/**
 * Mobile MAIN tab, split into two switchable views so the pane never
 * scrolls (neither page scroll nor an inner scroll region is allowed on
 * the mobile shell):
 *
 * - TIMECODE keeps the hero TC card, the network sync strip and — only
 *   while a mono-L send is live — the input VU meter. The TC card lives
 *   in a `minmax(0, 1fr)` grid row and the canvas auto-fits its own rect,
 *   so the view fills the pane exactly on every viewport.
 * - CONTROL groups the three settings that used to sit under the TC card
 *   and pushed it off-screen on a 320x568 portrait phone: FPS grid,
 *   output mode, TC offset.
 *
 * The switch is local state — `activeTab` in LTCSyncContext stays
 * 'main' | 'sync' | 'tools' per the shared contract, and this file only
 * adds the v3-scoped selectors in mainPane.css (desktop-view is never
 * matched).
 */
export function MobileMainPane({ onOutputModeChange }: MobileMainPaneProps) {
  const [view, setView] = useState<MainPaneView>('tc');
  const {
    isRunning,
    fpsIndex,
    setFpsIndex,
    syncMode,
    p2pRole,
    outputMode,
    outputOffset,
    setOutputOffset,
    driftStatus,
    isResyncing,
    handleManualResync,
    tr,
  } = useLTC();

  return (
    <div className="mobile-pane main-pane-v3">
      <div className="mobile-pane-tabs" role="tablist" aria-label={tr('tab.main')}>
        <button
          type="button"
          role="tab"
          className={`mobile-pane-tab${view === 'tc' ? ' active' : ''}`}
          aria-selected={view === 'tc'}
          aria-current={view === 'tc' ? 'page' : undefined}
          onClick={() => setView('tc')}
        >
          {tr('dtab.timecode')}
        </button>
        <button
          type="button"
          role="tab"
          className={`mobile-pane-tab${view === 'controls' ? ' active' : ''}`}
          aria-selected={view === 'controls'}
          aria-current={view === 'controls' ? 'page' : undefined}
          onClick={() => setView('controls')}
        >
          {tr('dt.control')}
        </button>
      </div>

      <div className="mobile-pane-body">
        {view === 'tc' ? (
          <div className="mobile-pane-view tc-view-v3">
            <VideoPlayer />

            {syncMode === 'network' && (
              <div className="main-sync-bar main-sync-bar-v2">
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

            {/* Mono-L routes the mic into the output, so the input level and
                clip badge matter exactly while it is running — same rule as
                the old output-mode section, now pinned to the timecode view
                where it is always visible while sending. */}
            {isRunning && outputMode === 'mono-l' && <VuMeter />}
          </div>
        ) : (
          <div className="mobile-pane-view controls-view-v3">
            <div className="control-section control-section-v2 cs-fps-v3">
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

            <div className="control-section control-section-v2 cs-output-v3">
              <label className="section-label">{tr('label.outputMode')}</label>
              <div className="sync-toggle-pro">
                <button className={outputMode === 'stereo' ? 'active' : ''} onClick={() => onOutputModeChange('stereo')} disabled={isRunning}>{tr('out.stereoTc')}</button>
                <button className={outputMode === 'mono-l' ? 'active' : ''} onClick={() => onOutputModeChange('mono-l')} disabled={isRunning}>{tr('out.ltcRaudio')}</button>
              </div>
            </div>

            <div className="control-section control-section-v2 cs-offset-v3">
              <label className="section-label">{tr('cm.tcOffset')}</label>
              <div className="offset-control">
                <input type="range" min="-10" max="10" step="1" value={outputOffset} onChange={(e) => setOutputOffset(parseInt(e.target.value, 10))} disabled={isRunning || (syncMode === 'p2p' && p2pRole === 'client')} aria-label={tr('cm.tcOffset')} />
                <span className="offset-value">{outputOffset > 0 ? '+' : ''}{outputOffset}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
