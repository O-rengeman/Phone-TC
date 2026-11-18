import { describe, it, expect, vi, afterEach } from 'vitest';
import { PeerSync, isSyncMessage, PENDING_CONNECT_TIMEOUT_MS } from './PeerSync';
import type { SyncMessage, PeerSyncOptions } from './PeerSync';
import type { Peer } from 'peerjs';

type Handler = (...args: unknown[]) => void;

// Minimal controllable fakes — same shape as PeerSync.test.ts so the real
// PeerSync code paths run without a network or the PeerJS CDN object.
function makeConn(opts: { open?: boolean; peer?: string } = {}) {
  const { open = true, peer = 'REMOTE' } = opts;
  const handlers: Record<string, Handler[]> = {};
  const conn = {
    peer,
    open,
    send: vi.fn(),
    close: vi.fn(),
    on(event: string, cb: Handler) { (handlers[event] ||= []).push(cb); },
    emit(event: string, ...args: unknown[]) {
      if (event === 'open') conn.open = true;
      (handlers[event] || []).forEach(h => h(...args));
    },
  };
  return conn;
}

class FakePeer {
  private handlers: Record<string, Handler[]> = {};
  lastConn: ReturnType<typeof makeConn> | null = null;
  connectCalls: string[] = [];
  destroyed = false;
  on(event: string, cb: Handler) { (this.handlers[event] ||= []).push(cb); }
  emit(event: string, ...args: unknown[]) { (this.handlers[event] || []).forEach(h => h(...args)); }
  connect(id: string) {
    this.connectCalls.push(id);
    this.lastConn = makeConn({ peer: id, open: false });
    return this.lastConn;
  }
  destroy() { this.destroyed = true; }
}

async function setupOpenPeer(options?: PeerSyncOptions) {
  const fake = new FakePeer();
  const ps = new PeerSync(
    () => {},
    () => {},
    () => fake as unknown as Peer,
    options,
  );
  const ready = ps.initialize();
  fake.emit('open', 'ABCD');
  await ready;
  return { ps, fake };
}

const validHeartbeat = {
  type: 'heartbeat',
  masterTimecode: '00:00:00:00',
  masterTimestamp: 123,
  fps: 30,
  isDropFrame: false,
  isRunning: true,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('isSyncMessage — tightened field validation', () => {
  it('accepts a well-formed heartbeat', () => {
    expect(isSyncMessage(validHeartbeat)).toBe(true);
  });

  it('accepts a heartbeat without the optional isPaused field', () => {
    expect(isSyncMessage({ ...validHeartbeat, isPaused: undefined })).toBe(true);
  });

  it('rejects non-finite and wrongly-typed numeric master fields', () => {
    expect(isSyncMessage({ ...validHeartbeat, fps: '30' })).toBe(false);
    expect(isSyncMessage({ ...validHeartbeat, fps: NaN })).toBe(false);
    expect(isSyncMessage({ ...validHeartbeat, fps: Infinity })).toBe(false);
    expect(isSyncMessage({ ...validHeartbeat, masterTimestamp: '123' })).toBe(false);
    expect(isSyncMessage({ ...validHeartbeat, masterTimestamp: NaN })).toBe(false);
  });

  it('rejects a non-boolean isPaused instead of trusting truthiness', () => {
    expect(isSyncMessage({ ...validHeartbeat, isPaused: 'false' })).toBe(false);
    expect(isSyncMessage({ ...validHeartbeat, isPaused: 0 })).toBe(false);
    expect(isSyncMessage({ ...validHeartbeat, isPaused: false })).toBe(true);
  });

  it('rejects non-finite optional timestamps/telemetry when present', () => {
    const resp = { ...validHeartbeat, type: 'sync-response', clientTimestamp: performance.now() };
    expect(isSyncMessage(resp)).toBe(true);
    expect(isSyncMessage({ ...resp, clientTimestamp: 'soon' })).toBe(false);
    expect(isSyncMessage({ ...resp, clientTimestamp: NaN })).toBe(false);
    expect(isSyncMessage({ type: 'sync-request', clientTimestamp: Infinity })).toBe(false);
    expect(isSyncMessage({ type: 'report', rtt: NaN })).toBe(false);
    expect(isSyncMessage({ type: 'report', drift: 'x' })).toBe(false);
    expect(isSyncMessage({ type: 'report' })).toBe(true);
  });
});

describe('PeerSync.sendTo', () => {
  it('sends only to open connections belonging to the target peer', async () => {
    const { ps, fake } = await setupOpenPeer();
    const connA = makeConn({ peer: 'CLIENTA', open: true });
    const connB = makeConn({ peer: 'CLIENTB', open: true });
    fake.emit('connection', connA);
    fake.emit('connection', connB);

    const msg: SyncMessage = { type: 'report', rtt: 10, drift: 0 };
    ps.sendTo('CLIENTA', msg);

    expect(connA.send).toHaveBeenCalledTimes(1);
    expect(connB.send).not.toHaveBeenCalled();
  });

  it('skips closed connections even for the right peer', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ peer: 'CLIENTA', open: false });
    fake.emit('connection', conn);

    ps.sendTo('CLIENTA', { type: 'report' });
    expect(conn.send).not.toHaveBeenCalled();
  });
});

