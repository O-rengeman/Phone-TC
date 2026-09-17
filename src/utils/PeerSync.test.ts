import { describe, it, expect, vi, afterEach } from 'vitest';
import { PeerSync, PEER_ID_RETRY_LIMIT, SIGNALING_RECONNECT_LIMIT } from './PeerSync';
import type { SyncMessage } from './PeerSync';
import type { Peer } from 'peerjs';

type Handler = (...args: unknown[]) => void;

// Minimal controllable fakes so tests drive the real PeerSync code paths
// (initialize -> 'open' -> 'connection' -> handleConnection -> send) without a
// network or the global PeerJS CDN object.
function makeConn(opts: { open?: boolean; peer?: string; label?: string } = {}) {
  const { open = true, peer = 'REMOTE', label } = opts;
  const handlers: Record<string, Handler[]> = {};
  const conn = {
    peer,
    label,
    open,
    send: vi.fn(),
    close: vi.fn(),
    on(event: string, cb: Handler) { (handlers[event] ||= []).push(cb); },
    emit(event: string, ...args: unknown[]) {
      // Mirrors real PeerJS: `.open` flips true once the 'open' event fires.
      if (event === 'open') conn.open = true;
      (handlers[event] || []).forEach(h => h(...args));
    },
  };
  return conn;
}

class FakePeer {
  private handlers: Record<string, Handler[]> = {};
  lastConn: ReturnType<typeof makeConn> | null = null;
  connectCalls: Array<{ id: string; options?: { label?: string; reliable?: boolean } }> = [];
  destroyed = false;
  // Mirrors real PeerJS: `disconnected` flips true when the signaling socket
  // drops, and reconnect() re-dials it with the same id.
  disconnected = false;
  reconnectCalls = 0;
  on(event: string, cb: Handler) { (this.handlers[event] ||= []).push(cb); }
  emit(event: string, ...args: unknown[]) { (this.handlers[event] || []).forEach(h => h(...args)); }
  connect(id: string, options?: { label?: string; reliable?: boolean }) {
    this.connectCalls.push({ id, options });
    // Mirrors real PeerJS: a freshly-created DataConnection isn't `.open`
    // until its 'open' event fires.
    this.lastConn = makeConn({ peer: id, label: options?.label, open: false });
    return this.lastConn;
  }
  reconnect() { this.reconnectCalls += 1; }
  destroy() { this.destroyed = true; }
}

/** Build a PeerSync wired to a controllable FakePeer, returning both. */
async function setupOpenPeer() {
  const fake = new FakePeer();
  const statuses: string[] = [];
  const messages: SyncMessage[] = [];
  const ps = new PeerSync(
    (msg) => messages.push(msg),
    (status) => statuses.push(status),
    () => fake as unknown as Peer,
  );
  const ready = ps.initialize();
  fake.emit('open', 'ABCD');
  await ready;
  return { ps, fake, statuses, messages };
}

const mockMsg: SyncMessage = {
  type: 'heartbeat',
  masterTimecode: '00:00:00:00',
  masterTimestamp: 123,
  fps: 30,
  isDropFrame: false,
  isRunning: true,
};

describe('PeerSync.setLossRate', () => {
  it('clamps negative value to 0', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(-0.5);
    expect(ps.getLossRate()).toBe(0);
  });

  it('clamps value greater than 1 to 1', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(2);
    expect(ps.getLossRate()).toBe(1);
  });

  it('keeps a mid-range value unchanged', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(0.5);
    expect(ps.getLossRate()).toBe(0.5);
  });
});

describe('PeerSync.initialize', () => {
  it('resolves with the peer id and reports READY status', async () => {
    const { statuses } = await setupOpenPeer();
    expect(statuses.some(s => s.includes('READY'))).toBe(true);
  });
});

describe('PeerSync.send', () => {
  it('always sends to an open connection when lossRate is 0', async () => {
    // Math.random() >= 0 is always true, so every message goes through.
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ open: true });
    fake.emit('connection', conn);
    ps.setLossRate(0);

    for (let i = 0; i < 10; i++) ps.send(mockMsg);

    expect(conn.send).toHaveBeenCalledTimes(10);
  });

  it('never sends when lossRate is 1', async () => {
    // Math.random() is in [0, 1), so Math.random() >= 1 is always false.
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ open: true });
    fake.emit('connection', conn);
    ps.setLossRate(1);

    for (let i = 0; i < 10; i++) ps.send(mockMsg);

    expect(conn.send).not.toHaveBeenCalled();
  });

  it('skips connections that are not open', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ open: false });
    fake.emit('connection', conn);
    ps.setLossRate(0);

    ps.send(mockMsg);

    expect(conn.send).not.toHaveBeenCalled();
  });
});

