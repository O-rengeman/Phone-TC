import { useLTC } from '../../LTCSyncContext';
import { tallyLabelKey, TALLY_COLORS } from '../../utils/tally';
import type { TallyState } from '../../utils/tally';
import { DesktopPanel, DesktopSection } from './DesktopPanel';

const TALLY_STATES: TallyState[] = ['live', 'preview', 'off'];
const OFFLINE_AFTER_MS = 30000;

/**
 * Tally control for this device and, on the master, for every connected
 * camera. The per-camera grid is the reason this is its own tab: on a shoot
 * with more than two cameras it is the surface the director actually watches.
 */
export function TallyPane() {
  const {
    isHost, clients, nowTick, cameraLabels, tallyPayload,
    manualTally, handleManualTallyChange, handleClientTallyChange, handleAllTallyChange,
    tallyTorchEnabled, setTallyTorchEnabled,
    tallyStyle, setTallyStyle, tallyBorderSize, setTallyBorderSize, tallyTcSize, setTallyTcSize,
    setTallyOpen, setDirectorPanelOpen, setIsVisualSlate,
    tallyActionLog,
    tr,
  } = useLTC();

  const clientEntries = Object.entries(clients);

  const openFullscreen = () => {
    setDirectorPanelOpen(false);
    setIsVisualSlate(false);
    setTallyOpen(true);
  };

  return (
    <div className="dt-pane dt-pane-tally">
      <DesktopPanel
        title={tr('dt.control')}
        help="tally"
        className="dt-panel-control"
        aside={
          <button type="button" className="dt-btn-sm" onClick={openFullscreen}>
            {tr('dt.fullscreen')}
          </button>
        }
        scroll
      >
        <DesktopSection title={tr('label.tally')}>
          <div className="dt-tally-row">
            {TALLY_STATES.map(state => (
              <button
                key={state}
                type="button"
                className={`dt-tally-btn ${manualTally === state ? 'active' : ''}`}
                style={manualTally === state ? { background: TALLY_COLORS[state], borderColor: TALLY_COLORS[state] } : undefined}
                onClick={() => handleManualTallyChange(state)}
              >
                {tr(tallyLabelKey(state))}
              </button>
            ))}
          </div>
          <label className="dt-check">
            <input
              type="checkbox"
              checked={tallyTorchEnabled}
              onChange={e => setTallyTorchEnabled(e.target.checked)}
            />
            <span>Torch LED</span>
          </label>
        </DesktopSection>

        <DesktopSection title={tr('dt.appearance')}>
          <div className="dt-field">
            <span className="dt-field-label">STYLE</span>
            <div className="dt-segment">
              <button type="button" className={tallyStyle === 'full' ? 'active' : ''} onClick={() => setTallyStyle('full')}>FULL</button>
              <button type="button" className={tallyStyle === 'border' ? 'active' : ''} onClick={() => setTallyStyle('border')}>BORDER</button>
            </div>
          </div>
          <div className="dt-field">
            <span className="dt-field-label">BORDER</span>
            <div className="dt-segment">
              {(['thin', 'medium', 'thick'] as const).map(size => (
                <button
                  key={size}
                  type="button"
                  className={tallyBorderSize === size ? 'active' : ''}
                  onClick={() => setTallyBorderSize(size)}
                  disabled={tallyStyle !== 'border'}
                >
                  {size.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="dt-field">
            <span className="dt-field-label">TC SIZE</span>
            <div className="dt-segment">
              {(['sm', 'md', 'lg'] as const).map(size => (
                <button
                  key={size}
                  type="button"
                  className={tallyTcSize === size ? 'active' : ''}
                  onClick={() => setTallyTcSize(size)}
                >
                  {size.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </DesktopSection>

        {isHost && tallyActionLog.length > 0 && (
          <DesktopSection title={tr('director.actionLog')}>
            <ul className="dt-log">
              {tallyActionLog.map((entry, i) => (
                <li key={i}>
                  <span className={`dt-log-state state-${entry.state}`}>{tr(tallyLabelKey(entry.state as TallyState))}</span>
                  <span>{entry.cam}</span>
                  <span className="dt-mono">{entry.time}</span>
                </li>
              ))}
            </ul>
          </DesktopSection>
        )}
      </DesktopPanel>

      <DesktopPanel
        title={tr('dt.clients')}
        aside={isHost && clientEntries.length > 0 ? (
          <div className="dt-all-tally">
            <span className="dt-field-label">{tr('dt.allCameras')}</span>
            {TALLY_STATES.map(state => (
              <button
                key={state}
                type="button"
                className="dt-tally-btn dt-tally-btn-sm"
                onClick={() => handleAllTallyChange(state)}
              >
                {tr(tallyLabelKey(state))}
              </button>
            ))}
          </div>
        ) : undefined}
        grow
        scroll
      >
        {!isHost ? (
          <div className="dt-empty">
            <strong>{tr('dt.hostOnly')}</strong>
            <span>タリーの割り当てはマスター端末から行います。</span>
          </div>
        ) : clientEntries.length === 0 ? (
          <div className="dt-empty">
            <strong>{tr('dt.noClients')}</strong>
            <span>{tr('dt.noClientsHint')}</span>
          </div>
        ) : (
          <div className="dt-cam-grid">
            {clientEntries.map(([id, stats], idx) => {
              const offline = nowTick - stats.lastSeen > OFFLINE_AFTER_MS;
              const assigned = tallyPayload?.assignments?.[id];
              return (
                <div key={id} className={`dt-cam-card ${offline ? 'offline' : ''}`}>
                  <div className="dt-cam-head">
                    <strong>{cameraLabels[id] || `CAM${idx + 1}`}</strong>
                    <span className="dt-mono">{id}</span>
                  </div>
                  <div className="dt-tally-row">
                    {TALLY_STATES.map(state => {
                      const active = assigned === state;
                      return (
                        <button
                          key={state}
                          type="button"
                          className={`dt-tally-btn dt-tally-btn-sm ${active ? 'active' : ''}`}
                          style={active ? { background: TALLY_COLORS[state], borderColor: TALLY_COLORS[state] } : undefined}
                          onClick={() => handleClientTallyChange(id, state)}
                        >
                          {tr(tallyLabelKey(state))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DesktopPanel>
    </div>
  );
}
