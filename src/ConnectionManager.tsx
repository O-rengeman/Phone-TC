import { useState } from 'react';
import { useLTC } from "./LTCSyncContext";
import { formatP2pStatus } from "./utils/p2pStatus";
import { TURN_STORAGE_KEY, parseTurnConfig } from "./utils/iceServers";
import { readStoredString, writeStoredString } from "./utils/storage";
import {
  clearPeerServerConfig,
  loadPeerServerConfig,
  savePeerServerConfig,
} from "./utils/signalingConfig";
import type { PeerServerConfig } from "./utils/signalingConfig";
import "./components/signaling.css";
import "./components/mobileSync.css";

interface SignalingFormState {
  turnUrls: string;
  turnUsername: string;
  turnCredential: string;
  peerHost: string;
  peerPort: string;
  peerPath: string;
  peerSecure: boolean;
  peerKey: string;
}

const EMPTY_SIGNALING_FORM: SignalingFormState = {
  turnUrls: '',
  turnUsername: '',
  turnCredential: '',
  peerHost: '',
  peerPort: '',
  peerPath: '/',
  peerSecure: false,
  peerKey: '',
};

/** Reads both stored configs once into editable form state. */
function loadSignalingForm(): SignalingFormState {
  const peer = loadPeerServerConfig();
  const turn = parseTurnConfig(readStoredString(TURN_STORAGE_KEY));
  return {
    turnUrls: turn?.urls ?? '',
    turnUsername: turn?.username ?? '',
    turnCredential: turn?.credential ?? '',
    peerHost: peer?.host ?? '',
    peerPort: peer ? String(peer.port) : '',
    peerPath: peer?.path ?? '/',
    peerSecure: peer?.secure ?? false,
    peerKey: peer?.key ?? '',
  };
}