describe('PeerSync data handling', () => {
  it('tags incoming data with the sender peer id and forwards it', async () => {
    const { fake, messages } = await setupOpenPeer();
    const conn = makeConn({ open: true });
    fake.emit('connection', conn);

    conn.emit('data', { ...mockMsg, type: 'sync-request' });

    expect(messages).toHaveLength(1);
    expect(messages[0].clientId).toBe('REMOTE');
    expect(messages[0].type).toBe('sync-request');
  });

  it('forwards non sync-request messages directly', async () => {
    const { fake, messages } = await setupOpenPeer();
    const conn = makeConn({ open: true });
    fake.emit('connection', conn);

    conn.emit('data', { ...mockMsg, type: 'report' });

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('report');
  });
});

describe('PeerSync connection lifecycle', () => {
  it('connect() registers an outgoing connection that send() reaches', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.connect('TARGET');
    const conn = fake.lastConn!;
    conn.emit('open');
    ps.send(mockMsg);
    expect(conn.send).toHaveBeenCalledTimes(1);
  });

  it('removes a connection once it closes', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ open: true });
    fake.emit('connection', conn);
    conn.emit('open');   // exercises the open handler/status path
    conn.emit('close');  // should drop it from the active list
    ps.send(mockMsg);
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('destroy() tears down the underlying peer', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.destroy();
    expect(fake.destroyed).toBe(true);
  });

  it('connect() is a no-op before initialize', () => {
    const ps = new PeerSync(() => {}, () => {});
    expect(() => ps.connect('TARGET')).not.toThrow();
  });
});

const offerMsg: SyncMessage = {
  type: 'webrtc-offer',
  masterTimecode: '00:00:00:00',
  masterTimestamp: 0,
  fps: 30,
  isDropFrame: false,
  isRunning: false,
  sdp: { type: 'offer', sdp: 'fake-sdp' },
};

