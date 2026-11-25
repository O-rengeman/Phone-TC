import { useCallback, useEffect, useRef, useState } from 'react';
import { PeerSync } from '../utils/PeerSync';
import type { SyncMessage } from '../utils/PeerSync';
import { computeBackoffDelay } from '../utils/backoff';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import type { SyncMode } from '../LTCSyncContext';

type ToastLevel = 'info' | 'warn' | 'error';
type P2PRole = 'master' | 'client' | null;
type ClientStats = Record<string, { rtt: number; drift: number; lastSeen: number }>;

// Client re-link pacing. The first retry is quick because the common case on
// set is a momentary drop (the operator walked behind a wall), while a phone
// that is genuinely off-network backs off towards the 30s ceiling instead of
// retrying every 5s for the rest of the shoot.
const CLIENT_RECONNECT_BACKOFF = { baseDelayMs: 1500, maxDelayMs: 30000 };
const MASTER_HEARTBEAT_TIMEOUT_MS = 3000;
const HEARTBEAT_WATCH_INTERVAL_MS = 500;

interface UseP2PParams {
  syncMode: SyncMode;
  setSyncMode: React.Dispatch<React.SetStateAction<SyncMode>>;
  p2pRole: P2PRole;
  setP2pRole: React.Dispatch<React.SetStateAction<P2PRole>>;
  isRunning: boolean;
  isPaused: boolean;
  langRef: React.RefObject<Lang>;
  addToast: (msg: string, level?: ToastLevel) => void;
  onMasterHeartbeatTimeout?: () => void;
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
  sessionPin: string;
  setSessionPin: React.Dispatch<React.SetStateAction<string>>;
  setPacketLossRate: React.Dispatch<React.SetStateAction<number>>;
  /** True while a setupP2P* initialize() is in flight — gates CREATE/JOIN UI. */
  isP2PSetupPending: boolean;
  peerSyncRef: React.MutableRefObject<PeerSync | null>;
  messageHandlerRef: React.MutableRefObject<((msg: SyncMessage) => void) | null>;
  rttHistoryRef: React.MutableRefObject<number[]>;
  lastSyncTimeRef: React.MutableRefObject<number>;
  lastP2pSyncTimeRef: React.MutableRefObject<number>;
  lastMasterContactTimeRef: React.MutableRefObject<number>;
  /**
   * The master peer id this client actually dialed (set by joinSession /
   * auto-join, cleared by resetP2P). P2P message auth must compare against
   * THIS — not the editable targetId field, which the operator can retype
   * mid-session without re-dialing.
   */
  connectAttemptedForRef: React.MutableRefObject<string | null>;
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
 * lastMasterContactTimeRef are exposed as refs so that provider-side logic can
 * keep reading/writing them exactly as before.
 */
export function useP2P({
  syncMode,
  setSyncMode,
  p2pRole,
  setP2pRole,
  isRunning,
  isPaused,
  langRef,
  addToast,
  onMasterHeartbeatTimeout,
}: UseP2PParams): UseP2PResult {
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [p2pStatus, setP2pStatus] = useState<string>('P2P DISCONNECTED');
  const [isHost, setIsHost] = useState(false);
  const [masterDrift, setMasterDrift] = useState<number | null>(null);
  const [clients, setClients] = useState<ClientStats>({});
  const [packetLossRate, setPacketLossRate] = useState(0);
  // Optional session PIN (Issue #59). One field, role-dependent meaning:
  // the master sets it before CREATE (clients must prove it to connect),
  // a client sets it before LINK (it is applied to its PeerSync in
  // joinSession). Kept across resetP2P — it is an operator preference for
  // the shoot, not per-connection state.
  const [sessionPin, setSessionPin] = useState('');
  const [isP2PSetupPending, setIsP2PSetupPending] = useState(false);

  const peerSyncRef = useRef<PeerSync | null>(null);
  const messageHandlerRef = useRef<((msg: SyncMessage) => void) | null>(null);
  const rttHistoryRef = useRef<number[]>([]);
  const lastSyncTimeRef = useRef<number>(0);
  const lastP2pSyncTimeRef = useRef<number>(0);
  const lastMasterContactTimeRef = useRef<number>(0);
  const masterTimeoutHandledRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  // --- Client re-link bookkeeping ---------------------------------------
  // Driven by real DataConnection open/close events surfaced through
  // PeerSync's onConnectionChange hook — NOT the p2pStatus display string.
  // Signaling reconnects overwrite p2pStatus ('RECONNECTING...', 'READY: ID
  // ...') while the DataConnection is still dead; keying retries off that
  // string used to cancel the pending retry mid-backoff and strand the
  // client until a manual re-join.
  const [connVersion, setConnVersion] = useState(0);
  const openPeerIdsRef = useRef<Set<string>>(new Set());
  const dataConnectedRef = useRef(false);
  const wasConnectedRef = useRef(false);
  // The peer id a connect() was last requested for. Re-link only runs for
  // that target — typing a new master id alone must not auto-dial it; the
  // operator still presses LINK (joinSession) to start a fresh attempt.
  const connectAttemptedForRef = useRef<string | null>(null);
  // Bumped by every setup/reset so a PeerSync whose initialize() resolves
  // late can detect it was superseded and destroy itself instead of
  // installing a ghost peer over the live one.
  const setupEpochRef = useRef(0);

  const handleConnChange = useCallback((connected: boolean, peer: string) => {
    if (connected) {
      openPeerIdsRef.current.add(peer);
    } else {
      openPeerIdsRef.current.delete(peer);
      // Prune the departed client from the stats map: entries used to live
      // forever (lastSeen just went stale), so a long shoot with churning
      // devices accumulated ghosts and the client list lied about who was
      // actually on the session.
      setClients(prev => {
        if (!(peer in prev)) return prev;
        const next = { ...prev };
        delete next[peer];
        return next;
      });
    }
    setConnVersion(v => v + 1);
  }, []);

  useEffect(() => {
    lastSyncTimeRef.current = Date.now();
  }, []);

  const resetP2P = useCallback(() => {
    // Invalidate any in-flight setupP2P*: its initialize() may still be
    // awaiting the signaling 'open' event, and without the epoch bump its
    // late resolution would install a PeerSync nothing owns (a "ghost"
    // peer that keeps answering sync-requests via messageHandlerRef).
    setupEpochRef.current += 1;
    setIsP2PSetupPending(false);
    openPeerIdsRef.current.clear();
    dataConnectedRef.current = false;
    wasConnectedRef.current = false;
    connectAttemptedForRef.current = null;
    reconnectAttemptRef.current = 0;
    if (peerSyncRef.current) {
      peerSyncRef.current.destroy();
      peerSyncRef.current = null;
    }
    setP2pRole(null);
    setIsHost(false);
    setPeerId('');
    lastP2pSyncTimeRef.current = 0;
    setMasterDrift(null);
    if (syncMode === 'p2p') setSyncMode('network');
    setP2pStatus('P2P RESET');
  }, [syncMode, setP2pRole, setSyncMode]);

  const setupP2PMaster = async () => {
    resetP2P();
    // Capture the epoch AFTER resetP2P's own bump — a second setup or a
    // reset that lands while initialize() is pending makes this stale.
    const epoch = setupEpochRef.current;
    setIsP2PSetupPending(true);
    setP2pRole('master');
    setIsHost(true);
    setSyncMode('p2p');
    try {
      const ps = new PeerSync(
        (msg) => messageHandlerRef.current?.(msg),
        (status) => setP2pStatus(status),
        undefined,
        {
          // Master accepts inbound client connections; it never dials out.
          acceptInboundConnections: true,
          onConnectionChange: handleConnChange,
          ...(sessionPin.trim() ? { sessionPin: sessionPin.trim() } : {}),
        },
      );
      const id = await ps.initialize();
      if (epoch !== setupEpochRef.current) {
        // Superseded while awaiting 'open' — destroy so the orphan peer
        // can't keep serving the shared message handler.
        ps.destroy();
        return;
      }
      setPeerId(id);
      peerSyncRef.current = ps;
    } catch (e) {
      if (epoch !== setupEpochRef.current) return;
      console.warn('P2P master init failed', e);
      setP2pStatus('PEER INIT FAILED');
      addToast(translate('toast.p2pInitFailed', langRef.current), 'error');
    } finally {
      if (epoch === setupEpochRef.current) setIsP2PSetupPending(false);
    }
  };

  const setupP2PClient = async (autoJoinId?: string) => {
    resetP2P();
    const epoch = setupEpochRef.current;
    setIsP2PSetupPending(true);
    setP2pRole('client');
    setIsHost(false);
    setSyncMode('p2p');
    try {
      const ps = new PeerSync(
        (msg) => messageHandlerRef.current?.(msg),
        (status) => setP2pStatus(status),
        undefined,
        {
          // Client only dials out to its master — reject inbound
          // DataConnections so a stranger can't inject sync messages.
          acceptInboundConnections: false,
          onConnectionChange: handleConnChange,
          ...(sessionPin.trim() ? { sessionPin: sessionPin.trim() } : {}),
        },
      );
      const id = await ps.initialize();
      if (epoch !== setupEpochRef.current) {
        ps.destroy();
        return;
      }
      setPeerId(id);
      peerSyncRef.current = ps;

      if (autoJoinId) {
        setTargetId(autoJoinId);
        connectAttemptedForRef.current = autoJoinId;
        ps.connect(autoJoinId);
      }
    } catch (e) {
      if (epoch !== setupEpochRef.current) return;
      console.warn('P2P client init failed', e);
      setP2pStatus('PEER INIT FAILED');
      addToast(translate('toast.p2pClientFailed', langRef.current), 'error');
    } finally {
      if (epoch === setupEpochRef.current) setIsP2PSetupPending(false);
    }
  };

  // Load a P2P session ID from a `?join=<id>` query param at mount — but
  // do NOT dial it automatically. A link must never connect (and hand this
  // device's LTC output/transport over to a master) without the operator's
  // own action: the ID is prefilled and the client peer is set up, and the
  // operator presses LINK to actually connect.
  // Placed after setupP2PClient's declaration so the reference is not used
  // before it is textually assigned (react-hooks/immutability).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      // One-time mount action — not a reactive state sync, so the resulting
      // setState calls are intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void setupP2PClient();
      setTargetId(joinId);
      addToast(translate('toast.p2pJoinLinkLoaded', langRef.current, { id: joinId }), 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // Mount-only by design: re-running on every setupP2PClient identity
    // change would re-trigger the auto-join whenever the function is
    // recreated, not just once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (p2pRole !== 'client') {
      masterTimeoutHandledRef.current = false;
      return;
    }

    const timer = setInterval(() => {
      const lastContactAt = lastMasterContactTimeRef.current;
      const timedOut = lastContactAt > 0 && (Date.now() - lastContactAt) >= MASTER_HEARTBEAT_TIMEOUT_MS;

      if (!timedOut) {
        masterTimeoutHandledRef.current = false;
        return;
      }
      if (masterTimeoutHandledRef.current) return;

      masterTimeoutHandledRef.current = true;
      setP2pStatus('MASTER TIMEOUT');

      if (isRunning || isPaused) {
        onMasterHeartbeatTimeout?.();
        addToast(translate('toast.p2pMasterTimedOut', langRef.current), 'error');
      }
    }, HEARTBEAT_WATCH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [p2pRole, isRunning, isPaused, onMasterHeartbeatTimeout, addToast, langRef]);

  // A healthy link clears the backoff, so a drop later in the shoot retries
  // promptly instead of inheriting the delay the previous outage grew to.
  // connVersion re-runs this whenever a DataConnection opens/closes.
  useEffect(() => {
    const connected = targetId !== '' && openPeerIdsRef.current.has(targetId);
    dataConnectedRef.current = connected;

    // Emergency toast fires once per established->lost transition, not once
    // per retry attempt (the loop below keeps retrying until it recovers).
    if (wasConnectedRef.current && !connected && isRunning) {
      addToast(translate('toast.p2pDisconnectedEmergency', langRef.current), 'error');
    }
    wasConnectedRef.current = connected;
    if (connected) {
      reconnectAttemptRef.current = 0;
      return;
    }
    if (p2pRole !== 'client' || !targetId || connectAttemptedForRef.current !== targetId) return;

    // Emergency Mode: keep re-linking a dropped client connection until it
    // recovers. Self-reschedules on the shared backoff curve; the cleanup
    // (dep change / unmount / role change) is the only thing that stops it,
    // so a signaling flap can no longer strand the retry — connVersion only
    // changes on real DataConnection events, never on status-string churn.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleAttempt = () => {
      // Delay is computed from the attempt count but only incremented when
      // an attempt actually fires — effect re-runs (connVersion bumps,
      // isRunning flips) re-arm the timer and must not inflate the backoff.
      const delay = computeBackoffDelay(reconnectAttemptRef.current, CLIENT_RECONNECT_BACKOFF);
      timer = setTimeout(() => {
        if (cancelled || dataConnectedRef.current) return;
        reconnectAttemptRef.current += 1;
        if (peerSyncRef.current && targetId) {
          setP2pStatus('RECONNECTING...');
          try {
            peerSyncRef.current.connect(targetId);
          } catch (e) {
            // A synchronous throw must not kill the self-rescheduling loop —
            // scheduleAttempt() below is what keeps re-link alive.
            console.warn('P2P reconnect attempt failed', e);
          }
        }
        scheduleAttempt();
      }, delay);
    };
    scheduleAttempt();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // connVersion is the trigger: it bumps on every DataConnection
    // open/close, which is what actually changes `connected` here. Refs and
    // setState setters are stable and intentionally not listed.
  }, [p2pRole, targetId, connVersion, isRunning, addToast, langRef]);

  const joinSession = () => {
    if (!peerSyncRef.current || !targetId) return;
    // Apply the PIN as currently typed — the field stays editable after
    // the client peer is set up, and the dial must carry the latest value.
    peerSyncRef.current.setSessionPin(sessionPin);
    connectAttemptedForRef.current = targetId;
    try {
      peerSyncRef.current.connect(targetId);
    } catch (e) {
      // Don't bail before setSyncMode — the re-link loop picks up the
      // attempted target and keeps retrying on its own backoff.
      console.warn('P2P connect failed', e);
    }
    setSyncMode('p2p');
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      peerSyncRef.current?.setLossRate(packetLossRate);
    }
  }, [packetLossRate]);

  return {
    peerId, targetId, setTargetId, p2pStatus, setP2pStatus, isHost,
    masterDrift, setMasterDrift, clients, setClients,
    packetLossRate, setPacketLossRate, isP2PSetupPending,
    sessionPin, setSessionPin,
    peerSyncRef, messageHandlerRef, rttHistoryRef, lastSyncTimeRef, lastP2pSyncTimeRef, lastMasterContactTimeRef,
    connectAttemptedForRef,
    resetP2P, setupP2PMaster, setupP2PClient, joinSession,
  };
}
