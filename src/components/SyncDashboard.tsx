import React, { useState } from 'react';

interface SyncDashboardProps {
  p2pRole: 'master' | 'client' | null;
  p2pStatus: string;
  peerId: string;
  masterDrift: number | null;
  onSetupMaster: () => void;
  onSetupClient: () => void;
  onJoinSession: (targetId: string) => void;
}

export const SyncDashboard: React.FC<SyncDashboardProps> = ({
  p2pRole,
  p2pStatus,
  peerId,
  masterDrift,
  onSetupMaster,
  onSetupClient,
  onJoinSession
}) => {
  const [targetIdInput, setTargetIdInput] = useState('');

  return (
    <div className="p2p-panel-pro">
      <div className="p2p-header">
        <span className="section-label" style={{ paddingLeft: 0, margin: 0 }}>NETWORK P2P</span>
        <div className={`status-badge-compact ${p2pStatus !== 'P2P DISCONNECTED' ? 'active' : ''}`}>
          {p2pStatus}
        </div>
      </div>
      
      {!p2pRole ? (
        <div className="p2p-init-pro">
          <button onClick={onSetupMaster}>HOST<br/>MASTER</button>
          <button onClick={onSetupClient}>JOIN<br/>CLIENT</button>
        </div>
      ) : p2pRole === 'master' ? (
        <div className="p2p-master-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span className="role-tag">MASTER</span>
            <button className="btn-small" onClick={() => {
              navigator.clipboard.writeText(peerId);
              alert('ID Copied!');
            }}>COPY ID</button>
          </div>
          <div className="peer-id-display">{peerId || '...'}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'center' }}>
            Share this ID with client devices.
          </p>
        </div>
      ) : (
        <div className="p2p-client-box">
          <span className="role-tag" style={{ marginBottom: '10px', display: 'inline-block' }}>CLIENT</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="ENTER MASTER ID" 
              value={targetIdInput}
              onChange={e => setTargetIdInput(e.target.value.toUpperCase())}
            />
            <button className="btn-pill active" onClick={() => onJoinSession(targetIdInput)}>JOIN</button>
          </div>
        </div>
      )}

      {p2pRole === 'client' && masterDrift !== null && (
        <div className="info-strip-pro" style={{ marginTop: '16px' }}>
          <div className={`badge ${Math.abs(masterDrift) < 0.03 ? 'drift-ok' : 'drift-warn'}`}>
            Δ {(masterDrift * 1000).toFixed(1)}ms
          </div>
        </div>
      )}
    </div>
  );
};