describe('PeerSync signaling channel', () => {
  it('sendTo() lazily opens a labeled, reliable connection for webrtc-* messages', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg);

    expect(fake.connectCalls).toHaveLength(1);
    expect(fake.connectCalls[0]).toMatchObject({ id: 'TARGET', options: { label: 'webrtc-signal', reliable: true } });
  });

  it('reuses the same signaling connection across repeated sendTo() calls to the same target', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg);
    ps.sendTo('TARGET', { ...offerMsg, type: 'webrtc-candidate' });

    expect(fake.connectCalls).toHaveLength(1);
  });

  it('queues an outbound signaling message until the connection opens, then flushes it', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg);
    const conn = fake.lastConn!;

    expect(conn.send).not.toHaveBeenCalled();
    conn.emit('open');
    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'webrtc-offer' }));
  });

  it('does not gate signaling sends behind the simulated loss rate', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.setLossRate(1);
    ps.sendTo('TARGET', offerMsg);
    const conn = fake.lastConn!;
    conn.open = true;

    ps.sendTo('TARGET', { ...offerMsg, type: 'webrtc-candidate' });
    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'webrtc-candidate' }));
  });

  it('leaves plain sendTo() traffic on the regular unreliable connection, unaffected by signaling', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn({ open: true, peer: 'TARGET' });
    fake.emit('connection', conn);
    ps.setLossRate(0);

    ps.sendTo('TARGET', mockMsg);

    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'heartbeat' }));
    // No signaling connection should have been created for a non-webrtc-* message.
    expect(fake.connectCalls).toHaveLength(0);
  });

  it('routes inbound data on a labeled connection to onSignalingCallback, not the regular message/connections path', async () => {
    const fake = new FakePeer();
    const messages: SyncMessage[] = [];
    const signalingMessages: SyncMessage[] = [];
    const ps = new PeerSync(
      (msg) => messages.push(msg),
      () => {},
      () => fake as unknown as Peer,
      (msg) => signalingMessages.push(msg),
    );
    const ready = ps.initialize();
    fake.emit('open', 'ABCD');
    await ready;

    const conn = makeConn({ open: true, peer: 'REMOTE', label: 'webrtc-signal' });
    fake.emit('connection', conn);
    conn.emit('data', { ...offerMsg });

    expect(signalingMessages).toHaveLength(1);
    expect(messages).toHaveLength(0);

    // Regular send() must not reach the signaling-only connection.
    ps.send(mockMsg);
    expect(conn.send).not.toHaveBeenCalled();
  });

  it('drops a closed signaling connection so the next sendTo() creates a fresh one', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg);
    const firstConn = fake.lastConn!;
    firstConn.emit('close');

    ps.sendTo('TARGET', offerMsg);
    expect(fake.connectCalls).toHaveLength(2);
  });

  it('clears a queued message if the connection closes before ever opening', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg); // queued: firstConn never opens
    const firstConn = fake.lastConn!;
    firstConn.emit('close');

    ps.sendTo('TARGET', { ...offerMsg, type: 'webrtc-candidate' });
    const secondConn = fake.lastConn!;
    secondConn.emit('open');

    // Only the second (post-close) message should flush — the stale queued
    // offer from the connection that never opened must not leak through.
    expect(secondConn.send).toHaveBeenCalledTimes(1);
    expect(secondConn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'webrtc-candidate' }));
  });

  it('clears a queued message if the connection errors before ever opening', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg); // queued: firstConn never opens
    const firstConn = fake.lastConn!;
    firstConn.emit('error', new Error('connection failed'));

    ps.sendTo('TARGET', { ...offerMsg, type: 'webrtc-candidate' });
    const secondConn = fake.lastConn!;
    secondConn.emit('open');

    expect(secondConn.send).toHaveBeenCalledTimes(1);
    expect(secondConn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'webrtc-candidate' }));
  });

  it('a stale connection\'s delayed/duplicate close does not wipe a newer connection\'s queue', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg);
    const firstConn = fake.lastConn!;
    firstConn.emit('close'); // discards firstConn and its queue, as normal

    ps.sendTo('TARGET', { ...offerMsg, type: 'webrtc-candidate' });
    const secondConn = fake.lastConn!;

    // A duplicate/delayed 'close' for the already-discarded firstConn must
    // not touch secondConn's still-pending queue, since secondConn — not
    // firstConn — is now the registered connection for this peer.
    firstConn.emit('close');
    secondConn.emit('open');

    expect(secondConn.send).toHaveBeenCalledTimes(1);
    expect(secondConn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'webrtc-candidate' }));
  });

  it('destroy() closes all open signaling connections', async () => {
    const { ps, fake } = await setupOpenPeer();
    ps.sendTo('TARGET', offerMsg);
    const conn = fake.lastConn!;

    ps.destroy();
    expect(conn.close).toHaveBeenCalled();
  });
});

/**
 * Builds a PeerSync whose factory hands out a fresh FakePeer per call, so the
 * id-collision retry path (which recreates the Peer) is observable.
 */
function setupWithPeerQueue() {
  const peers: FakePeer[] = [];
  const statuses: string[] = [];
  const ps = new PeerSync(
    () => {},
    (status) => statuses.push(status),
    () => {
      const fake = new FakePeer();
      peers.push(fake);
      return fake as unknown as Peer;
    },
  );
  return { ps, peers, statuses };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PeerSync short-id collisions', () => {
  it('redraws a fresh id and retries when the signaling server reports the id is taken', async () => {
    const { ps, peers } = setupWithPeerQueue();
    const ready = ps.initialize();

    peers[0].emit('error', { type: 'unavailable-id' });
    expect(peers).toHaveLength(2);
    expect(peers[0].destroyed).toBe(true);

    peers[1].emit('open', 'WXYZ');
    await expect(ready).resolves.toBe('WXYZ');
  });

  it('does not surface a collision as an error status while retries remain', async () => {
    const { ps, peers, statuses } = setupWithPeerQueue();
    const ready = ps.initialize();

    peers[0].emit('error', { type: 'unavailable-id' });
    peers[1].emit('open', 'WXYZ');
    await ready;

    expect(statuses.some(s => s.includes('ERROR'))).toBe(false);
  });

  it('gives up and rejects once the redraw limit is exhausted', async () => {
    const { ps, peers } = setupWithPeerQueue();
    const ready = ps.initialize();

    for (let i = 0; i <= PEER_ID_RETRY_LIMIT; i++) {
      peers[i].emit('error', { type: 'unavailable-id' });
    }

    await expect(ready).rejects.toMatchObject({ type: 'unavailable-id' });
    expect(peers).toHaveLength(PEER_ID_RETRY_LIMIT + 1);
  });

  it('does not redraw the id for a collision reported after the peer is already open', async () => {
    const { ps, peers, statuses } = setupWithPeerQueue();
    const ready = ps.initialize();
    peers[0].emit('open', 'ABCD');
    await ready;

    peers[0].emit('error', { type: 'unavailable-id' });

    expect(peers).toHaveLength(1);
    expect(statuses.some(s => s.includes('ERROR'))).toBe(true);
  });
});

