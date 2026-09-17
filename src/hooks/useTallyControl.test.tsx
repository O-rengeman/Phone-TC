import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTallyControl } from './useTallyControl';
import type { PeerSync } from '../utils/PeerSync';
import type { TallyPayload } from '../utils/tally';

// vi.mock factories are hoisted above regular const declarations — anything
// referenced inside one must be created via vi.hoisted() or the factory
// closes over a stale/undefined binding.
const { setTorch, isNativePlatform } = vi.hoisted(() => ({
  setTorch: vi.fn<(...args: unknown[]) => Promise<undefined>>(() => Promise.resolve(undefined)),
  isNativePlatform: vi.fn(() => true), // native by default: skips the web getUserMedia fallback
}));

vi.mock('../utils/TimecodeNativeBridge', () => ({
  TimecodeNativeBridge: { setTorch: (...args: unknown[]) => setTorch(...args) },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

function makePeerSyncRef() {
  return { current: { broadcast: vi.fn() } as unknown as PeerSync };
}

function makeParams(overrides: Partial<Parameters<typeof useTallyControl>[0]> = {}) {
  return {
    isHost: true,
    isRunning: false,
    p2pRole: 'master' as const,
    peerId: 'SELF',
    peerSyncRef: makePeerSyncRef(),
    lastHeartbeatTimeRef: { current: 0 },
    nowTick: 0,
    cameraLabels: {},
    currentTcRef: { current: '00:00:10:00' },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  isNativePlatform.mockReturnValue(true);
  setTorch.mockClear();
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTallyControl.tallyState derivation', () => {
  it('is off by default when not connected and no manual state is set', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));
    expect(result.current.tallyState).toBe('off');
  });

  it('uses the manual state when standalone', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));
    act(() => result.current.handleManualTallyChange('live'));
    expect(result.current.tallyState).toBe('live');
  });

  it('prefers the connected payload over the local manual state', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({
      p2pRole: 'client', isHost: false, peerId: 'CAM1', nowTick: 1000, lastHeartbeatTimeRef: { current: 500 },
    })));
    act(() => result.current.handleManualTallyChange('live'));
    act(() => {
      result.current.setTallyPayload({ rev: 1, all: 'standby', assignments: { CAM1: 'preview' } });
    });

    expect(result.current.tallyState).toBe('preview');
  });

  it('uses the local manual state when connected but no payload exists yet', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({
      p2pRole: 'client', isHost: false, nowTick: 1000, lastHeartbeatTimeRef: { current: 500 },
    })));
    act(() => result.current.handleManualTallyChange('preview'));
    expect(result.current.tallyState).toBe('preview');
    expect(result.current.manualTally).toBe('preview');
  });

  it('is connected and reads the assigned per-camera state when a fresh payload exists', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({
      p2pRole: 'client', isHost: false, peerId: 'CAM1', nowTick: 1000, lastHeartbeatTimeRef: { current: 500 },
    })));
    act(() => {
      result.current.setTallyPayload({ rev: 1, all: 'standby', assignments: { CAM1: 'preview' } });
    });
    expect(result.current.isTallyConnected).toBe(true);
    expect(result.current.tallyState).toBe('preview');
  });

  it('is not connected once the heartbeat timeout has elapsed', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({
      p2pRole: 'client', isHost: false, nowTick: 10000, lastHeartbeatTimeRef: { current: 0 },
    })));
    expect(result.current.isTallyConnected).toBe(false);
  });
});

describe('useTallyControl broadcasts only from explicit tally actions', () => {
  it('does not broadcast when not host', () => {
    const peerSyncRef = makePeerSyncRef();
    renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: false })));
    expect(peerSyncRef.current.broadcast).not.toHaveBeenCalled();
  });
});

describe('useTallyControl tally-change handlers', () => {
  it('handleManualTallyChange updates manualTally and broadcasts only when host', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: false })));

    act(() => result.current.handleManualTallyChange('live'));
    expect(result.current.manualTally).toBe('live');
    expect(peerSyncRef.current.broadcast).not.toHaveBeenCalled();
  });

  it('handleManualTallyChange broadcasts a fresh payload when host', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: true })));

    act(() => result.current.handleManualTallyChange('preview'));

    expect(result.current.tallyPayload).toMatchObject({ all: 'preview', assignments: {} });
    expect(peerSyncRef.current.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tally', isRunning: false, tally: expect.objectContaining({ all: 'preview' }) as unknown as TallyPayload,
    }));
  });

  it('handleClientTallyChange assigns per-client state, broadcasts, and logs the action', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({
      peerSyncRef, isHost: true, cameraLabels: { CAM1: 'Camera A' }, currentTcRef: { current: '00:00:20:00' },
    })));

    act(() => result.current.handleClientTallyChange('CAM1', 'live'));

    expect(result.current.tallyPayload?.assignments).toEqual({ CAM1: 'live' });
    expect(result.current.tallyActionLog[0]).toMatchObject({ time: '00:00:20:00', cam: 'Camera A', state: 'live' });
    expect(peerSyncRef.current.broadcast).toHaveBeenCalled();
  });

  it('handleClientTallyChange maps standby to the "preview" action-log label', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ isHost: true })));
    act(() => result.current.handleClientTallyChange('CAM2', 'standby'));
    expect(result.current.tallyActionLog[0].state).toBe('preview');
  });

  it('handleClientTallyChange falls back to a truncated id when no camera label exists', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ isHost: true, cameraLabels: {} })));
    act(() => result.current.handleClientTallyChange('ABCDEFGH', 'off'));
    expect(result.current.tallyActionLog[0].cam).toBe('ABCDEF');
  });

  it('handleClientTallyChange is a no-op when not host', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: false })));
    act(() => result.current.handleClientTallyChange('CAM1', 'live'));
    expect(result.current.tallyPayload).toBeNull();
    expect(peerSyncRef.current.broadcast).not.toHaveBeenCalled();
  });

  it('handleAllTallyChange sets both manualTally and the broadcast payload, host-only', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ isHost: false })));
    act(() => result.current.handleAllTallyChange('live'));
    expect(result.current.manualTally).toBe('off'); // no-op: not host

    const { result: hostResult } = renderHook(() => useTallyControl(makeParams({ isHost: true })));
    act(() => hostResult.current.handleAllTallyChange('live'));
    expect(hostResult.current.manualTally).toBe('live');
    expect(hostResult.current.tallyPayload).toMatchObject({ all: 'live' });
  });

  it('handleSwitcherBusChange broadcasts program and preview assignments atomically', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({
      peerSyncRef,
      cameraLabels: { CAM1: 'Wide', CAM2: 'Close' },
    })));

    act(() => result.current.handleSwitcherBusChange('CAM1', 'CAM2'));

    expect(result.current.tallyPayload).toMatchObject({
      all: 'off',
      assignments: { CAM1: 'live', CAM2: 'preview' },
    });
    expect(peerSyncRef.current.broadcast).toHaveBeenCalledTimes(1);
    expect(result.current.tallyActionLog.slice(0, 2)).toEqual([
      expect.objectContaining({ cam: 'Wide', state: 'live' }),
      expect.objectContaining({ cam: 'Close', state: 'preview' }),
    ]);
  });

  it('handleSwitcherBusChange avoids assigning preview twice when both buses match', () => {
    const { result } = renderHook(() => useTallyControl(makeParams()));

    act(() => result.current.handleSwitcherBusChange('CAM1', 'CAM1'));

    expect(result.current.tallyPayload?.assignments).toEqual({ CAM1: 'live' });
  });
});

