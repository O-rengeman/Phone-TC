import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLTC } from '../../LTCSyncContext';
import { VideoPlayer } from '../../VideoPlayer';
import { formatSyncAge } from '../../utils/DriftMonitor';
import { isClientOffline } from '../../utils/clients';
import { formatP2pStatus } from '../../utils/p2pStatus';
import { JAM_THRESHOLD_SEC } from '../../constants';
import type { Marker } from '../../utils/export';
import {
  DESKTOP_TAB_STORAGE_KEY,
  desktopTabForHotkey,
  resolveDesktopTab,
  visibleDesktopTabs,
} from '../../utils/desktopTabs';
import type { DesktopTabId } from '../../utils/desktopTabs';
import { TimecodePane } from './TimecodePane';
import { SyncPane } from './SyncPane';
import { MarkersPane } from './MarkersPane';
import '../../desktop.css';

interface DesktopShellProps {
  onOutputModeChange: (mode: 'stereo' | 'mono-l') => void;
}

/** Marker-drop keys, mirroring the footer's R/B/G/Y buttons. */
const MARKER_KEY_COLORS: Record<string, Marker['color']> = {
  r: 'Red',
  b: 'Blue',
  g: 'Green',
  y: 'Yellow',
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
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
 * The frame is a two-row grid (readout / stage) whose second row is the only
 * flexible one, and every row is `min-height: 0`. That is what makes the
 * "never scrolls" rule structural rather than a matter of tuning paddings: a
 * pane physically cannot push the layout taller than the window, so overflow
 * is contained inside whichever panel opted into it.
 */
export function DesktopShell({ onOutputModeChange }: DesktopShellProps) {
  const {
    isHost, isRunning, isPreparing, syncMode, driftStatus, p2pRole,
    peerId, p2pStatus, masterDrift, clients, nowTick,
    lang, tr,
    handleStartStop, beginStopHold, cancelStopHold, addMarker, holdStoppedRef,
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

  // Transport and marker shortcuts — the console is a keyboard-first surface.
  //
  // SPACE mirrors the footer button exactly: a tap starts (or, while running,
  // begins the same 700ms hold-to-stop the pointer uses — release early and
  // nothing happens). Repeats are swallowed so holding SPACE through the
  // async start can't retrigger it, and page scroll is suppressed either way.
  // R/B/G/Y drop the matching marker colour, same as the footer buttons.
  const transportDisabled = isPreparing || (syncMode === 'p2p' && p2pRole === 'client');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        // Blurring a focused button is the reliable way to stop its native
        // Space-keyup click — preventDefault alone doesn't cover every browser.
        const el = event.target as HTMLElement;
        if (el.tagName === 'BUTTON' || el.tagName === 'A') el.blur();
        if (event.repeat || transportDisabled) return;
        if (isRunning) {
          beginStopHold();
        } else if (holdStoppedRef.current) {
          // First press after a hold-stop only disarms, like the footer button.
          holdStoppedRef.current = false;
        } else {
          void handleStartStop();
        }
        return;
      }

      if (event.repeat) return;
      const color = MARKER_KEY_COLORS[event.key.toLowerCase()];
      if (color) {
        event.preventDefault();
        addMarker(color);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      // Cancelling the keyup default is what stops a focused footer button
      // from also firing its click — without it, hold-SPACE-to-stop would
      // release into an immediate restart.
      if (event.code === 'Space' && !isEditableTarget(event.target)) {
        event.preventDefault();
        cancelStopHold();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isRunning, transportDisabled, beginStopHold, cancelStopHold, handleStartStop, addMarker, holdStoppedRef]);

  const onlineCount = Object.values(clients).filter(c => !isClientOffline(c, nowTick)).length;
  const clientCount = Object.keys(clients).length;

  return (
    <div className="dt-shell">
      {/* Vitals and tabs share the readout row rather than stacking below it:
          the tab strip was a full-width band carrying five words, and giving
          that height back to the timecode buys far more than it costs. */}
      <div className="dt-readout">
        <div className="dt-readout-tc">
          <VideoPlayer />
        </div>
        <div className="dt-readout-right">
        <div className="dt-readout-side">
          <div className="dt-readout-stat">
            <span className="dt-stat-label">{tr('dt.state')}</span>
            <strong className={isRunning ? 'live' : isPreparing ? 'prep' : ''}>
              {isRunning ? tr('status.live') : isPreparing ? tr('status.syncing') : tr('status.ready')}
            </strong>
          </div>
          <div className="dt-readout-stat">
            <span className="dt-stat-label">{tr('dt.source')}</span>
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
                ? (masterDrift !== null && Math.abs(masterDrift) >= JAM_THRESHOLD_SEC ? 'warn' : '')
                : (clientCount > 0 && onlineCount < clientCount ? 'warn' : '')
            }>
              {p2pRole === 'client'
                ? (masterDrift === null ? '—' : `${masterDrift >= 0 ? '+' : ''}${masterDrift.toFixed(2)}s`)
                : `${onlineCount} / ${clientCount}`}
            </strong>
          </div>
          <div className="dt-readout-stat">
            <span className="dt-stat-label">{p2pRole === 'master' ? tr('dt.sessionId') : tr('dt.link')}</span>
            <strong className="dt-mono dt-readout-link">
              {p2pRole === 'master' ? (peerId || '—') : (p2pRole ? formatP2pStatus(p2pStatus, lang) : '—')}
            </strong>
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
        </div>
      </div>

      <main className="dt-stage">
        {activeTab === 'timecode' && <TimecodePane onOutputModeChange={onOutputModeChange} />}
        {activeTab === 'sync' && <SyncPane />}
        {activeTab === 'markers' && <MarkersPane />}
      </main>
    </div>
  );
}
