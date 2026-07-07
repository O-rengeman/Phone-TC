import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useP2P } from './useP2P';
import type { Lang } from '../utils/i18n';

// vi.mock factories are hoisted above regular const declarations, so any
// mock fn referenced inside must itself be created via vi.hoisted() —
// otherwise the factory closes over stale/undefined bindings.
const { initialize, connect, destroy, setLossRate } = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue('PEER123'),
  connect: vi.fn(),
  destroy: vi.fn(),
  setLossRate: vi.fn(),
}));

vi.mock('../utils/PeerSync', () => ({
  // Arrow functions can't be invoked with `new` — PeerSync is constructed via
  // `new PeerSync(...)` in the hook, so the mock implementation must be a
  // regular function.
  PeerSync: vi.fn().mockImplementation(function () {
    return { initialize, connect, destroy, setLossRate };
  }),
}));

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

    act(() => result.current.resetP2P());

    expect(destroy).toHaveBeenCalled();
    expect(setP2pRole).toHaveBeenCalledWith(null);
    expect(result.current.p2pStatus).toBe('P2P RESET');
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
      result.current.lastHeartbeatTimeRef.current = Date.now() - 5000;
    });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(result.current.p2pStatus).toBe('MASTER TIMEOUT');
    expect(onMasterHeartbeatTimeout).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith('MASTER LOST — CLIENT STOPPED', 'error');
  });
});
