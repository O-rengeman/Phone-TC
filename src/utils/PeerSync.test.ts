import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { PeerSync } from './PeerSync';
import type { SyncMessage } from './PeerSync';

// PeerSync.ts declares `Peer` as a CDN global. Stub it so any accidental
// usage doesn't throw ReferenceError, and to satisfy the declare contract.
beforeAll(() => {
  vi.stubGlobal('Peer', vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    destroy: vi.fn(),
  })));
});

afterEach(() => {
  vi.clearAllMocks();
});

const mockMsg: SyncMessage = {
  type: 'heartbeat',
  masterTimecode: '00:00:00:00',
  masterTimestamp: Date.now(),
  fps: 30,
  isDropFrame: false,
  isRunning: true,
};

describe('PeerSync.setLossRate', () => {
  it('clamps negative value to 0', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(-0.5);
    expect((ps as any).lossRate).toBe(0);
  });

  it('clamps value greater than 1 to 1', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(2);
    expect((ps as any).lossRate).toBe(1);
  });

  it('keeps a mid-range value unchanged', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(0.5);
    expect((ps as any).lossRate).toBe(0.5);
  });
});

describe('PeerSync.send', () => {
  it('always sends when lossRate is 0', () => {
    // Math.random() >= 0 is always true, so every message goes through.
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(0);
    const conn = { open: true, send: vi.fn() };
    (ps as any).connections = [conn];

    for (let i = 0; i < 10; i++) ps.send(mockMsg);

    expect(conn.send).toHaveBeenCalledTimes(10);
  });

  it('never sends when lossRate is 1', () => {
    // Math.random() is in [0, 1), so Math.random() >= 1 is always false.
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(1);
    const conn = { open: true, send: vi.fn() };
    (ps as any).connections = [conn];

    for (let i = 0; i < 10; i++) ps.send(mockMsg);

    expect(conn.send).not.toHaveBeenCalled();
  });

  it('skips connections that are not open', () => {
    const ps = new PeerSync(() => {}, () => {});
    ps.setLossRate(0);
    const conn = { open: false, send: vi.fn() };
    (ps as any).connections = [conn];

    ps.send(mockMsg);

    expect(conn.send).not.toHaveBeenCalled();
  });
});
