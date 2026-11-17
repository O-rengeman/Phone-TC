import { useLTC } from "./LTCSyncContext";
import { formatP2pStatus } from "./utils/p2pStatus";

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
    packetLossRate,
    setPacketLossRate,
    addToast
  } = useLTC();

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('join', peerId);
    navigator.clipboard.writeText(url.toString())
      .then(() => addToast(tr('toast.inviteCopied'), 'info'))
      .catch(() => addToast(tr('toast.copyFailed'), 'error'));
  };

  return (
    <>
      <div className="control-section">
        <label className="section-label">{tr('label.p2p')}</label>
        {!p2pRole ? (
          <div className="p2p-init-pro">
            <button onClick={() => void setupP2PMaster()}>{tr('btn.createMaster')}</button>
            <button onClick={() => void setupP2PClient()}>{tr('btn.joinClient')}</button>
          </div>
        ) : (
          <div className="p2p-panel-pro">
            <div className="p2p-header">
              <span className="role-tag">{p2pRole.toUpperCase()}</span>
              <button className="btn-small" onClick={resetP2P}>{tr('btn.reset')}</button>
            </div>
            {p2pRole === 'master' && (
              <div className="p2p-master-box">
                <div className="id-display id-display-row">
                  <span>ID: {peerId || '...'}</span>
                  {peerId && (
                    <button className="btn-small" onClick={copyInviteLink}>
                      {tr('p2p.copyLink')}
                    </button>
                  )}
                </div>
                
                <div className="control-section">
                  <label className="section-label">{tr('p2p.startSource')}</label>
                  <div className="sync-toggle-pro">
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
                  <div className="start-tc-input">
                    <label>{tr('p2p.startTc')}</label>
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
              <div className="p2p-client-box">
                <input 
                  placeholder={tr('p2p.enterMasterId')} 
                  value={targetId} 
                  maxLength={8}
                  onChange={e => setTargetId(e.target.value.toUpperCase())} 
                />
                <button onClick={joinSession}>{tr('p2p.link')}</button>
              </div>
            )}
            <div className={`p2p-status-mini ${p2pStatus.includes('ERROR') ? 'error' : ''}`}>{formatP2pStatus(p2pStatus, lang)}</div>
          </div>
        )}
      </div>

      {import.meta.env.DEV && (
        <div className="control-section dev-panel">
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
      )}
    </>
  );
}