describe('PeerSync signaling reconnect', () => {
  it('re-dials the signaling socket after it drops', async () => {
    vi.useFakeTimers();
    const { ps, fake, statuses } = await setupOpenPeer();

    fake.disconnected = true;
    fake.emit('disconnected');
    expect(statuses).toContain('RECONNECTING...');
    expect(fake.reconnectCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.reconnectCalls).toBe(1);
    void ps;
  });

  it('backs off exponentially instead of hammering at a fixed interval', async () => {
    vi.useFakeTimers();
    const { fake } = await setupOpenPeer();

    fake.disconnected = true;
    fake.emit('disconnected');

    // Base delay is 1s (±jitter), so a 2s window covers exactly one attempt;
    // the second is scheduled ~2s later and must not fire inside it.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.reconnectCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fake.reconnectCalls).toBe(2);
  });

  it('stops re-dialling and reports the loss once the attempt limit is reached', async () => {
    vi.useFakeTimers();
    const { fake, statuses } = await setupOpenPeer();

    fake.disconnected = true;
    fake.emit('disconnected');
    await vi.advanceTimersByTimeAsync(600_000);

    expect(fake.reconnectCalls).toBe(SIGNALING_RECONNECT_LIMIT);
    expect(statuses).toContain('ERROR: SIGNALING LOST');
  });

  it('resets the backoff once the socket comes back', async () => {
    vi.useFakeTimers();
    const { fake } = await setupOpenPeer();

    fake.disconnected = true;
    fake.emit('disconnected');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.reconnectCalls).toBe(1);

    // A successful re-dial emits 'open' again, which cancels the pending
    // retry so the connection isn't torn at by a stale timer.
    fake.disconnected = false;
    fake.emit('open', 'ABCD');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fake.reconnectCalls).toBe(1);

    // ...and the next drop starts again from the base delay.
    fake.disconnected = true;
    fake.emit('disconnected');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.reconnectCalls).toBe(2);
  });

  it('skips the re-dial if the socket recovered on its own before the timer fired', async () => {
    vi.useFakeTimers();
    const { fake } = await setupOpenPeer();

    fake.disconnected = true;
    fake.emit('disconnected');
    fake.disconnected = false;

    await vi.advanceTimersByTimeAsync(600_000);
    expect(fake.reconnectCalls).toBe(0);
  });

  it('destroy() cancels a pending reconnect', async () => {
    vi.useFakeTimers();
    const { ps, fake } = await setupOpenPeer();

    fake.disconnected = true;
    fake.emit('disconnected');
    ps.destroy();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(fake.reconnectCalls).toBe(0);
  });

  it('ignores a disconnect that arrives after destroy()', async () => {
    vi.useFakeTimers();
    const { ps, fake } = await setupOpenPeer();

    ps.destroy();
    fake.disconnected = true;
    fake.emit('disconnected');

    await vi.advanceTimersByTimeAsync(600_000);
    expect(fake.reconnectCalls).toBe(0);
  });
});

describe('PeerSync error handling', () => {
  it('rejects initialize and reports status when the peer errors', async () => {
    const fake = new FakePeer();
    const statuses: string[] = [];
    const ps = new PeerSync(() => {}, (s) => statuses.push(s), () => fake as unknown as Peer);
    const ready = ps.initialize();
    fake.emit('error', { type: 'network' });
    await expect(ready).rejects.toMatchObject({ type: 'network' });
    expect(statuses.some(s => s.includes('ERROR'))).toBe(true);
  });

  it('rejects initialize when the factory throws', async () => {
    const ps = new PeerSync(() => {}, () => {}, () => { throw new Error('no peerjs'); });
    await expect(ps.initialize()).rejects.toThrow('no peerjs');
  });
});
