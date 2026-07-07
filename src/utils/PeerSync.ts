import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';

import type { TallyPayload } from './tally';

export interface SyncMessage {
  type: 'sync-request' | 'sync-response' | 'heartbeat' | 'report' | 'tally';
  masterTimecode: string;
  masterTimestamp: number;
  fps: number;
  isDropFrame: boolean;
  isRunning: boolean;
  isPaused?: boolean;
  clientTimestamp?: number;
  clientId?: string; // Identifier for the sender
  rtt?: number;      // Reported RTT from client
  drift?: number;    // Reported drift from client
  tally?: TallyPayload;
}

/** Factory used to create the underlying Peer — overridable for tests. */
export type PeerFactory = (id: string, options: object) => Peer;

export class PeerSync {
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  private onMessageCallback: (msg: SyncMessage) => void;
  private onStatusCallback: (status: string) => void;
  private lossRate: number = 0;
  private peerFactory: PeerFactory;

  constructor(
    onMessage: (msg: SyncMessage) => void,
    onStatus: (status: string) => void,
    peerFactory: PeerFactory = (id, options) => new Peer(id, options),
  ) {
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
    this.peerFactory = peerFactory;
  }

  private generateShortId(): string {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Confusion-prone I, O removed
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  public initialize(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const shortId = this.generateShortId();
        // Use injected factory (defaults to real Peer) with ICE servers for NAT traversal
        this.peer = this.peerFactory(shortId, {
          debug: 2,
          config: {
            'iceServers': [
              { 'urls': 'stun:stun.l.google.com:19302' },
              { 'urls': 'stun:stun1.l.google.com:19302' },
              { 'urls': 'stun:stun2.l.google.com:19302' },
              { 'urls': 'stun:stun3.l.google.com:19302' },
              { 'urls': 'stun:stun4.l.google.com:19302' },
            ]
          }
        });

        this.peer.on('open', (id: string) => {
          this.onStatusCallback(`READY: ID ${id}`);
          resolve(id);
        });

        this.peer.on('connection', (conn: DataConnection) => {
          this.onStatusCallback(`CONNECTED TO CLIENT: ${conn.peer}`);
          this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          this.onStatusCallback(`ERROR: ${err.type}`);
          reject(err);
        });
      } catch (err) {
        console.error('Failed to initialize PeerJS:', err);
        this.onStatusCallback('ERROR: PeerJS NOT LOADED');
        reject(err);
      }
    });
  }

  public connect(peerId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(peerId, {
      reliable: false // Use unreliable (UDP-style) for low latency TC
    });
    this.onStatusCallback(`CONNECTING TO ${peerId}...`);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.connections.push(conn);

    conn.on('open', () => {
      this.onStatusCallback(`CONNECTED TO ${conn.peer}`);
      console.log('Connection opened with:', conn.peer);
    });

    conn.on('data', (data: unknown) => {
      const msg = data as SyncMessage;
      msg.clientId = conn.peer; // Identify the sender

      // Master logic: Answer to sync-request automatically
      if (msg.type === 'sync-request' && this.onMessageCallback) {
        this.onMessageCallback({ ...msg, clientTimestamp: msg.clientTimestamp });
      } else {
        this.onMessageCallback(msg);
      }
    });

    conn.on('close', () => {
      this.onStatusCallback('CONNECTION CLOSED');
      this.connections = this.connections.filter(c => c !== conn);
    });
  }

  public setLossRate(rate: number): void {
    this.lossRate = Math.max(0, Math.min(1, rate));
  }

  /** Current simulated packet-loss rate in [0, 1]. */
  public getLossRate(): number {
    return this.lossRate;
  }

  public send(msg: SyncMessage) {
    this.connections.forEach(conn => {
      if (conn.open && Math.random() >= this.lossRate) {
        conn.send(msg);
      }
    });
  }

  public broadcast(msg: SyncMessage) {
    this.send(msg);
  }

  public destroy() {
    this.peer?.destroy();
  }
}
