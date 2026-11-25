import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useP2P } from './useP2P';
import type { Lang } from '../utils/i18n';

// vi.mock factories are hoisted above regular const declarations, so any
// mock fn referenced inside must itself be created via vi.hoisted() —
// otherwise the factory closes over stale/undefined bindings.
const { initialize, connect, destroy, setLossRate, setSessionPin, peerSyncInstances } = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<string>>().mockResolvedValue('PEER123'),
  connect: vi.fn<(id: string) => void>(),
  destroy: vi.fn<() => void>(),
  setLossRate: vi.fn<(rate: number) => void>(),
  setSessionPin: vi.fn<(pin: string) => void>(),
  // Every `new PeerSync(...)` pushes one entry here so tests can reach that
  // instance's constructor options (onConnectionChange) and per-instance
  // spies — the shared spies above still record calls across instances.
  peerSyncInstances: [] as Array<{
    initialize: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setLossRate: ReturnType<typeof vi.fn>;
    setSessionPin: ReturnType<typeof vi.fn>;
    options?: {
      acceptInboundConnections?: boolean;
      sessionPin?: string;
      onConnectionChange?: (connected: boolean, peerId: string) => void;
    };
  }>,
}));

vi.mock('../utils/PeerSync', () => ({
  // Arrow functions can't be invoked with `new` — PeerSync is constructed via
  // `new PeerSync(...)` in the hook, so the mock implementation must be a
  // regular function.
  PeerSync: vi.fn().mockImplementation(function (
    _onMessage: unknown,
    _onStatus: unknown,
    _peerFactory: unknown,
    options?: {
      acceptInboundConnections?: boolean;
      sessionPin?: string;
      onConnectionChange?: (connected: boolean, peerId: string) => void;
    },
  ) {
    const inst = {
      initialize: vi.fn(() => initialize()),
      connect: vi.fn((id: string) => connect(id)),
      destroy: vi.fn(() => destroy()),
      setLossRate: vi.fn((rate: number) => setLossRate(rate)),
      setSessionPin: vi.fn((pin: string) => setSessionPin(pin)),
      options,
    };
    peerSyncInstances.push(inst);
    return inst;
  }),
}));

/** The PeerSync instance created by the most recent setup call. */
function lastPeerSync() {
  return peerSyncInstances[peerSyncInstances.length - 1];
}

/** Fires PeerSync's onConnectionChange hook inside act(). */
function emitConnChange(connected: boolean, peerId: string) {
  const cb = lastPeerSync()?.options?.onConnectionChange;
  if (!cb) throw new Error('PeerSync was constructed without onConnectionChange');
  cb(connected, peerId);
}

