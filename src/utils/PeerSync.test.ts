import { describe, it, expect, vi } from 'vitest';
import { PeerSync } from './PeerSync';
import type { SyncMessage } from './PeerSync';
import type { Peer } from 'peerjs';

type Handler = (...args: unknown[]) => void;

// Minimal controllable fakes so tests drive the real PeerSync code paths
// (initialize -> 'open' -> 'connection' -> handleConnection -> send) without a
// network or the global PeerJS CDN object.
function makeConn(open = true) {
  const handlers: Record<string, Handler[]> = {};
  return {
    peer: 'REMOTE',
    open,
    send: vi.fn(),
    on(event: string, cb: Handler) { (handlers[event] ||= []).push(cb); },
    emit(event: string, ...args: unknown[]) { (handlers[event] || []).forEach(h => h(...args)); },
  };
}

class FakePeer {
  private handlers: Record<string, Handler[]> = {};
  lastConn: ReturnType<typeof makeConn> | null = null;
  destroyed = false;
  on(event: string, cb: Handler) { (this.handlers[event] ||= []).push(cb); }
  emit(event: string, ...args: unknown[]) { (this.handlers[event] || []).forEach(h => h(...args)); }
  connect() { this.lastConn = makeConn(); return this.lastConn; }
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
    const conn = makeConn(true);
    fake.emit('connection', conn);
    ps.setLossRate(0);

    for (let i = 0; i < 10; i++) ps.send(mockMsg);

    expect(conn.send).toHaveBeenCalledTimes(10);
  });

  it('never sends when lossRate is 1', async () => {
    // Math.random() is in [0, 1), so Math.random() >= 1 is always false.
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn(true);
    fake.emit('connection', conn);
    ps.setLossRate(1);

    for (let i = 0; i < 10; i++) ps.send(mockMsg);

    expect(conn.send).not.toHaveBeenCalled();
  });

  it('skips connections that are not open', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn(false);
    fake.emit('connection', conn);
    ps.setLossRate(0);

    ps.send(mockMsg);

    expect(conn.send).not.toHaveBeenCalled();
  });
});

describe('PeerSync data handling', () => {
  it('tags incoming data with the sender peer id and forwards it', async () => {
    const { fake, messages } = await setupOpenPeer();
    const conn = makeConn(true);
    fake.emit('connection', conn);

    conn.emit('data', { ...mockMsg, type: 'sync-request' });

    expect(messages).toHaveLength(1);
    expect(messages[0].clientId).toBe('REMOTE');
    expect(messages[0].type).toBe('sync-request');
  });

  it('forwards non sync-request messages directly', async () => {
    const { fake, messages } = await setupOpenPeer();
    const conn = makeConn(true);
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
    ps.send(mockMsg);
    expect(conn.send).toHaveBeenCalledTimes(1);
  });

  it('removes a connection once it closes', async () => {
    const { ps, fake } = await setupOpenPeer();
    const conn = makeConn(true);
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
