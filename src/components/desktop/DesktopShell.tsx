import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLTC } from '../../LTCSyncContext';
import { VideoPlayer } from '../../VideoPlayer';
import { formatSyncAge } from '../../utils/DriftMonitor';
import {
  DESKTOP_TAB_STORAGE_KEY,
  desktopTabForHotkey,
  resolveDesktopTab,
  visibleDesktopTabs,
} from '../../utils/desktopTabs';
import type { DesktopTabId } from '../../utils/desktopTabs';
import { TimecodePane } from './TimecodePane';
import { SyncPane } from './SyncPane';
import { SwitcherPane } from './SwitcherPane';
import type { SwitcherControls } from './SwitcherPane';
import { TallyPane } from './TallyPane';
import { MarkersPane } from './MarkersPane';
import '../../desktop.css';

interface DesktopShellProps {
  switcher: SwitcherControls;
  onOutputModeChange: (mode: 'stereo' | 'mono-l') => void;
}

function readStoredTab(): string | null {
  try {
    return localStorage.getItem(DESKTOP_TAB_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The desktop console: a fixed frame sized to the viewport, with the timecode
 * and transport permanently on screen and the rest of the controls behind
 * tabs.
 *
 * The frame is a three-row grid (readout / tabs / pane) whose middle row is
 * the only flexible one, and every row is `min-height: 0`. That is what makes
 * the "never scrolls" rule structural rather than a matter of tuning
 * paddings: a pane physically cannot push the layout taller than the window,
 * so overflow is contained inside whichever panel opted into it.
 */
export function DesktopShell({ switcher, onOutputModeChange }: DesktopShellProps) {
  const {
    isHost, isRunning, isPreparing, syncMode, driftStatus, p2pRole,
    peerId, p2pStatus, masterDrift, clients, nowTick,
    tr,
  } = useLTC();

  const [requestedTab, setRequestedTab] = useState<string | null>(readStoredTab);
  const activeTab = resolveDesktopTab(requestedTab, isHost);
  const tabs = useMemo(() => visibleDesktopTabs(isHost), [isHost]);

  const selectTab = useCallback((tab: DesktopTabId) => {
    setRequestedTab(tab);
    try {
      localStorage.setItem(DESKTOP_TAB_STORAGE_KEY, tab);
    } catch { /* storage unavailable — the tab still switches for this session */ }
  }, []);

  // Alt+<digit> jumps between tabs. Alt keeps this clear of the switcher's own
  // bare-digit shortcuts for selecting a camera.
  useEffect(() => {
    const handleHotkey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      const tab = desktopTabForHotkey(event.key, isHost);
      if (!tab) return;
      event.preventDefault();
      selectTab(tab);
    };

    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  }, [isHost, selectTab]);

  const onlineCount = Object.values(clients).filter(c => nowTick - c.lastSeen <= 30000).length;
  const clientCount = Object.keys(clients).length;

  return (
    <div className="dt-shell">
      <div className="dt-readout">
        <div className="dt-readout-tc">
          <VideoPlayer />
        </div>
        <div className="dt-readout-side">
          <div className="dt-readout-stat">
            <span className="dt-stat-label">STATE</span>
            <strong className={isRunning ? 'live' : isPreparing ? 'prep' : ''}>
              {isRunning ? tr('status.live') : isPreparing ? tr('status.syncing') : tr('status.ready')}
            </strong>
          </div>
          <div className="dt-readout-stat">
            <span className="dt-stat-label">SOURCE</span>
            <strong>{syncMode === 'freerun' ? tr('mode.freerun') : syncMode.toUpperCase()}</strong>
          </div>
          <div className="dt-readout-stat">
            <span className="dt-stat-label">{tr('drift.lastSync')}</span>
            <strong>{driftStatus?.hasSync ? formatSyncAge(driftStatus.msSinceSync) : '—'}</strong>
          </div>
          <div className="dt-readout-stat">
            <span className="dt-stat-label">{p2pRole === 'client' ? 'MASTER δ' : tr('dt.clients')}</span>
            <strong className={
              p2pRole === 'client'
                ? (masterDrift !== null && Math.abs(masterDrift) >= 0.5 ? 'warn' : '')
                : (clientCount > 0 && onlineCount < clientCount ? 'warn' : '')
            }>
              {p2pRole === 'client'
                ? (masterDrift === null ? '—' : `${masterDrift >= 0 ? '+' : ''}${masterDrift.toFixed(2)}s`)
                : `${onlineCount} / ${clientCount}`}
            </strong>
          </div>
          <div className="dt-readout-stat">
            <span className="dt-stat-label">{p2pRole === 'master' ? 'SESSION ID' : 'LINK'}</span>
            <strong className="dt-mono dt-readout-link">
              {p2pRole === 'master' ? (peerId || '—') : (p2pRole ? p2pStatus : '—')}
            </strong>
          </div>
        </div>
      </div>

      <nav className="dt-tabs" aria-label="Console sections">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`dt-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <span className="dt-tab-key">{tab.hotkey}</span>
            {tr(tab.labelKey)}
          </button>
        ))}
      </nav>

      <main className="dt-stage">
        {activeTab === 'timecode' && <TimecodePane onOutputModeChange={onOutputModeChange} />}
        {activeTab === 'sync' && <SyncPane />}
        {activeTab === 'switcher' && <SwitcherPane {...switcher} />}
        {activeTab === 'tally' && <TallyPane />}
        {activeTab === 'markers' && <MarkersPane />}
      </main>
    </div>
  );
}
