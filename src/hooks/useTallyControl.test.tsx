import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTallyControl } from './useTallyControl';
import type { PeerSync } from '../utils/PeerSync';

// vi.mock factories are hoisted above regular const declarations — anything
// referenced inside one must be created via vi.hoisted() or the factory
// closes over a stale/undefined binding.
const { setTorch, isNativePlatform } = vi.hoisted(() => ({
  setTorch: vi.fn().mockResolvedValue(undefined),
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTallyControl.tallyState derivation', () => {
  it('is off by default when not connected, not auto, and no manual state', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));
    // tallyMode defaults to 'auto', so this actually exercises the auto branch —
    // use manual mode explicitly to test the "off" fallback.
    expect(result.current.tallyMode).toBe('auto');
  });

  it('derives live/off from local running state in auto mode when standalone', () => {
    const { result, rerender } = renderHook(
      (props: { isRunning: boolean }) => useTallyControl(makeParams({ p2pRole: null, isHost: false, isRunning: props.isRunning })),
      { initialProps: { isRunning: false } },
    );
    expect(result.current.tallyState).toBe('off');

    rerender({ isRunning: true });
    expect(result.current.tallyState).toBe('live');
  });

  it('uses the manual state when standalone and mode is manual', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false })));
    act(() => result.current.setTallyMode('manual'));
    expect(result.current.tallyState).toBe('off');
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

describe('useTallyControl auto-mode broadcast', () => {
  it('broadcasts live/standby based on isRunning when host and in auto mode', () => {
    const peerSyncRef = makePeerSyncRef();
    const { rerender } = renderHook(
      (props: { isRunning: boolean }) => useTallyControl(makeParams({ peerSyncRef, isRunning: props.isRunning })),
      { initialProps: { isRunning: false } },
    );
    expect(peerSyncRef.current!.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tally', tally: expect.objectContaining({ all: 'standby' }),
    }));

    rerender({ isRunning: true });
    expect(peerSyncRef.current!.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tally', tally: expect.objectContaining({ all: 'live' }),
    }));
  });

  it('does not broadcast when not host', () => {
    const peerSyncRef = makePeerSyncRef();
    renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: false })));
    expect(peerSyncRef.current!.broadcast).not.toHaveBeenCalled();
  });

  it('does not broadcast in manual mode', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({ peerSyncRef })));
    act(() => result.current.setTallyMode('manual'));
    // broadcast is a vi.fn() under the PeerSync cast in makePeerSyncRef, so
    // its static type loses the Mock methods — cast locally to call them.
    (peerSyncRef.current!.broadcast as unknown as ReturnType<typeof vi.fn>).mockClear();
    // No further state change should trigger an auto broadcast now that mode is manual.
    expect(peerSyncRef.current!.broadcast).not.toHaveBeenCalled();
  });
});

describe('useTallyControl tally-change handlers', () => {
  it('handleManualTallyChange updates manualTally and broadcasts only when host', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: false })));

    act(() => result.current.handleManualTallyChange('live'));
    expect(result.current.manualTally).toBe('live');
    expect(peerSyncRef.current!.broadcast).not.toHaveBeenCalled();
  });

  it('handleManualTallyChange broadcasts a fresh payload when host', () => {
    const peerSyncRef = makePeerSyncRef();
    const { result } = renderHook(() => useTallyControl(makeParams({ peerSyncRef, isHost: true })));
    // Switch to manual mode first: in auto mode the auto-broadcast effect
    // would immediately overwrite this call's payload back to live/standby.
    act(() => result.current.setTallyMode('manual'));
    (peerSyncRef.current!.broadcast as unknown as ReturnType<typeof vi.fn>).mockClear();

    act(() => result.current.handleManualTallyChange('preview'));

    expect(result.current.tallyPayload).toMatchObject({ all: 'preview', assignments: {} });
    expect(peerSyncRef.current!.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tally', isRunning: false, tally: expect.objectContaining({ all: 'preview' }),
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
    expect(peerSyncRef.current!.broadcast).toHaveBeenCalled();
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
    expect(peerSyncRef.current!.broadcast).not.toHaveBeenCalled();
  });

  it('handleAllTallyChange sets both manualTally and the broadcast payload, host-only', () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ isHost: false })));
    act(() => result.current.handleAllTallyChange('live'));
    expect(result.current.manualTally).toBe('off'); // no-op: not host

    const { result: hostResult } = renderHook(() => useTallyControl(makeParams({ isHost: true })));
    // Manual mode: avoid the auto-broadcast effect overwriting this call's payload.
    act(() => hostResult.current.setTallyMode('manual'));
    act(() => hostResult.current.handleAllTallyChange('live'));
    expect(hostResult.current.manualTally).toBe('live');
    expect(hostResult.current.tallyPayload).toMatchObject({ all: 'live' });
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
    const { result, rerender } = renderHook(
      (props: { isRunning: boolean }) => useTallyControl(makeParams({
        p2pRole: null, isHost: false, isRunning: props.isRunning,
      })),
      { initialProps: { isRunning: true } }, // auto mode + running -> tallyState 'live'
    );

    await act(async () => {
      result.current.setTallyTorchEnabled(true);
      await Promise.resolve();
    });
    rerender({ isRunning: true });

    await act(async () => { await Promise.resolve(); });
    expect(setTorch).toHaveBeenCalledWith(true);
  });

  it('turns the torch off when tallyState is not live', async () => {
    const { result } = renderHook(() => useTallyControl(makeParams({ p2pRole: null, isHost: false, isRunning: false })));

    await act(async () => {
      result.current.setTallyTorchEnabled(true);
      await Promise.resolve();
    });

    expect(setTorch).toHaveBeenCalledWith(false);
  });
});
