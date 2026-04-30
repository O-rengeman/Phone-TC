import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerSync } from '../utils/PeerSync';
import type { SyncMessage } from '../utils/PeerSync';

interface UsePeerSyncProps {
  onPrecisionSync: (msg: SyncMessage, rtt: number) => void;
  onCoarseSync: (msg: SyncMessage) => void;
  onClientReport: (msg: SyncMessage) => void;
  fps: number;
  isDropFrame: boolean;
  isRunning: boolean;
  getCurrentTimecode: () => string;
}

export function usePeerSync({
  onPrecisionSync,
  onCoarseSync,
  onClientReport,
  fps,
  isDropFrame,
  isRunning,
  getCurrentTimecode
}: UsePeerSyncProps) {
  const [peerId, setPeerId] = useState<string>('');
  const [p2pStatus, setP2pStatus] = useState<string>('P2P DISCONNECTED');
  const [p2pRole, setP2pRole] = useState<'master' | 'client' | null>(null);
  const peerSyncRef = useRef<PeerSync | null>(null);

  // Initialize Peer
  const setupMaster = useCallback(async () => {
    setP2pRole('master');
    setP2pStatus('INIT MASTER...');
    try {
      const ps = new PeerSync(
        (msg) => handleMessage(msg),
        (status) => setP2pStatus(status)
      );
      const id = await ps.initialize();
      setPeerId(id);
      peerSyncRef.current = ps;
    } catch (e) {
      setP2pStatus('PEER INIT FAILED');
    }
  }, []);

  const setupClient = useCallback(async () => {
    setP2pRole('client');
    setP2pStatus('INIT CLIENT...');
    try {
      const ps = new PeerSync(
        (msg) => handleMessage(msg),
        (status) => setP2pStatus(status)
      );
      const id = await ps.initialize();
      setPeerId(id);
      peerSyncRef.current = ps;
    } catch (e) {
      setP2pStatus('PEER INIT FAILED');
    }
  }, []);

  const joinSession = useCallback((targetId: string) => {
    if (!peerSyncRef.current || !targetId) return;
    peerSyncRef.current.connect(targetId);
  }, []);

  const handleMessage = useCallback((msg: SyncMessage) => {
    const isHost = p2pRole === 'master';
    if (msg.type === 'report' && isHost) {
      onClientReport(msg);
    } else if (msg.type === 'sync-response' && !isHost) {
      const now = performance.now();
      const rtt = now - (msg.clientTimestamp || now);
      onPrecisionSync(msg, rtt);
    } else if (msg.type === 'heartbeat' && !isHost) {
      onCoarseSync(msg);
    }
  }, [p2pRole, onClientReport, onPrecisionSync, onCoarseSync]);

  // Master Heartbeat Loop
  useEffect(() => {
    let hbInterval: any;
    const isHost = p2pRole === 'master';
    if (isHost && peerSyncRef.current) {
      hbInterval = setInterval(() => {
        peerSyncRef.current?.broadcast({
          type: 'heartbeat',
          masterTimecode: getCurrentTimecode(),
          masterTimestamp: Date.now(),
          fps,
          isDropFrame,
          isRunning
        });
      }, 100); // 10Hz Master Heartbeat
    }
    return () => {
      if (hbInterval) clearInterval(hbInterval);
    };
  }, [p2pRole, fps, isDropFrame, isRunning, getCurrentTimecode]);

  // Client request burst
  const requestSyncBurst = useCallback(() => {
    if (p2pRole === 'master' || !peerSyncRef.current) return;
    
    const sendSync = (delay = 0) => {
      setTimeout(() => {
        peerSyncRef.current?.broadcast({
          type: 'sync-request',
          masterTimecode: '',
          masterTimestamp: 0,
          fps: 0,
          isDropFrame: false,
          isRunning: false,
          clientTimestamp: performance.now()
        });
      }, delay);
    };
    
    sendSync(0);
    sendSync(100);
    sendSync(200);
  }, [p2pRole]);

  // Client Periodic Check / Sync
  useEffect(() => {
    let interval: any;
    if (p2pRole === 'client' && peerSyncRef.current) {
      interval = setInterval(() => {
        // We let the parent decide if a burst is needed via a callback, 
        // but for safety, we ensure the client stays connected.
        // The parent component should call `requestSyncBurst()` based on SmartClock output.
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [p2pRole]);

  const sendReport = useCallback((rtt: number, drift: number) => {
    if (p2pRole === 'master' || !peerSyncRef.current) return;
    peerSyncRef.current.send({
      type: 'report',
      masterTimecode: '',
      masterTimestamp: 0,
      fps: 0,
      isDropFrame: false,
      isRunning: false,
      rtt,
      drift
    });
  }, [p2pRole]);

  return {
    peerId,
    p2pStatus,
    p2pRole,
    setupMaster,
    setupClient,
    joinSession,
    requestSyncBurst,
    sendReport,
    setP2pRole
  };
}
