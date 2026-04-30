// Peer is now provided by CDN in index.html
declare const Peer: any;

export interface SyncMessage {
  type: 'sync-request' | 'sync-response' | 'heartbeat' | 'report';
  masterTimecode: string;
  masterTimestamp: number;
  fps: number;
  isDropFrame: boolean;
  isRunning: boolean;
  clientTimestamp?: number;
  clientId?: string; // Identifier for the sender
  rtt?: number;      // Reported RTT from client
  drift?: number;    // Reported drift from client
}

export class PeerSync {
  private peer: any = null;
  private connections: any[] = [];
  private onMessageCallback: (msg: SyncMessage) => void;
  private onStatusCallback: (status: string) => void;

  constructor(
    onMessage: (msg: SyncMessage) => void,
    onStatus: (status: string) => void
  ) {
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
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
        // Use global Peer object from CDN with ICE servers for NAT traversal
        this.peer = new Peer(shortId, {
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

        this.peer.on('connection', (conn: any) => {
          this.onStatusCallback(`CONNECTED TO CLIENT: ${conn.peer}`);
          this.handleConnection(conn);
        });

        this.peer.on('error', (err: any) => {
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

  private handleConnection(conn: any) {
    this.connections.push(conn);
    
    conn.on('open', () => {
      this.onStatusCallback(`CONNECTED TO ${conn.peer}`);
      console.log('Connection opened with:', conn.peer);
    });

    conn.on('data', (data: any) => {
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

  public send(msg: SyncMessage) {
    this.connections.forEach(conn => {
      if (conn.open) {
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
