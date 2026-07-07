import { useEffect, useRef, useState } from 'react';
import { PeerSync } from '../utils/PeerSync';
import type { SyncMessage } from '../utils/PeerSync';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import type { SyncMode } from '../LTCSyncContext';

type ToastLevel = 'info' | 'warn' | 'error';
type P2PRole = 'master' | 'client' | null;
type ClientStats = Record<string, { rtt: number; drift: number; lastSeen: number }>;

const RECONNECT_DELAY_MS = 5000;

interface UseP2PParams {
  syncMode: SyncMode;
  setSyncMode: React.Dispatch<React.SetStateAction<SyncMode>>;
  p2pRole: P2PRole;
  setP2pRole: React.Dispatch<React.SetStateAction<P2PRole>>;
  isRunning: boolean;
  langRef: React.RefObject<Lang>;
  addToast: (msg: string, level?: ToastLevel) => void;
}

interface UseP2PResult {
  peerId: string;
  targetId: string;
  setTargetId: React.Dispatch<React.SetStateAction<string>>;
  p2pStatus: string;
  setP2pStatus: React.Dispatch<React.SetStateAction<string>>;
  isHost: boolean;
  masterDrift: number | null;
  setMasterDrift: React.Dispatch<React.SetStateAction<number | null>>;
  clients: ClientStats;
  setClients: React.Dispatch<React.SetStateAction<ClientStats>>;
  packetLossRate: number;
  setPacketLossRate: React.Dispatch<React.SetStateAction<number>>;
  peerSyncRef: React.RefObject<PeerSync | null>;
  messageHandlerRef: React.RefObject<((msg: SyncMessage) => void) | null>;
  rttHistoryRef: React.RefObject<number[]>;
  lastSyncTimeRef: React.RefObject<number>;
  lastHeartbeatTimeRef: React.RefObject<number>;
  resetP2P: () => void;
  setupP2PMaster: () => Promise<void>;
  setupP2PClient: (autoJoinId?: string) => Promise<void>;
  joinSession: () => void;
}

/**
 * Owns the PeerSync connection lifecycle: peer id/status/role bookkeeping,
 * client RTT/drift bookkeeping, dev-only packet-loss simulation, auto-join
 * (via `?join=<id>`), and auto-reconnect on unexpected disconnect.
 *
 * The actual message dispatch (messageHandlerRef.current = (msg) => {...}),
 * heartbeat broadcast, and sync-request burst logic stay in the main
 * provider for now — they read/write tally state that isn't extracted yet,
 * so splitting them here would mean threading tally setters through this
 * hook. peerSyncRef/messageHandlerRef/rttHistoryRef/lastSyncTimeRef/
 * lastHeartbeatTimeRef are exposed as refs so that provider-side logic can
 * keep reading/writing them exactly as before.
 */
export function useP2P({
  syncMode,
  setSyncMode,
  p2pRole,
  setP2pRole,
  isRunning,
  langRef,
  addToast,
}: UseP2PParams): UseP2PResult {
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [p2pStatus, setP2pStatus] = useState<string>('P2P DISCONNECTED');
  const [isHost, setIsHost] = useState(false);
  const [masterDrift, setMasterDrift] = useState<number | null>(null);
  const [clients, setClients] = useState<ClientStats>({});
  const [packetLossRate, setPacketLossRate] = useState(0);

  const peerSyncRef = useRef<PeerSync | null>(null);
  const messageHandlerRef = useRef<((msg: SyncMessage) => void) | null>(null);
  const rttHistoryRef = useRef<number[]>([]);
  const lastSyncTimeRef = useRef<number>(0);
  const lastHeartbeatTimeRef = useRef<number>(0);

  useEffect(() => {
    lastSyncTimeRef.current = Date.now();
  }, []);

  const resetP2P = () => {
    if (peerSyncRef.current) {
      peerSyncRef.current.destroy();
      peerSyncRef.current = null;
    }
    setP2pRole(null);
    setIsHost(false);
    setPeerId('');
    if (syncMode === 'p2p') setSyncMode('network');
    setP2pStatus('P2P RESET');
  };

  const setupP2PMaster = async () => {
    resetP2P();
    setP2pRole('master');
    setIsHost(true);
    setSyncMode('p2p');
    try {
      const ps = new PeerSync(
        (msg) => messageHandlerRef.current?.(msg),
        (status) => setP2pStatus(status)
      );
      const id = await ps.initialize();
      setPeerId(id);
      peerSyncRef.current = ps;
    } catch (e) {
      console.warn('P2P master init failed', e);
      setP2pStatus('PEER INIT FAILED');
      addToast(translate('toast.p2pInitFailed', langRef.current), 'error');
    }
  };

  const setupP2PClient = async (autoJoinId?: string) => {
    resetP2P();
    setP2pRole('client');
    setIsHost(false);
    setSyncMode('p2p');
    try {
      const ps = new PeerSync(
        (msg) => messageHandlerRef.current?.(msg),
        (status) => setP2pStatus(status)
      );
      const id = await ps.initialize();
      setPeerId(id);
      peerSyncRef.current = ps;

      if (autoJoinId) {
        setTargetId(autoJoinId);
        ps.connect(autoJoinId);
      }
    } catch (e) {
      console.warn('P2P client init failed', e);
      setP2pStatus('PEER INIT FAILED');
      addToast(translate('toast.p2pClientFailed', langRef.current), 'error');
    }
  };

  // Auto-join a P2P session if a `?join=<id>` query param is present at mount.
  // Placed after setupP2PClient's declaration so the reference is not used
  // before it is textually assigned (react-hooks/immutability).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      // One-time mount action equivalent to a user clicking "join" — not a
      // reactive state sync, so the resulting setState calls are intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setupP2PClient(joinId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // Mount-only by design: re-running on every setupP2PClient identity
    // change would re-trigger the auto-join whenever the function is
    // recreated, not just once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emergency Mode: Auto-reconnect & notify when disconnected during playback
  useEffect(() => {
    if (p2pRole === 'client' && p2pStatus.includes('CLOSED') && targetId) {
      if (isRunning) {
        addToast(translate('toast.p2pDisconnectedEmergency', langRef.current), 'error');
      }

      const reconnectTimer = setTimeout(() => {
        if (peerSyncRef.current && targetId) {
          setP2pStatus('RECONNECTING...');
          peerSyncRef.current.connect(targetId);
        }
      }, RECONNECT_DELAY_MS);
      return () => clearTimeout(reconnectTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2pRole, p2pStatus, targetId, isRunning]);

  const joinSession = () => {
    if (!peerSyncRef.current || !targetId) return;
    peerSyncRef.current.connect(targetId);
    setSyncMode('p2p');
    lastHeartbeatTimeRef.current = Date.now();
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      peerSyncRef.current?.setLossRate(packetLossRate);
    }
  }, [packetLossRate]);

  return {
    peerId, targetId, setTargetId, p2pStatus, setP2pStatus, isHost,
    masterDrift, setMasterDrift, clients, setClients,
    packetLossRate, setPacketLossRate,
    peerSyncRef, messageHandlerRef, rttHistoryRef, lastSyncTimeRef, lastHeartbeatTimeRef,
    resetP2P, setupP2PMaster, setupP2PClient, joinSession,
  };
}