function makeParams(overrides: Partial<Parameters<typeof useP2P>[0]> = {}) {
  return {
    syncMode: 'network' as const,
    setSyncMode: vi.fn(),
    p2pRole: null,
    setP2pRole: vi.fn(),
    isRunning: false,
    isPaused: false,
    langRef: { current: 'en' as Lang },
    addToast: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  initialize.mockClear().mockResolvedValue('PEER123');
  connect.mockClear();
  destroy.mockClear();
  setLossRate.mockClear();
  setSessionPin.mockClear();
  peerSyncInstances.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useP2P — thin state-transition coverage', () => {
  it('starts disconnected with no peer id', () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    expect(result.current.p2pStatus).toBe('P2P DISCONNECTED');
    expect(result.current.peerId).toBe('');
    expect(result.current.isHost).toBe(false);
    expect(result.current.lastP2pSyncTimeRef.current).toBe(0);
  });

  it('setupP2PMaster initializes a peer and marks this device as host', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));

    await act(async () => { await result.current.setupP2PMaster(); });

    expect(initialize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.peerId).toBe('PEER123'));
    expect(result.current.isHost).toBe(true);
  });

  it('setupP2PClient initializes a peer without host status and auto-connects when given an id', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));

    await act(async () => { await result.current.setupP2PClient('MASTERID'); });

    expect(result.current.isHost).toBe(false);
    expect(connect).toHaveBeenCalledWith('MASTERID');
    expect(result.current.targetId).toBe('MASTERID');
  });

  it('reports PEER INIT FAILED and toasts an error when initialize rejects', async () => {
    initialize.mockRejectedValueOnce(new Error('offline'));
    const addToast = vi.fn();
    const { result } = renderHook(() => useP2P(makeParams({ addToast })));

    await act(async () => { await result.current.setupP2PMaster(); });

    expect(result.current.p2pStatus).toBe('PEER INIT FAILED');
    expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('resetP2P destroys the peer and clears role/status', async () => {
    const setP2pRole = vi.fn();
    const { result } = renderHook(() => useP2P(makeParams({ setP2pRole })));
    await act(async () => { await result.current.setupP2PMaster(); });

    result.current.lastP2pSyncTimeRef.current = Date.now();
    act(() => result.current.setMasterDrift(0.01));
    act(() => result.current.resetP2P());

    expect(destroy).toHaveBeenCalled();
    expect(setP2pRole).toHaveBeenCalledWith(null);
    expect(result.current.p2pStatus).toBe('P2P RESET');
    expect(result.current.lastP2pSyncTimeRef.current).toBe(0);
    expect(result.current.masterDrift).toBeNull();
  });

  it('joinSession connects to the current targetId and switches syncMode to p2p', async () => {
    const setSyncMode = vi.fn();
    const { result } = renderHook(() => useP2P(makeParams({ setSyncMode })));
    await act(async () => { await result.current.setupP2PClient(); });
    act(() => result.current.setTargetId('REMOTEID'));

    act(() => result.current.joinSession());

    expect(connect).toHaveBeenCalledWith('REMOTEID');
    expect(setSyncMode).toHaveBeenCalledWith('p2p');
  });

  it('joinSession is a no-op without a peer or target id', () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    expect(() => act(() => result.current.joinSession())).not.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });

  it('clamps and forwards packetLossRate to the peer connection in DEV', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    await act(async () => { await result.current.setupP2PMaster(); });

    act(() => result.current.setPacketLossRate(0.25));

    // import.meta.env.DEV is true under vitest, so this should forward.
    expect(setLossRate).toHaveBeenCalledWith(0.25);
  });

  it('stops an active client when master heartbeats time out', () => {
    vi.useFakeTimers();
    const addToast = vi.fn();
    const onMasterHeartbeatTimeout = vi.fn();
    const { result } = renderHook(() => useP2P(makeParams({
      p2pRole: 'client',
      isRunning: true,
      addToast,
      onMasterHeartbeatTimeout,
    })));

    act(() => {
      result.current.lastMasterContactTimeRef.current = Date.now() - 5000;
    });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(result.current.p2pStatus).toBe('MASTER TIMEOUT');
    expect(onMasterHeartbeatTimeout).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith('MASTER LOST — CLIENT STOPPED', 'error');
  });

  it('re-links a dropped client connection without operator input', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient('MASTERID'); });
    connect.mockClear();

    // The link was established, then the DataConnection closed — the hook
    // learns both facts via PeerSync's onConnectionChange, not p2pStatus.
    act(() => emitConnChange(true, 'MASTERID'));
    act(() => emitConnChange(false, 'MASTERID'));
    act(() => { vi.advanceTimersByTime(2000); });

    expect(connect).toHaveBeenCalledWith('MASTERID');
    expect(result.current.p2pStatus).toBe('RECONNECTING...');
  });

  it('keeps re-linking when the status string changes mid-backoff (signaling flap)', async () => {
    // Regression: the old effect keyed off p2pStatus.includes('CLOSED'), so
    // a signaling 'disconnected' -> 'RECONNECTING...' status overwrote the
    // display string, cancelled the pending retry timer, and the dead
    // DataConnection was never re-dialed.
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient('MASTERID'); });
    connect.mockClear();

    act(() => emitConnChange(true, 'MASTERID'));
    act(() => emitConnChange(false, 'MASTERID'));

    // Signaling flap churns the display status while the conn stays dead —
    // none of this may cancel the scheduled re-link.
    act(() => result.current.setP2pStatus('RECONNECTING...'));
    act(() => result.current.setP2pStatus('READY: ID PEER123'));
    act(() => { vi.advanceTimersByTime(2000); });

    expect(connect).toHaveBeenCalledWith('MASTERID');
  });

  it('keeps retrying while the connection stays down instead of giving up after one attempt', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient('MASTERID'); });
    connect.mockClear();

    act(() => emitConnChange(true, 'MASTERID'));
    act(() => emitConnChange(false, 'MASTERID'));

    // First attempt fires, the conn never opens (no further events) — the
    // loop must schedule the next attempt on its own.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(connect).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(connect.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('spaces successive re-link attempts further apart', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient('MASTERID'); });
    connect.mockClear();

    act(() => emitConnChange(true, 'MASTERID'));
    act(() => emitConnChange(false, 'MASTERID'));

    // First attempt: base delay of 1.5s (±20% jitter) — fires inside 2s.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(connect).toHaveBeenCalledTimes(1);

    // The re-link failed and the connection closed again — the next attempt
    // must wait ~3s (grown backoff), not another ~1.5s base delay.
    act(() => emitConnChange(false, 'MASTERID'));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(connect).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('resets the re-link backoff after the connection comes back', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient('MASTERID'); });
    connect.mockClear();

    act(() => emitConnChange(true, 'MASTERID'));
    act(() => emitConnChange(false, 'MASTERID'));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(connect).toHaveBeenCalledTimes(1);

    // Link restored, then drops again — backoff restarts from the base delay.
    act(() => emitConnChange(true, 'MASTERID'));
    act(() => emitConnChange(false, 'MASTERID'));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('does not attempt to re-link before a master id has been entered', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient(); });
    connect.mockClear();

    act(() => emitConnChange(false, 'MASTERID'));
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(connect).not.toHaveBeenCalled();
  });

  it('does not auto-dial a typed-but-never-joined master id', async () => {
    // Typing an id is not consent to connect — only joinSession (LINK) or
    // the auto-join path marks the target as attempted.
    vi.useFakeTimers();
    const { result } = renderHook(() => useP2P(makeParams({ p2pRole: 'client' })));
    await act(async () => { await result.current.setupP2PClient(); });
    act(() => result.current.setTargetId('MASTERID'));
    connect.mockClear();

    act(() => { vi.advanceTimersByTime(60_000); });

    expect(connect).not.toHaveBeenCalled();
  });

  it('times out on stale master contact even when no heartbeat was recorded yet', () => {
    vi.useFakeTimers();
    const onMasterHeartbeatTimeout = vi.fn();
    const { result } = renderHook(() => useP2P(makeParams({
      p2pRole: 'client',
      isRunning: true,
      onMasterHeartbeatTimeout,
    })));

    act(() => {
      result.current.lastMasterContactTimeRef.current = Date.now() - 5000;
    });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(result.current.p2pStatus).toBe('MASTER TIMEOUT');
    expect(onMasterHeartbeatTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('useP2P — setup lifecycle (ghost-peer guard)', () => {
  it('discards a stale in-flight setup instead of installing a ghost peer', async () => {
    // Double-tap / reset-then-recreate while initialize() is still awaiting
    // the signaling 'open': the loser's late resolution must be destroyed,
    // not installed over the winner's peerSyncRef.
    const resolvers: Array<(id: string) => void> = [];
    initialize.mockImplementation(() => new Promise<string>((res) => { resolvers.push(res); }));
    const { result } = renderHook(() => useP2P(makeParams()));

    act(() => { void result.current.setupP2PMaster(); });
    act(() => { void result.current.setupP2PClient(); });
    expect(peerSyncInstances).toHaveLength(2);

    await act(async () => {
      resolvers[0]('GHOST1'); // stale master init lands first
      resolvers[1]('LIVE12'); // fresh client init lands second
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.peerId).toBe('LIVE12'));
    expect(peerSyncInstances[0].destroy).toHaveBeenCalledTimes(1);
    expect(peerSyncInstances[1].destroy).not.toHaveBeenCalled();
    expect(result.current.isP2PSetupPending).toBe(false);
  });

  it('resetP2P during in-flight setup prevents the late peer from being installed', async () => {
    let resolveInit: (id: string) => void = () => {};
    initialize.mockImplementationOnce(() => new Promise<string>((res) => { resolveInit = res; }));
    const { result } = renderHook(() => useP2P(makeParams()));

    act(() => { void result.current.setupP2PMaster(); });
    act(() => result.current.resetP2P());

    await act(async () => { resolveInit('GHOST1'); await Promise.resolve(); });

    await waitFor(() => expect(peerSyncInstances[0].destroy).toHaveBeenCalledTimes(1));
    expect(result.current.peerId).toBe('');
    expect(result.current.isP2PSetupPending).toBe(false);
  });

  it('reports isP2PSetupPending while initialize() is in flight and clears it after', async () => {
    let resolveInit: (id: string) => void = () => {};
    initialize.mockImplementationOnce(() => new Promise<string>((res) => { resolveInit = res; }));
    const { result } = renderHook(() => useP2P(makeParams()));

    expect(result.current.isP2PSetupPending).toBe(false);
    act(() => { void result.current.setupP2PMaster(); });
    expect(result.current.isP2PSetupPending).toBe(true);

    await act(async () => { resolveInit('PEER123'); await Promise.resolve(); });
    expect(result.current.isP2PSetupPending).toBe(false);
  });

  it('does not surface a stale setup failure over a newer setup', async () => {
    const resolvers: Array<(id: string) => void> = [];
    const rejects: Array<(e: unknown) => void> = [];
    initialize.mockImplementation(() => new Promise<string>((res, rej) => {
      resolvers.push(res);
      rejects.push(rej);
    }));
    const addToast = vi.fn();
    const { result } = renderHook(() => useP2P(makeParams({ addToast })));

    act(() => { void result.current.setupP2PMaster(); });
    act(() => { void result.current.setupP2PClient(); });

    await act(async () => {
      rejects[0](new Error('stale failure')); // loser's init fails late
      resolvers[1]('LIVE12');
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.peerId).toBe('LIVE12'));
    // The stale failure must not toast/clobber the live session's status.
    expect(addToast).not.toHaveBeenCalled();
    expect(result.current.p2pStatus).not.toBe('PEER INIT FAILED');
  });
});

describe('useP2P — PeerSync role options', () => {
  it('rejects inbound DataConnections for the client role', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    await act(async () => { await result.current.setupP2PClient(); });
    expect(lastPeerSync()?.options?.acceptInboundConnections).toBe(false);
  });

  it('accepts inbound DataConnections for the master role', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    await act(async () => { await result.current.setupP2PMaster(); });
    expect(lastPeerSync()?.options?.acceptInboundConnections).toBe(true);
  });
});

describe('useP2P — session PIN and client pruning (Issue #59)', () => {
  it('passes the PIN to the master PeerSync and applies it again on join', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    act(() => result.current.setSessionPin('1234'));
    await act(async () => { await result.current.setupP2PMaster(); });
    expect(lastPeerSync()?.options?.sessionPin).toBe('1234');

    const { result: client } = renderHook(() => useP2P(makeParams()));
    act(() => client.current.setSessionPin('9876'));
    await act(async () => { await client.current.setupP2PClient(); });
    act(() => client.current.setTargetId('WXYZ'));
    act(() => client.current.joinSession());
    expect(setSessionPin).toHaveBeenCalledWith('9876');
    expect(connect).toHaveBeenCalledWith('WXYZ');
  });

  it('prunes a client from the roster when its connection closes', async () => {
    const { result } = renderHook(() => useP2P(makeParams()));
    await act(async () => { await result.current.setupP2PMaster(); });
    act(() => result.current.setClients({ CL1: { rtt: 10, drift: 0, lastSeen: 1 }, CL2: { rtt: 20, drift: 0, lastSeen: 1 } }));
    act(() => emitConnChange(true, 'CL1'));
    expect(Object.keys(result.current.clients)).toEqual(['CL1', 'CL2']);
    act(() => emitConnChange(false, 'CL1'));
    expect(Object.keys(result.current.clients)).toEqual(['CL2']);
  });
});
