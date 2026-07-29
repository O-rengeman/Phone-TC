import { useState } from 'react';

import { useLTC } from '../../LTCSyncContext';
import type { ObsControls } from '../../hooks/useObsTally';
import { DesktopPanel, DesktopSection } from './DesktopPanel';

const OFFLINE_AFTER_MS = 30000;

const STATUS_KEYS: Record<string, string> = {
  idle: 'obs.statusIdle',
  connecting: 'obs.statusConnecting',
  connected: 'obs.statusConnected',
  error: 'obs.statusError',
};

/**
 * OBS link: connection settings on the left, the scene-to-camera map on the
 * right.
 *
 * The map is the whole feature — OBS switches scenes, and this table is what
 * says "scene CAM-A means the phone on the tripod at stage left". Everything
 * downstream (tally lamps, torch, the action log) is the existing switcher
 * path, so there is nothing here that duplicates it.
 */
export function ObsPane({ obs }: { obs: ObsControls }) {
  const { isHost, clients, cameraLabels, nowTick, tr } = useLTC();
  // The field holds a draft only while it is being edited. Clearing it on
  // commit is what lets the normalized URL ("localhost" -> "ws://localhost:4455")
  // show up without an effect that syncs one piece of state into another.
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const urlValue = urlDraft ?? obs.obsUrl;
  const commitUrl = () => {
    obs.setObsUrl(urlValue);
    setUrlDraft(null);
  };

  const clientEntries = Object.entries(clients);
  const labelFor = (id: string) => {
    const index = clientEntries.findIndex(([clientId]) => clientId === id);
    return cameraLabels[id] || (index >= 0 ? `CAM${index + 1}` : id.slice(0, 6));
  };

  if (!isHost) {
    return (
      <div className="dt-pane dt-pane-obs">
        <div className="dt-empty dt-empty-full">
          <strong>{tr('dt.hostOnly')}</strong>
          <span>{tr('obs.hostOnlyHint')}</span>
        </div>
      </div>
    );
  }

  const statusKey = STATUS_KEYS[obs.obsStatus] ?? 'obs.statusIdle';
  const dotClass = obs.obsStatus === 'connected' ? 'ok' : obs.obsStatus === 'error' ? 'warn' : 'offline';

  return (
    <div className="dt-pane dt-pane-obs">
      <DesktopPanel
        title={tr('obs.connection')}
        className="dt-panel-control"
        aside={<span className="dt-chip"><span className={`dt-dot ${dotClass}`} />{tr(statusKey)}</span>}
        scroll
      >
        <DesktopSection title={tr('obs.link')}>
          <label className="dt-check">
            <input
              type="checkbox"
              checked={obs.obsEnabled}
              onChange={e => obs.setObsEnabled(e.target.checked)}
            />
            <span>{tr('obs.enable')}</span>
          </label>

          <div className="dt-field">
            <span className="dt-field-label">{tr('obs.url')}</span>
            <input
              className="dt-input dt-input-mono"
              value={urlValue}
              onChange={e => setUrlDraft(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={e => { if (e.key === 'Enter') commitUrl(); }}
              placeholder="ws://localhost:4455"
              spellCheck={false}
            />
          </div>

          <div className="dt-field">
            <span className="dt-field-label">{tr('obs.password')}</span>
            <input
              className="dt-input"
              type="password"
              value={obs.obsPassword}
              onChange={e => obs.setObsPassword(e.target.value)}
              placeholder={tr('obs.passwordHint')}
              autoComplete="off"
            />
          </div>

          {obs.obsError && <p className="dt-warn">{tr(`obs.err.${obs.obsError}`)}</p>}
          <p className="dt-hint">{tr('obs.setupHint')}</p>
        </DesktopSection>

        <DesktopSection title={tr('obs.state')}>
          <div className="dt-stat-row">
            <span className="dt-stat-label">PROGRAM</span>
            <strong>{obs.obsScene.programScene ?? '—'}</strong>
          </div>
          <div className="dt-stat-row">
            <span className="dt-stat-label">PREVIEW</span>
            <strong>{obs.obsScene.previewScene ?? '—'}</strong>
          </div>
          <div className="dt-stat-row">
            <span className="dt-stat-label">STUDIO MODE</span>
            <strong>{obs.obsScene.studioMode ? 'ON' : 'OFF'}</strong>
          </div>
          {obs.obsStatus === 'connected' && !obs.obsScene.studioMode && (
            <p className="dt-hint">{tr('obs.studioModeHint')}</p>
          )}
        </DesktopSection>
      </DesktopPanel>

      <DesktopPanel
        title={tr('obs.mapping')}
        aside={obs.obsScene.scenes.length > 0 ? (
          <div className="dt-inline">
            <button type="button" className="dt-btn-sm" onClick={obs.autoAssignScenes}>
              {tr('obs.autoMap')}
            </button>
            <button type="button" className="dt-btn-sm" onClick={obs.clearSceneMapping}>
              {tr('obs.clearMap')}
            </button>
          </div>
        ) : undefined}
        grow
        scroll
      >
        {obs.obsScene.scenes.length === 0 ? (
          <div className="dt-empty">
            <strong>{tr('obs.noScenes')}</strong>
            <span>{tr('obs.noScenesHint')}</span>
          </div>
        ) : (
          <table className="dt-table dt-table-obs">
            <thead>
              <tr>
                <th>{tr('obs.scene')}</th>
                <th>{tr('obs.camera')}</th>
                <th>{tr('obs.bus')}</th>
              </tr>
            </thead>
            <tbody>
              {obs.obsScene.scenes.map(scene => {
                const mapped = obs.obsMapping[scene] ?? '';
                const isProgram = obs.obsScene.programScene === scene;
                const isPreview = obs.obsScene.previewScene === scene && !isProgram;
                const offline = mapped ? nowTick - (clients[mapped]?.lastSeen ?? 0) > OFFLINE_AFTER_MS : false;

                return (
                  <tr key={scene} className={isProgram ? 'obs-row-program' : isPreview ? 'obs-row-preview' : ''}>
                    <td>{scene}</td>
                    <td>
                      <select
                        className="dt-input dt-input-flush"
                        value={mapped}
                        onChange={e => obs.assignScene(scene, e.target.value || null)}
                      >
                        <option value="">{tr('obs.unassigned')}</option>
                        {clientEntries.map(([id]) => (
                          <option key={id} value={id}>{labelFor(id)}</option>
                        ))}
                        {/* A camera that was mapped before it dropped off keeps
                            its row rather than silently resetting to none. */}
                        {mapped && !clients[mapped] && (
                          <option value={mapped}>{`${labelFor(mapped)} (${tr('obs.offline')})`}</option>
                        )}
                      </select>
                    </td>
                    <td className={offline ? 'warn' : undefined}>
                      {isProgram ? tr('tally.live') : isPreview ? tr('tally.preview') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {clientEntries.length === 0 && (
          <p className="dt-hint">{tr('dt.noClientsHint')}</p>
        )}
      </DesktopPanel>
    </div>
  );
}
