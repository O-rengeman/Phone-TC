import { useCallback, useState } from 'react';
import { useLTC } from '../../LTCSyncContext';
import { MarkerList } from '../MarkerList';
import { ClientList } from '../ClientList';
import { PresetsPanel } from '../PresetsPanel';
import './toolsPane.css';

/**
 * MobileToolsPane — the no-scroll mobile TOOLS tab.
 *
 * The old tools pane stacked metadata cards, presets, the marker log and the
 * client list in one scrollable column. On a 320x568 phone that meant every
 * control below the fold was unreachable without scrolling, so the pane is
 * split into local sections behind `.mobile-pane-tabs`:
 *
 *   MARK    → quick-mark buttons + the marker timeline
 *   TAKES   → export chips + paged marker rows (2/page, MobilePager)
 *   PRESETS → paged preset list (2/page)
 *   META    → USER BITS / REEL / SCENE cards
 *   CAMERAS → paged client cards (4/page) — only while hosting with clients
 *
 * Long lists page instead of scrolling; the section state is local (the
 * context's activeTab stays 'main' | 'sync' | 'tools').
 */

type ToolsSection = 'marks' | 'takes' | 'presets' | 'meta' | 'clients';

const SECTION_TABS: ReadonlyArray<{ id: ToolsSection; labelKey: string }> = [
  { id: 'marks', labelKey: 'btn.mark' },
  { id: 'takes', labelKey: 'dtab.markers' },
  { id: 'presets', labelKey: 'preset.title' },
  { id: 'meta', labelKey: 'dt.metadata' },
  { id: 'clients', labelKey: 'dt.clients' },
];

export function MobileToolsPane() {
  const {
    isRunning,
    isMobile,
    fpsIndex,
    userBits,
    setUserBits,
    autoUserBits,
    setAutoUserBits,
    defaultReelName,
    setDefaultReelName,
    sceneName,
    setSceneName,
    markers,
    isHost,
    clients,
    nowTick,
    tr,
    addMarker,
    removeMarker,
    updateMarkerComment,
    exportToEDL,
    exportToALE,
    exportToFCPXML,
    exportToResolve,
    exportToCSV,
    exportToOTIO,
    recallTimecode,
    engineRef,
    currentTcRef,
    requestBackupRestore,
  } = useLTC();

  const [requestedSection, setRequestedSection] = useState<ToolsSection>('marks');

  // The CAMERAS section only exists while the session is hosting clients;
  // when the last client drops the visible section falls back to MARK so the
  // pane never shows a dead tab selection (derived, no state write needed).
  const showClients = isHost && Object.keys(clients).length > 0;
  const section: ToolsSection =
    requestedSection === 'clients' && !showClients ? 'marks' : requestedSection;

  // Live TC for the marker-timeline playhead — same source App.tsx used:
  // the worklet-fed ref while running, the engine's TC while idle.
  const getCurrentTc = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return '';
    return isRunning ? currentTcRef.current : engine.getTimecodeString();
  }, [isRunning, engineRef, currentTcRef]);

  const markerListProps = {
    markers,
    addMarker,
    removeMarker,
    updateMarkerComment,
    exportToEDL,
    exportToALE,
    exportToFCPXML,
    exportToResolve,
    exportToCSV,
    exportToOTIO,
    recallTimecode,
    fpsIndex,
    getCurrentTc,
    isMobile,
    tr,
  };

  return (
    <div className="tab-pane tools-pane mobile-pane tools-pane-v3">
      <nav className="mobile-pane-tabs" role="tablist" aria-label={tr('tab.tools')}>
        {SECTION_TABS.filter((tab) => tab.id !== 'clients' || showClients).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            className={`mobile-pane-tab${section === tab.id ? ' active' : ''}`}
            onClick={() => setRequestedSection(tab.id)}
          >
            {tr(tab.labelKey)}
          </button>
        ))}
      </nav>

      <div className="mobile-pane-body">
        {section === 'marks' && (
          <div className="mobile-pane-view tools-view-marks" role="tabpanel">
            <MarkerList {...markerListProps} mobileView="marks" />
          </div>
        )}

        {section === 'takes' && (
          <div className="mobile-pane-view tools-view-takes" role="tabpanel">
            <MarkerList {...markerListProps} mobileView="log" />
            <div style={{ padding: '8px 12px' }}>
              <button type="button" onClick={requestBackupRestore}>{tr('backup.restoreButton')}</button>
            </div>
          </div>
        )}

        {section === 'presets' && (
          <div className="mobile-pane-view tools-view-presets" role="tabpanel">
            <PresetsPanel />
          </div>
        )}

        {section === 'meta' && (
          <div className="mobile-pane-view tools-view-meta" role="tabpanel">
            <section className="tool-section-shell tool-section-shell-meta tool-section-shell-meta-v2">
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
          </div>
        )}

        {section === 'clients' && showClients && (
          <div className="mobile-pane-view tools-view-clients" role="tabpanel">
            <ClientList
              clients={clients}
              nowTick={nowTick}
              isHost={isHost}
              mobilePaged
              tr={tr}
            />
          </div>
        )}
      </div>
    </div>
  );
}