describe('PeerSync acceptInboundConnections', () => {
  it('closes and ignores inbound connections when disabled (client role)', async () => {
    const { ps, fake } = await setupOpenPeer({ acceptInboundConnections: false });
    const conn = makeConn({ peer: 'STRANGER', open: true });
    fake.emit('connection', conn);

    expect(conn.close).toHaveBeenCalled();
    // Never registered — send() must not reach it.
    ps.send({ type: 'report' });
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('still accepts inbound connections by default (master role)', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ peer: 'CLIENTA', open: true });
    fake.emit('connection', conn);

    expect(conn.close).not.toHaveBeenCalled();
    ps.send({ type: 'report' });
    expect(conn.send).toHaveBeenCalledTimes(1);
  });
});

describe('PeerSync onConnectionChange', () => {
  it('reports open then close per peer', async () => {
    const events: Array<[boolean, string]> = [];
    const { fake } = await setupOpenPeer({
      onConnectionChange: (connected, peerId) => events.push([connected, peerId]),
    });
    const conn = makeConn({ peer: 'CLIENTA', open: false });
    fake.emit('connection', conn);
    conn.emit('open');
    conn.emit('close');

    expect(events).toEqual([[true, 'CLIENTA'], [false, 'CLIENTA']]);
  });

  it('does not report close while another open conn to the same peer remains', async () => {
    const events: Array<[boolean, string]> = [];
    const { fake } = await setupOpenPeer({
      onConnectionChange: (connected, peerId) => events.push([connected, peerId]),
    });
    const conn1 = makeConn({ peer: 'CLIENTA', open: false });
    const conn2 = makeConn({ peer: 'CLIENTA', open: false });
    fake.emit('connection', conn1);
    fake.emit('connection', conn2);
    // Real DataConnections always emit 'open' before they can close.
    conn1.emit('open');
    conn2.emit('open');
    conn1.emit('close');

    // conn2 still open → no false event yet.
    expect(events.filter(([c]) => c === false)).toHaveLength(0);
    conn2.emit('close');
    expect(events.filter(([c]) => c === false)).toHaveLength(1);
  });

  it('does not report a close transition for a conn that never opened', async () => {
    const events: Array<[boolean, string]> = [];
    const { fake } = await setupOpenPeer({
      onConnectionChange: (connected, peerId) => events.push([connected, peerId]),
    });
    const conn = makeConn({ peer: 'GHOST', open: false });
    fake.emit('connection', conn);
    conn.emit('close'); // dies in signaling/ICE limbo — never opened

    expect(events).toEqual([]);
  });
});

describe('PeerSync.connect() stuck-connection reap', () => {
  it('replaces a DataConnection stuck pre-open so retries are not deduped away', async () => {
    vi.useFakeTimers();
    const { ps, fake } = await setupOpenPeer();

    ps.connect('TARGET');
    expect(fake.connectCalls).toEqual(['TARGET']);

    // Still pending — a second connect() inside the timeout dedupes.
    ps.connect('TARGET');
    expect(fake.connectCalls).toEqual(['TARGET']);

    // Past the timeout the zombie conn is reaped and a fresh one dialed.
    await vi.advanceTimersByTimeAsync(PENDING_CONNECT_TIMEOUT_MS + 1);
    ps.connect('TARGET');
    expect(fake.connectCalls).toEqual(['TARGET', 'TARGET']);
  });

  it('does not reap a conn that is merely slow but inside the timeout', async () => {
    vi.useFakeTimers();
    const { ps, fake } = await setupOpenPeer();

    ps.connect('TARGET');
    await vi.advanceTimersByTimeAsync(PENDING_CONNECT_TIMEOUT_MS - 1);
    ps.connect('TARGET');
    expect(fake.connectCalls).toEqual(['TARGET']);
  });
});
