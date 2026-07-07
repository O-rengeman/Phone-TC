import { useLTC } from "./LTCSyncContext";

export function ConnectionManager() {
  const {
    tr,
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
    navigator.clipboard.writeText(url.toString());
    addToast('Invite Link Copied!', 'info');
  };

  return (
    <>
      <div className="control-section">
        <label className="section-label">{tr('label.p2p')}</label>
        {!p2pRole ? (
          <div className="p2p-init-pro">
            <button onClick={() => setupP2PMaster()}>{tr('btn.createMaster')}</button>
            <button onClick={() => setupP2PClient()}>{tr('btn.joinClient')}</button>
          </div>
        ) : (
          <div className="p2p-panel-pro">
            <div className="p2p-header">
              <span className="role-tag">{p2pRole.toUpperCase()}</span>
              <button className="btn-small" onClick={resetP2P}>{tr('btn.reset')}</button>
            </div>
            {p2pRole === 'master' && (
              <div className="p2p-master-box">
                <div className="id-display" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span>ID: {peerId || '...'}</span>
                  {peerId && (
                    <button className="btn-small" onClick={copyInviteLink} style={{ padding: '4px 8px' }}>
                      🔗 COPY LINK
                    </button>
                  )}
                </div>
                
                <div className="control-section">
                  <label className="section-label">START SOURCE</label>
                  <div className="sync-toggle-pro">
                    <button 
                      className={p2pSyncSource === 'manual' ? 'active' : ''} 
                      onClick={() => setP2pSyncSource('manual')}
                      disabled={isRunning}
                    >
                      MANUAL TC
                    </button>
                    <button 
                      className={p2pSyncSource === 'network' ? 'active' : ''} 
                      onClick={() => setP2pSyncSource('network')}
                      disabled={isRunning}
                    >
                      NETWORK TIME
                    </button>
                  </div>
                </div>

                {p2pSyncSource === 'manual' && (
                  <div className="start-tc-input">
                    <label>START TC</label>
                    <input 
                      value={manualTimecode} 
                      onChange={e => setManualTimecode(e.target.value)} 
                      disabled={isRunning} 
                    />
                  </div>
                )}
              </div>
            )}
            {p2pRole === 'client' && (
              <div className="p2p-client-box">
                <input 
                  placeholder="ENTER MASTER ID" 
                  value={targetId} 
                  onChange={e => setTargetId(e.target.value)} 
                />
                <button onClick={joinSession}>LINK</button>
              </div>
            )}
            <div className={`p2p-status-mini ${p2pStatus.includes('ERROR') ? 'error' : ''}`}>{p2pStatus}</div>
          </div>
        )}
      </div>

      {import.meta.env.DEV && (
        <div className="control-section dev-panel">
          <label className="section-label dev-label">DEV: PACKET LOSS SIM</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="range" 
              min="0" 
              max="0.5" 
              step="0.01"
              value={packetLossRate}
              onChange={e => setPacketLossRate(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '0.7rem', color: '#666', minWidth: '30px', fontFamily: 'var(--font-mono)' }}>
              {(packetLossRate * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </>
  );
}
