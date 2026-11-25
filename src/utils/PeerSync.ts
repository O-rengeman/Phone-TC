import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';

import { debug } from './log';
import { getIceServers } from './iceServers';
import { loadPeerServerConfig, peerJsOptionsFromConfig } from './signalingConfig';
import { computeBackoffDelay } from './backoff';

/** Fields shared by messages that carry the master's timecode/fps/state. */
interface MasterSyncFields {
  masterTimecode: string;
  masterTimestamp: number;
  fps: number;
  isDropFrame: boolean;
  isRunning: boolean;
  isPaused?: boolean;
}

interface SyncMessageBase {
  /**
   * PeerJS id of the sender. Stamped by the *receiver* from the connection —
   * it is not part of the wire payload and senders leave it unset.
   */
  clientId?: string;
}

export interface SyncRequestMessage extends SyncMessageBase {
  type: 'sync-request';
  clientTimestamp?: number;
}

export interface SyncResponseMessage extends SyncMessageBase, MasterSyncFields {
  type: 'sync-response';
  clientTimestamp?: number;
}

export interface HeartbeatMessage extends SyncMessageBase, MasterSyncFields {
  type: 'heartbeat';
}

export interface ReportMessage extends SyncMessageBase {
  type: 'report';
  rtt?: number;
  drift?: number;
}

/**
 * Discriminated union: each message type carries only the fields it actually
 * uses, so senders no longer pad unused fields with dummy values and
 * receivers get real optionality instead of `msg.rtt || 0` fallbacks.
 */
export type SyncMessage =
  | SyncRequestMessage
  | SyncResponseMessage
  | HeartbeatMessage
  | ReportMessage;