export function ConnectionManager() {
  const {
    tr,
    lang,
    p2pRole,
    setupP2PMaster,
    setupP2PClient,
    resetP2P,
    peerId,
    p2pSyncSource,
    setP2pSyncSource,
    isRunning,
    manualTimecode,
    setManualTimecode,
    targetId,
    setTargetId,
    joinSession,
    p2pStatus,
    isP2PSetupPending,
    packetLossRate,
    setPacketLossRate,
    addToast,
    isMobile
  } = useLTC();

  // Advanced signaling overrides (custom TURN relay + self-hosted PeerServer).
  // Persisted under TURN_STORAGE_KEY / STORAGE_KEYS.peerServer and only read
  // when PeerSync constructs a Peer — i.e. on the next create/join.
  const [sigForm, setSigForm] = useState<SignalingFormState>(loadSignalingForm);
  const setSigField = <K extends keyof SignalingFormState>(field: K, value: SignalingFormState[K]) =>
    setSigForm(prev => ({ ...prev, [field]: value }));

  // Mobile-only second-level tabs inside the P2P view: SESSION / TURN / PEER
  // (plus a DEV-only packet-loss tab in development builds). Desktop keeps the
  // collapsed <details> disclosure instead, so this state is inert there.
  const [cmSection, setCmSection] = useState<'session' | 'turn' | 'peer' | 'dev'>('session');

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('join', peerId);
    const text = url.toString();
    // navigator.clipboard is undefined on insecure contexts (plain HTTP on
    // set) — guard it and fall back to the legacy selection-based copy.
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(text)
        .then(() => addToast(tr('toast.inviteCopied'), 'info'))
        .catch(() => addToast(tr('toast.copyFailed'), 'error'));
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      addToast(tr(ok ? 'toast.inviteCopied' : 'toast.copyFailed'), ok ? 'info' : 'error');
    } catch {
      addToast(tr('toast.copyFailed'), 'error');
    }
  };

  const handleSaveSignaling = () => {
    const host = sigForm.peerHost.trim();
    const port = Number(sigForm.peerPort.trim());
    // A blank host means "back to the PeerJS cloud" — the other PeerServer
    // fields are then ignored, matching loadPeerServerConfig() === null.
    if (host !== '' && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      addToast(tr('sig.invalidPort'), 'error');
      return;
    }

    // TURN override: a blank urls list parses back as "unconfigured"
    // (parseTurnConfig → null), restoring the built-in/env ICE servers.
    writeStoredString(TURN_STORAGE_KEY, JSON.stringify({
      urls: sigForm.turnUrls.trim(),
      username: sigForm.turnUsername.trim(),
      credential: sigForm.turnCredential,
    }));

    let peerCfg: PeerServerConfig = null;
    if (host !== '') {
      const cfg: NonNullable<PeerServerConfig> = {
        host,
        port,
        path: sigForm.peerPath.trim() || '/',
        secure: sigForm.peerSecure,
      };
      const key = sigForm.peerKey.trim();
      if (key !== '') cfg.key = key;
      peerCfg = cfg;
    }
    savePeerServerConfig(peerCfg);

    // Never log the credential — it stays in localStorage only.
    addToast(tr('sig.saved'), 'info');
  };

  const handleResetSignaling = () => {
    clearPeerServerConfig();
    // 'null' parses back to "no TURN override" → env vars / public defaults.
    writeStoredString(TURN_STORAGE_KEY, 'null');
    setSigForm(EMPTY_SIGNALING_FORM);
    addToast(tr('sig.resetDone'), 'info');
  };

  // Shared session block — identical markup on both shells; on mobile it is
  // one cm-v3 view, on desktop it sits inside the v2 section under the label.
  const sessionBlock = !p2pRole ? (
    <div className="p2p-init-pro cm-v2-role-cards">
      {/* Disabled while a setup initialize() is in flight — a second
          tap used to spawn a parallel PeerSync whose late resolution
          installed a ghost peer over the live one. */}
      <button className="cm-v2-role-card" onClick={() => void setupP2PMaster()} disabled={isP2PSetupPending}>{tr('btn.createMaster')}</button>
      <button className="cm-v2-role-card" onClick={() => void setupP2PClient()} disabled={isP2PSetupPending}>{tr('btn.joinClient')}</button>
    </div>
  ) : (
    <div className="p2p-panel-pro cm-v2-session">
      <div className="p2p-header cm-v2-session-head">
        <span className="role-tag cm-v2-role-tag">{p2pRole.toUpperCase()}</span>
        <button className="btn-small cm-v2-reset" onClick={resetP2P}>{tr('btn.reset')}</button>
      </div>
      {p2pRole === 'master' && (
        <div className="p2p-master-box cm-v2-master">
          <div className="id-display id-display-row cm-v2-id-row">
            <span className="cm-v2-id">ID: {peerId || '...'}</span>
            {peerId && (
              <button className="btn-small cm-v2-copy" onClick={copyInviteLink}>
                {tr('p2p.copyLink')}
              </button>
            )}
          </div>

          <div className="control-section cm-v2-source">
            <label className="section-label">{tr('p2p.startSource')}</label>
            <div className="sync-toggle-pro cm-v2-source-toggle">
              <button
                className={p2pSyncSource === 'manual' ? 'active' : ''}
                onClick={() => setP2pSyncSource('manual')}
                disabled={isRunning}
              >
                {tr('p2p.manualTc')}
              </button>
              <button
                className={p2pSyncSource === 'network' ? 'active' : ''}
                onClick={() => setP2pSyncSource('network')}
                disabled={isRunning}
              >
                {tr('p2p.networkTime')}
              </button>
            </div>
          </div>

          {p2pSyncSource === 'manual' && (
            <div className="start-tc-input cm-v2-starttc">
              <label className="cm-v2-field-label">{tr('p2p.startTc')}</label>
              <input
                value={manualTimecode}
                onChange={e => setManualTimecode(e.target.value)}
                disabled={isRunning}
                maxLength={11}
              />
            </div>
          )}
        </div>
      )}
      {p2pRole === 'client' && (
        <div className="p2p-client-box cm-v2-client">
          <input
            placeholder={tr('p2p.enterMasterId')}
            value={targetId}
            maxLength={8}
            onChange={e => setTargetId(e.target.value.toUpperCase())}
          />
          <button className="cm-v2-link" onClick={joinSession} disabled={isP2PSetupPending}>{tr('p2p.link')}</button>
        </div>
      )}
      <div className={`p2p-status-mini cm-v2-status ${p2pStatus.includes('ERROR') ? 'error' : ''}`}>{formatP2pStatus(p2pStatus, lang)}</div>
    </div>
  );

  // Shared advanced-signaling field groups — the same sigForm state drives
  // both the desktop <details> body and the mobile TURN/PEER pages, so a value
  // typed on one page is still there when the other page saves.
  const turnGroup = (
    <div className="sig-group">
      <span className="sig-group-label">{tr('sig.turnSection')}</span>
      <div className="sig-field">
        <label className="sig-field-label" htmlFor="sig-turn-urls">{tr('sig.turnUrls')}</label>
        <input
          id="sig-turn-urls"
          type="text"
          className="sig-input"
          value={sigForm.turnUrls}
          onChange={e => setSigField('turnUrls', e.target.value)}
          placeholder="turn:turn.example.com:3478, turns:turn.example.com:5349"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="sig-field">
        <label className="sig-field-label" htmlFor="sig-turn-user">{tr('sig.turnUsername')}</label>
        <input
          id="sig-turn-user"
          type="text"
          className="sig-input"
          value={sigForm.turnUsername}
          onChange={e => setSigField('turnUsername', e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="sig-field">
        <label className="sig-field-label" htmlFor="sig-turn-pass">{tr('sig.turnCredential')}</label>
        <input
          id="sig-turn-pass"
          type="password"
          className="sig-input"
          value={sigForm.turnCredential}
          onChange={e => setSigField('turnCredential', e.target.value)}
          autoComplete="new-password"
        />
      </div>
    </div>
  );

  const peerGroup = (
    <div className="sig-group">
      <span className="sig-group-label">{tr('sig.peerSection')}</span>
      <div className="sig-field">
        <label className="sig-field-label" htmlFor="sig-peer-host">{tr('sig.peerHost')}</label>
        <input
          id="sig-peer-host"
          type="text"
          className="sig-input"
          value={sigForm.peerHost}
          onChange={e => setSigField('peerHost', e.target.value)}
          placeholder="peer.example.com"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="sig-field-row">
        <div className="sig-field sig-field-port">
          <label className="sig-field-label" htmlFor="sig-peer-port">{tr('sig.peerPort')}</label>
          <input
            id="sig-peer-port"
            type="text"
            inputMode="numeric"
            className="sig-input"
            value={sigForm.peerPort}
            onChange={e => setSigField('peerPort', e.target.value)}
            placeholder="9000"
            autoComplete="off"
          />
        </div>
        <div className="sig-field">
          <label className="sig-field-label" htmlFor="sig-peer-path">{tr('sig.peerPath')}</label>
          <input
            id="sig-peer-path"
            type="text"
            className="sig-input"
            value={sigForm.peerPath}
            onChange={e => setSigField('peerPath', e.target.value)}
            placeholder="/"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <label className="sig-check">
        <input
          type="checkbox"
          checked={sigForm.peerSecure}
          onChange={e => setSigField('peerSecure', e.target.checked)}
        />
        <span>{tr('sig.peerSecure')}</span>
      </label>
      <div className="sig-field">
        <label className="sig-field-label" htmlFor="sig-peer-key">{tr('sig.peerKey')}</label>
        <input
          id="sig-peer-key"
          type="password"
          className="sig-input"
          value={sigForm.peerKey}
          onChange={e => setSigField('peerKey', e.target.value)}
          autoComplete="new-password"
        />
      </div>
    </div>
  );

  // SAVE/RESET row (+ hint) shared by the desktop details body and both
  // mobile settings pages — handleSaveSignaling/handleResetSignaling act on
  // the whole sigForm, so the same actions close out TURN and PEER alike.
  const sigFooter = (
    <>
      <p className="sig-hint">{tr('sig.hint')}</p>
      <div className="sig-actions">
        <button type="button" className="btn-small sig-btn" onClick={handleSaveSignaling}>
          {tr('sig.save')}
        </button>
        <button type="button" className="btn-small sig-btn" onClick={handleResetSignaling}>
          {tr('sig.reset')}
        </button>
      </div>
    </>
  );

  // DEV-only packet-loss simulator. The mobile tab that reveals it is gated
  // on the same flag, so production markup does not grow.
  const devPanel = import.meta.env.DEV && (
    <div className="control-section dev-panel cm-v2-dev">
      <label className="section-label dev-label">{tr('p2p.devSim')}</label>
      <div className="dev-sim-row">
        <input
          type="range"
          min="0"
          max="0.5"
          step="0.01"
          value={packetLossRate}
          onChange={e => setPacketLossRate(parseFloat(e.target.value))}
        />
        <span className="dev-sim-value">
          {(packetLossRate * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );

  // Mobile: sub-tab pages instead of the scrollable <details> stack. .cm-v3
  // overrides the root's display:contents so the pane is a bounded flex
  // column — sub-tabs fixed on top, exactly one view visible below.
  if (isMobile) {
    return (
      <div className="connection-manager-v2 cm-v3">
        <div className="mobile-pane-tabs cm-mobile-subtabs" role="tablist" aria-label={tr('label.p2p')}>
          <button
            type="button"
            role="tab"
            aria-selected={cmSection === 'session'}
            className={`mobile-pane-tab cm-mobile-subtab${cmSection === 'session' ? ' active' : ''}`}
            onClick={() => setCmSection('session')}
          >
            {tr('dt.session')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cmSection === 'turn'}
            className={`mobile-pane-tab cm-mobile-subtab${cmSection === 'turn' ? ' active' : ''}`}
            onClick={() => setCmSection('turn')}
          >
            {tr('sig.turnSection')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cmSection === 'peer'}
            className={`mobile-pane-tab cm-mobile-subtab${cmSection === 'peer' ? ' active' : ''}`}
            onClick={() => setCmSection('peer')}
          >
            {tr('sig.peerSection')}
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              role="tab"
              aria-selected={cmSection === 'dev'}
              className={`mobile-pane-tab cm-mobile-subtab${cmSection === 'dev' ? ' active' : ''}`}
              aria-label={tr('p2p.devSim')}
              onClick={() => setCmSection('dev')}
            >
              DEV
            </button>
          )}
        </div>
        <div className="cm-v3-body">
          {cmSection === 'session' && (
            <div className="cm-v3-view cm-v3-session-view">{sessionBlock}</div>
          )}
          {cmSection === 'turn' && (
            <div className="cm-v3-view cm-v3-settings-view">{turnGroup}{sigFooter}</div>
          )}
          {cmSection === 'peer' && (
            <div className="cm-v3-view cm-v3-settings-view">{peerGroup}{sigFooter}</div>
          )}
          {import.meta.env.DEV && cmSection === 'dev' && (
            <div className="cm-v3-view cm-v3-dev-view">{devPanel}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    // .connection-manager-v2 is display:contents — the v2 hooks never change
    // the desktop pane's flex/grid layout, they only scope mobileSync.css.
    <div className="connection-manager-v2">
      <div className="control-section cm-v2-section">
        <label className="section-label">{tr('label.p2p')}</label>
        {sessionBlock}

        {/* Advanced: self-hosted signaling + custom TURN. Outside the role
            conditional so it can be configured before create/join; values are
            only read when the next Peer is constructed. */}
        <details className="sig-advanced cm-v2-advanced">
          <summary className="sig-advanced-summary cm-v2-adv-summary">{tr('sig.advanced')}</summary>
          <div className="sig-advanced-body cm-v2-adv-body">
            {turnGroup}
            {peerGroup}
            {sigFooter}
          </div>
        </details>
      </div>

      {devPanel}
    </div>
  );
}