describe('useTallyControl UI helpers', () => {
  it('handleDimmerCycle cycles 0 -> 0.5 -> 0.85 -> 0', () => {
    const { result } = renderHook(() => useTallyControl(makeParams()));
    const stopPropagation = vi.fn();
    const evt = { stopPropagation } as unknown as React.MouseEvent;

    expect(result.current.tallyDimmerOpacity).toBe(0);
    act(() => result.current.handleDimmerCycle(evt));
    expect(result.current.tallyDimmerOpacity).toBe(0.5);
    act(() => result.current.handleDimmerCycle(evt));
    expect(result.current.tallyDimmerOpacity).toBe(0.85);
    act(() => result.current.handleDimmerCycle(evt));
    expect(result.current.tallyDimmerOpacity).toBe(0);
    expect(stopPropagation).toHaveBeenCalledTimes(3);
  });

  it('handleTorchToggle flips tallyTorchEnabled', () => {
    const { result } = renderHook(() => useTallyControl(makeParams()));
    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.handleTorchToggle(evt));
    expect(result.current.tallyTorchEnabled).toBe(true);
  });

  it('handleTallyExit closes the fullscreen tally view', () => {
    const { result } = renderHook(() => useTallyControl(makeParams()));
    act(() => result.current.setTallyOpen(true));
    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.handleTallyExit(evt));
    expect(result.current.tallyOpen).toBe(false);
  });

  it('persists tallyTcSize to localStorage and restores it on next mount', () => {
    const { result, unmount } = renderHook(() => useTallyControl(makeParams()));
    act(() => result.current.setTallyTcSize('lg'));
    expect(localStorage.getItem('ltc-tally-tc-size')).toBe('lg');
    unmount();

    const { result: second } = renderHook(() => useTallyControl(makeParams()));
    expect(second.current.tallyTcSize).toBe('lg');
  });
});

describe('useTallyControl torch effect', () => {
  it('invokes the native bridge torch call when tallyTorchEnabled and tallyState is live', async () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));

    await act(async () => {
      result.current.handleManualTallyChange('live');
      result.current.setTallyTorchEnabled(true);
      await Promise.resolve();
    });

    await act(async () => { await Promise.resolve(); });
    expect(setTorch).toHaveBeenCalledWith(true);
  });

  it('turns the torch off when tallyState is not live', async () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));

    await act(async () => {
      result.current.setTallyTorchEnabled(true);
      await Promise.resolve();
    });

    expect(setTorch).toHaveBeenCalledWith(false);
  });

  it('falls back to a generic camera when rear camera selection is unavailable on web', async () => {
    isNativePlatform.mockReturnValue(false);
    const applyConstraints = vi.fn(() => Promise.resolve());
    const stop = vi.fn();
    const fallbackTrack = { applyConstraints, stop } as unknown as MediaStreamTrack;
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException('Requested device not found', 'NotFoundError'))
      .mockResolvedValueOnce({
        getVideoTracks: () => [fallbackTrack],
      });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));

    await act(async () => {
      result.current.handleManualTallyChange('live');
      result.current.setTallyTorchEnabled(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      video: true,
      audio: false,
    });
    expect(applyConstraints).toHaveBeenCalled();
  });

  it('persists tallyStyle and tallyBorderSize to localStorage and restores them on next mount', () => {
    localStorage.setItem('ltc-tally-style', 'border');
    localStorage.setItem('ltc-tally-border-size', 'thick');

    const { result, unmount } = renderHook(() => useTallyControl(makeParams()));
    expect(result.current.tallyStyle).toBe('border');
    expect(result.current.tallyBorderSize).toBe('thick');

    act(() => {
      result.current.setTallyStyle('full');
      result.current.setTallyBorderSize('thin');
    });

    expect(localStorage.getItem('ltc-tally-style')).toBe('full');
    expect(localStorage.getItem('ltc-tally-border-size')).toBe('thin');

    unmount();
  });
});