const SYNC_MESSAGE_TYPES = new Set(['sync-request', 'sync-response', 'heartbeat', 'report']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Optional numeric field: absent is fine, present must be a real number. */
function isOptionalFiniteNumber(v: unknown): boolean {
  return v === undefined || isFiniteNumber(v);
}

function hasMasterFields(m: Record<string, unknown>): boolean {
  return typeof m.masterTimecode === 'string'
    && isFiniteNumber(m.masterTimestamp)
    && isFiniteNumber(m.fps)
    && typeof m.isDropFrame === 'boolean'
    && typeof m.isRunning === 'boolean'
    // isPaused is optional on the wire (older peers may omit it — receivers
    // treat absent as false), but when present it must be a real boolean:
    // a truthy string like "false" must not pass validation.
    && (m.isPaused === undefined || typeof m.isPaused === 'boolean');
}

/**
 * Runtime guard for data arriving over the P2P DataConnection. PeerJS hands
 * us `unknown`; anything that doesn't match a known message shape is dropped
 * at the boundary instead of flowing into the sync handler unvalidated.
 */
export function isSyncMessage(data: unknown): data is SyncMessage {
  if (!isRecord(data)) return false;
  const type = data.type;
  if (typeof type !== 'string' || !SYNC_MESSAGE_TYPES.has(type)) return false;
  switch (type) {
    case 'sync-request':
      return isOptionalFiniteNumber(data.clientTimestamp);
    case 'report':
      return isOptionalFiniteNumber(data.rtt) && isOptionalFiniteNumber(data.drift);
    case 'sync-response':
      return hasMasterFields(data) && isOptionalFiniteNumber(data.clientTimestamp);
    case 'heartbeat':
      return hasMasterFields(data);
    default:
      return false;
  }
}

/** Factory used to create the underlying Peer — overridable for tests. */
export type PeerFactory = (id: string, options: object) => Peer;

/**
 * Optional PeerSync behavior hooks. Kept as a single options object so the
 * constructor stays `(onMessage, onStatus, peerFactory?, options?)` — the
 * peerFactory position is load-bearing for existing tests/callers.
 */
export interface PeerSyncOptions {
  /**
   * Whether inbound DataConnections (peer 'connection' events) are accepted.
   * Client-role devices only ever dial out, so they pass false: a stranger
   * who guesses the short peer id gets its connection closed immediately
   * instead of staying open to inject or siphon messages. Defaults to true.
   */
  acceptInboundConnections?: boolean;
  /**
   * Reports DataConnection lifecycle per remote peer: `true` when a
   * connection to `peerId` opens, `false` when the last open connection to
   * that peer closes. Lets the owner drive reconnect logic off real
   * connection events instead of parsing the display-status strings, which
   * signaling reconnects overwrite while the DataConnection is still dead.
   */
  onConnectionChange?: (connected: boolean, peerId: string) => void;
}

/**
 * How long an outbound DataConnection may sit before 'open' before a later
 * connect() to the same peer is allowed to replace it. Without this, a conn
 * stuck in signaling/ICE limbo satisfies the connect() dedupe check forever
 * and every re-link attempt silently no-ops.
 *
 * Must exceed the client's maximum reconnect backoff (~30s, see
 * CLIENT_RECONNECT_BACKOFF in useP2P): retries fire connect() at backoff
 * intervals, and a pending conn younger than this timeout is left alone —
 * otherwise every retry past the timeout kills the in-progress negotiation
 * and slow-but-viable paths (symmetric NAT + TURN) can never complete.
 * 35s gives each attempt at least one full backoff window to finish; a
 * genuinely dead conn is reaped on the first connect() after it expires.
 */
export const PENDING_CONNECT_TIMEOUT_MS = 35_000;

/** Fixed length of the short peer id generated by generateShortId(). */
export const PEER_ID_LENGTH = 4;

/**
 * How many times a fresh short id is generated when the signaling server
 * reports the drawn one is already taken. The 4-character id is deliberately
 * short so it can be read aloud and typed on set, which means collisions are
 * possible (32^4 ≈ 1.05M combinations); redrawing on 'unavailable-id' keeps
 * that a non-event for the operator instead of a dead session that has to be
 * reset by hand.
 */
export const PEER_ID_RETRY_LIMIT = 5;

/**
 * How many times the PeerJS signaling socket is re-dialled after it drops.
 * With the default backoff curve this spans roughly three minutes — long
 * enough to ride out a tunnel or a lift, short enough to stop eventually.
 */
export const SIGNALING_RECONNECT_LIMIT = 8;

export class PeerSync {
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  private onMessageCallback: (msg: SyncMessage) => void;
  private onStatusCallback: (status: string) => void;
  private lossRate: number = 0;
  private peerFactory: PeerFactory;
  private options: PeerSyncOptions;
  private acceptInboundConnections: boolean;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  // First-seen timestamp per connection, used to reap conns that never
  // reached 'open' — see PENDING_CONNECT_TIMEOUT_MS.
  private pendingSince = new Map<DataConnection, number>();
  // Conns that actually reached 'open'. The close handler only reports a
  // `false` transition for these — a pending conn dying in signaling/ICE
  // limbo must not emit a phantom close to observers that never saw its
  // `true`.
  private openedConns = new Set<DataConnection>();

  constructor(
    onMessage: (msg: SyncMessage) => void,
    onStatus: (status: string) => void,
    peerFactory: PeerFactory = (id, options) => new Peer(id, options),
    options: PeerSyncOptions = {},
  ) {
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
    this.peerFactory = peerFactory;
    this.options = options;
    this.acceptInboundConnections = options.acceptInboundConnections ?? true;
  }

  private generateShortId(): string {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Confusion-prone I, O removed
    // CSPRNG, not Math.random(): the ID is the session's only credential,
    // so its unpredictability is the whole defence against guessing.
    // Rejection sampling keeps the distribution uniform over the alphabet.
    const limit = Math.floor(256 / chars.length) * chars.length;
    let result = '';
    while (result.length < PEER_ID_LENGTH) {
      const bytes = new Uint8Array(PEER_ID_LENGTH);
      crypto.getRandomValues(bytes);
      for (const b of bytes) {
        if (b >= limit) continue;
        result += chars.charAt(b % chars.length);
        if (result.length === PEER_ID_LENGTH) break;
      }
    }
    return result;
  }

  public initialize(): Promise<string> {
    this.isDestroyed = false;
    return new Promise((resolve, reject) => {
      this.openPeer(0, resolve, reject);
    });
  }

  /**
   * Creates the underlying Peer with a freshly drawn short id and wires its
   * lifecycle events. Re-entered (with idAttempt + 1) when the signaling
   * server rejects the drawn id as already taken — see PEER_ID_RETRY_LIMIT.
   */
  private openPeer(
    idAttempt: number,
    resolve: (id: string) => void,
    reject: (err: unknown) => void,
  ): void {
    try {
      const shortId = this.generateShortId();
      // Use injected factory (defaults to real Peer). ICE servers resolve at
      // call time so a TURN override saved in the Advanced panel applies to
      // the next Peer; the signaling spread is {} unless a self-hosted
      // PeerServer is configured (STORAGE_KEYS.peerServer).
      const peer = this.peerFactory(shortId, {
        debug: 2,
        config: {
          'iceServers': getIceServers(),
        },
        ...peerJsOptionsFromConfig(loadPeerServerConfig()),
      });
      this.peer = peer;
      let opened = false;

      peer.on('open', (id: string) => {
        opened = true;
        // Reached on the initial connect and again after every successful
        // signaling reconnect, so this is also where the backoff resets.
        this.clearReconnectTimer();
        this.reconnectAttempt = 0;
        this.onStatusCallback(`READY: ID ${id}`);
        resolve(id);
      });

      peer.on('connection', (conn: DataConnection) => {
        if (!this.acceptInboundConnections) {
          // Dial-out-only role (P2P client): anyone can dial our short id,
          // so refuse the inbound channel outright rather than letting a
          // stranger inject messages into the sync handler.
          debug(`Rejecting inbound connection from ${conn.peer} (dial-out only)`);
          try { conn.close(); } catch { /* already gone */ }
          return;
        }
        this.onStatusCallback(`CONNECTED TO CLIENT: ${conn.peer}`);
        this.handleConnection(conn);
      });

      // The signaling socket dropped but the Peer object is still usable:
      // existing DataConnections may survive, yet no new peer can find us
      // until it is re-dialled. PeerJS does not retry this on its own.
      peer.on('disconnected', () => {
        if (this.isDestroyed) return;
        this.scheduleSignalingReconnect();
      });

      peer.on('error', (err) => {
        if (!opened && err.type === 'unavailable-id' && idAttempt < PEER_ID_RETRY_LIMIT) {
          debug(`Peer id ${shortId} already taken, redrawing (attempt ${idAttempt + 1})`);
          peer.destroy();
          this.openPeer(idAttempt + 1, resolve, reject);
          return;
        }
        console.error('Peer error:', err);
        this.onStatusCallback(`ERROR: ${err.type}`);
        // After 'open' the promise is already settled; rejecting again would
        // be a no-op, so transient session errors only surface as status.
        if (!opened) reject(err);
      });
    } catch (err) {
      console.error('Failed to initialize PeerJS:', err);
      this.onStatusCallback('ERROR: PeerJS NOT LOADED');
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Re-dials the signaling socket on an exponential backoff. Each attempt
   * re-arms the next one; a successful reconnect emits 'open', which clears
   * the pending timer and resets the attempt counter.
   */
  private scheduleSignalingReconnect(): void {
    if (this.isDestroyed || this.reconnectTimer !== null) return;

    if (this.reconnectAttempt >= SIGNALING_RECONNECT_LIMIT) {
      this.onStatusCallback('ERROR: SIGNALING LOST');
      return;
    }

    const delay = computeBackoffDelay(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.onStatusCallback('RECONNECTING...');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const peer = this.peer;
      if (!peer || this.isDestroyed) return;
      if (!peer.disconnected) {
        this.reconnectAttempt = 0;
        return;
      }

      try {
        peer.reconnect();
      } catch (err) {
        debug('Peer reconnect threw', err);
      }
      // Re-arm ahead of the outcome: if the re-dial succeeds, 'open' clears
      // this timer, and if it fails there is no further event to hang the
      // next attempt off.
      this.scheduleSignalingReconnect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public connect(peerId: string) {
    if (!this.peer) return;
    // A DataConnection that never reached 'open' would satisfy the dedupe
    // check below forever and silently swallow every retry — reap conns
    // stuck in signaling/ICE limbo past PENDING_CONNECT_TIMEOUT_MS first.
    const now = Date.now();
    const stuck = this.connections.filter(c =>
      c.peer === peerId
      && !c.open
      && now - (this.pendingSince.get(c) ?? now) >= PENDING_CONNECT_TIMEOUT_MS);
    for (const c of stuck) {
      this.connections = this.connections.filter(x => x !== c);
      this.pendingSince.delete(c);
      this.openedConns.delete(c);
      try { c.close(); } catch { /* transport may already be gone */ }
      // No onConnectionChange(false): the conn never opened, so observers
      // never saw a `true` for it and there is no transition to report.
    }
    // A dial-out peer (P2P client) only ever talks to its single master —
    // conns to any OTHER peer are leftovers from a previous join target and
    // would keep receiving broadcast sync traffic. Close them; the 'close'
    // handler's bookkeeping is idempotent so the manual teardown below plus
    // the later event can't double-report.
    for (const c of [...this.connections]) {
      if (c.peer === peerId) continue;
      this.connections = this.connections.filter(x => x !== c);
      this.pendingSince.delete(c);
      const wasOpen = this.openedConns.delete(c);
      const stillOpen = this.connections.some(x => x.peer === c.peer && x.open);
      if (wasOpen && !stillOpen) {
        this.options.onConnectionChange?.(false, c.peer);
      }
      try { c.close(); } catch { /* transport may already be gone */ }
    }
    // peer.connect() opens a NEW DataConnection every call — repeated
    // join/reconnect attempts would otherwise stack parallel connections to
    // the same peer and deliver every message multiple times. Closed
    // connections are removed from this.connections on 'close', so any entry
    // still listed for this peer is live or still connecting.
    if (this.connections.some(c => c.peer === peerId)) {
      debug(`connect(${peerId}) skipped — connection already exists`);
      return;
    }
    const conn = this.peer.connect(peerId, {
      reliable: false // Use unreliable (UDP-style) for low latency TC
    });
    this.onStatusCallback(`CONNECTING TO ${peerId}...`);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.connections.push(conn);
    this.pendingSince.set(conn, Date.now());

    conn.on('open', () => {
      // A conn that opens after destroy() belongs to a dead peer — reporting
      // it would phantom-mark the peer as connected for the NEXT session.
      if (this.isDestroyed) return;
      this.pendingSince.delete(conn);
      this.openedConns.add(conn);
      this.onStatusCallback(`CONNECTED TO ${conn.peer}`);
      debug('Connection opened with:', conn.peer);
      this.options.onConnectionChange?.(true, conn.peer);
    });

    conn.on('data', (data: unknown) => {
      // Same guard: a dying peer's late 'data' events must not reach the
      // (shared) message handler of whatever session replaced this one.
      if (this.isDestroyed) return;
      if (!isSyncMessage(data)) {
        debug('Discarding malformed P2P message:', data);
        return;
      }
      // Stamp the sender id from the transport, then hand off — the master
      // answers sync-requests inside the message handler itself.
      this.onMessageCallback({ ...data, clientId: conn.peer });
    });

    conn.on('close', () => {
      // Always run local bookkeeping even when destroyed — a late 'close'
      // still has to drop the conn from this.connections — but never emit
      // status/observer callbacks for a dead peer (they would clobber the
      // 'P2P RESET'/new-session status and phantom-flap connVersion).
      this.connections = this.connections.filter(c => c !== conn);
      this.pendingSince.delete(conn);
      const wasOpen = this.openedConns.delete(conn);
      if (this.isDestroyed) return;
      this.onStatusCallback('CONNECTION CLOSED');
      // Report the drop only when this conn had opened AND no other open
      // conn to the same peer remains — duplicate conns shouldn't flap
      // the observer, and a never-opened conn emits no transition at all.
      const stillOpen = this.connections.some(c => c.peer === conn.peer && c.open);
      if (wasOpen && !stillOpen) {
        this.options.onConnectionChange?.(false, conn.peer);
      }
    });
  }

  public setLossRate(rate: number): void {
    this.lossRate = Math.max(0, Math.min(1, rate));
  }

  /** Current simulated packet-loss rate in [0, 1] (dev tooling). */
  public getLossRate(): number {
    return this.lossRate;
  }

  public send(msg: SyncMessage) {
    this.connections.forEach(conn => {
      if (conn.open && Math.random() >= this.lossRate) {
        void conn.send(msg);
      }
    });
  }

  /**
   * Sends only to open connections belonging to `peerId`. Used for directed
   * replies (sync-response): broadcast send() would hand every connected
   * client a response whose clientTimestamp belongs to a different requester.
   */
  public sendTo(peerId: string, msg: SyncMessage) {
    this.connections.forEach(conn => {
      if (conn.peer === peerId && conn.open && Math.random() >= this.lossRate) {
        void conn.send(msg);
      }
    });
  }

  public broadcast(msg: SyncMessage) {
    this.send(msg);
  }

  public destroy() {
    this.isDestroyed = true;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.pendingSince.clear();
    this.openedConns.clear();
    this.peer?.destroy();
  }
}
