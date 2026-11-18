/**
 * SyncPane.tsx — mobile SYNC pane (v3, no-scroll).
 *
 * The old mobile SYNC tab stacked the SYNC METHOD card, the freerun start-TC
 * field and the whole P2P ConnectionManager into one scrolling column. The v3
 * pane splits it into two local tab views so nothing ever needs to scroll:
 *
 *   METHOD — the sync-mode selector plus the network sync detail / drift
 *            readout and the freerun START TIMECODE input (same behaviour and
 *            disabled rules as before).
 *   P2P    — <ConnectionManager /> on its own; it renders its own second-level
 *            session/TURN/PEER sub-tabs while isMobile.
 *
 * This file only runs inside `.mobile-view` (App gates the whole pane on
 * isMobile). All styling is scoped to `.mobile-view .sync-pane-v3 …` in
 * syncPane.css so the desktop SYNC pane is untouched. The `.mobile-pane*`
 * classes are the shared shell contract; the `sync-pane-v3*` classes own the
 * geometry here.
 */

import { useState } from 'react';
import { useLTC } from '../../LTCSyncContext';
import type { SyncMode } from '../../LTCSyncContext';
import { formatSyncAge } from '../../utils/DriftMonitor';
import { ConnectionManager } from '../../ConnectionManager';
import { HelpButton } from '../HelpButton';
import './syncPane.css';

type SyncPaneSection = 'method' | 'p2p';

const SYNC_MODES: readonly SyncMode[] = ['system', 'network', 'p2p', 'freerun'];

export function MobileSyncPane() {
  const {
    tr,
    isRunning,
    syncMode,
    setSyncMode,
    p2pRole,
    syncStatus,
    driftStatus,
    manualTimecode,
    setManualTimecode,
  } = useLTC();

  // Local to this pane — activeTab in the context stays 'main'|'sync'|'tools'.
  const [section, setSection] = useState<SyncPaneSection>('method');

  return (
    <div className="tab-pane sync-pane mobile-pane sync-pane-v3">
      <div className="mobile-pane-tabs sync-pane-v3-tabs" role="tablist" aria-label={tr('tab.sync')}>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'method'}
          className={`mobile-pane-tab sync-pane-v3-tab${section === 'method' ? ' active' : ''}`}
          onClick={() => setSection('method')}
        >
          {tr('dtab.sync')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'p2p'}
          className={`mobile-pane-tab sync-pane-v3-tab${section === 'p2p' ? ' active' : ''}`}
          onClick={() => setSection('p2p')}
        >
          {tr('label.p2p')}
        </button>
      </div>

      <div className="mobile-pane-body sync-pane-v3-body">
        {section === 'method' ? (
          <div className="mobile-pane-view sync-pane-v3-view sync-pane-v3-method">
            <div className="control-section control-section-v2 sync-pane-v3-card">
              <label className="section-label">
                {tr('label.syncMethod')}
                <HelpButton topic="sync" tr={tr} variant="inline" />
              </label>
              <div className="sync-toggle-pro sync-pane-v3-modes">
                {SYNC_MODES.map((m) => (
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
                <div className="sync-detail">
                  {tr('cm.latencyOffset', { latency: syncStatus.latency.toFixed(1), offset: syncStatus.offset.toFixed(1) })}
                </div>
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
              <div className="control-section control-section-v2 sync-pane-v3-card">
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
          </div>
        ) : (
          <div className="mobile-pane-view sync-pane-v3-view sync-pane-v3-p2p">
            <ConnectionManager />
          </div>
        )}
      </div>
    </div>
  );
}
